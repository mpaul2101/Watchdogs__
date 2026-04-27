"""
Test manual pentru threshold_engine.

Inserteaza direct in DB scenarii controlate, ruleaza evaluate(),
si verifica ca alarmele/incidentele se creeaza corect.

Curata datele de test la final (server_id incepe cu 'TEST-').
"""

import sys
import psycopg2
from datetime import datetime, timedelta, timezone

from threshold_engine import evaluate
from handlers import DB_CONFIG


def _utcnow():
    """Naive UTC datetime, ca sa se potriveasca cu coloana TIMESTAMP without time zone."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def cleanup(conn):
    cur = conn.cursor()
    cur.execute("DELETE FROM alarms WHERE server_id LIKE 'TEST-%'")
    cur.execute("DELETE FROM incidents WHERE server_id LIKE 'TEST-%'")
    cur.execute("DELETE FROM metrics WHERE server_id LIKE 'TEST-%'")
    conn.commit()
    cur.close()


def insert_metric(conn, server_id, ts=None, **values):
    cur = conn.cursor()
    cols = ["server_id", "timestamp"] + list(values.keys())
    placeholders = ["%s"] * len(cols)
    params = [server_id, ts or _utcnow()] + list(values.values())
    cur.execute(
        f"INSERT INTO metrics ({','.join(cols)}) VALUES ({','.join(placeholders)})",
        params,
    )
    conn.commit()
    cur.close()


def count(conn, table, **where):
    cur = conn.cursor()
    clauses = " AND ".join(f"{k} = %s" for k in where)
    cur.execute(f"SELECT COUNT(*) FROM {table} WHERE {clauses}", list(where.values()))
    n = cur.fetchone()[0]
    cur.close()
    return n


def get_incident_severity(conn, server_id, metric_type):
    cur = conn.cursor()
    cur.execute(
        "SELECT severity FROM incidents WHERE server_id=%s AND metric_type=%s AND status='OPEN'",
        (server_id, metric_type),
    )
    row = cur.fetchone()
    cur.close()
    return row[0] if row else None


def test_instant_critic_creates_incident_and_alarm(conn):
    server = "TEST-instant"
    cleanup(conn)
    # RAM 96% e instant CRITIC (>95)
    insert_metric(conn, server, ram=96)
    evaluate(conn, server)

    inc = count(conn, "incidents", server_id=server, metric_type="RAM", status="OPEN")
    alm = count(conn, "alarms", server_id=server, metric_type="RAM")
    sev = get_incident_severity(conn, server, "RAM")
    assert inc == 1, f"asteptat 1 incident, gasit {inc}"
    assert alm == 1, f"asteptat 1 alarma, gasit {alm}"
    assert sev == "CRITIC", f"asteptat CRITIC, gasit {sev}"
    print("  [OK] instant CRITIC -> 1 incident + 1 alarma")


def test_dedup_no_new_incident_on_repeat(conn):
    server = "TEST-dedup"
    cleanup(conn)
    insert_metric(conn, server, ram=96)
    evaluate(conn, server)
    # repetam aceeasi conditie -> nu trebuie sa apara incident nou
    insert_metric(conn, server, ram=97)
    evaluate(conn, server)

    inc = count(conn, "incidents", server_id=server, metric_type="RAM", status="OPEN")
    alm = count(conn, "alarms", server_id=server, metric_type="RAM")
    assert inc == 1, f"asteptat 1 incident (dedup), gasit {inc}"
    assert alm == 1, f"asteptat 1 alarma (silent pe sustained), gasit {alm}"
    print("  [OK] dedup: severitate egala -> nicio alarma noua")


def test_escalation_bumps_severity(conn):
    server = "TEST-escal"
    cleanup(conn)
    # disk 86% -> MEDIUM (instant >85)
    insert_metric(conn, server, disk=86)
    evaluate(conn, server)
    sev1 = get_incident_severity(conn, server, "DISK")
    assert sev1 == "MEDIUM", f"asteptat MEDIUM initial, gasit {sev1}"

    # acum disk 96% -> CRITIC -> escaladare
    insert_metric(conn, server, disk=96)
    evaluate(conn, server)
    sev2 = get_incident_severity(conn, server, "DISK")
    inc = count(conn, "incidents", server_id=server, metric_type="DISK", status="OPEN")
    alm = count(conn, "alarms", server_id=server, metric_type="DISK")
    assert sev2 == "CRITIC", f"asteptat CRITIC dupa escaladare, gasit {sev2}"
    assert inc == 1, f"asteptat tot 1 incident, gasit {inc}"
    assert alm == 2, f"asteptat 2 alarme (initial + ESCALAT), gasit {alm}"
    print("  [OK] escaladare: MEDIUM -> CRITIC, +1 alarma, acelasi incident")


def test_below_threshold_does_nothing(conn):
    server = "TEST-quiet"
    cleanup(conn)
    insert_metric(conn, server, cpu=50, ram=60, disk=70)
    evaluate(conn, server)

    inc = count(conn, "incidents", server_id=server)
    alm = count(conn, "alarms", server_id=server)
    assert inc == 0 and alm == 0, f"sub praguri -> nimic; gasit inc={inc}, alm={alm}"
    print("  [OK] valori sub praguri -> niciun incident/alarma")


def test_sustained_window_requires_full_coverage(conn):
    server = "TEST-window"
    cleanup(conn)
    # CPU > 95% sustinut 5 min este CRITIC. Inseram doar o mostra recenta
    # cu CPU 99%. NU trebuie sa declanseze (fereastra nu e acoperita).
    insert_metric(conn, server, cpu=99)
    evaluate(conn, server)
    inc = count(conn, "incidents", server_id=server, metric_type="CPU")
    assert inc == 0, f"o singura mostra recenta -> nu declanseaza; gasit {inc}"
    print("  [OK] fereastra neacoperita -> nu declanseaza CPU CRITIC")

    # Acum inseram mostre care acopera 6 minute, toate peste 95%
    now = _utcnow()
    for sec_ago in range(360, 0, -4):  # 6 min, la 4s
        insert_metric(conn, server, ts=now - timedelta(seconds=sec_ago), cpu=99)
    evaluate(conn, server)
    sev = get_incident_severity(conn, server, "CPU")
    assert sev == "CRITIC", f"sustinut 6 min @ 99% -> CRITIC; gasit {sev}"
    print("  [OK] fereastra acoperita 6 min @99% -> CPU CRITIC")


def test_dip_in_window_blocks_trigger(conn):
    server = "TEST-dip"
    cleanup(conn)
    # 6 min de mostre la 99%, dar una in mijloc e 50% -> nu trebuie sa declanseze
    now = _utcnow()
    for sec_ago in range(360, 0, -4):
        cpu_val = 50 if sec_ago == 200 else 99
        insert_metric(conn, server, ts=now - timedelta(seconds=sec_ago), cpu=cpu_val)
    evaluate(conn, server)
    inc = count(conn, "incidents", server_id=server, metric_type="CPU")
    assert inc == 0, f"un dip rupe sustained-ul; asteptat 0, gasit {inc}"
    print("  [OK] dip in fereastra -> nu declanseaza")


def main():
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        tests = [
            test_instant_critic_creates_incident_and_alarm,
            test_dedup_no_new_incident_on_repeat,
            test_escalation_bumps_severity,
            test_below_threshold_does_nothing,
            test_sustained_window_requires_full_coverage,
            test_dip_in_window_blocks_trigger,
        ]
        for t in tests:
            print(f"\n>> {t.__name__}")
            t(conn)
        print("\n=== TOATE TESTELE AU TRECUT ===")
    except AssertionError as e:
        print(f"\n!!! TEST ESUAT: {e}")
        sys.exit(1)
    finally:
        cleanup(conn)
        conn.close()
        print("(curatat datele de test)")


if __name__ == "__main__":
    main()
