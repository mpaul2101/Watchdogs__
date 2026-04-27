"""
Motorul de evaluare a pragurilor pentru metrici.

Pentru fiecare mesaj nou primit prin MQTT, dupa salvarea in tabela `metrics`,
acest modul evalueaza regulile definite mai jos si decide:
  - daca trebuie creata o ALARMA noua (zgomot automat)
  - daca trebuie creat un INCIDENT nou (ticket pentru oameni)
  - daca un incident existent trebuie ESCALAT (severitate mai mare)

Logica de deduplicare: un singur incident OPEN per (server_id, metric_type).
Alarmele noi pentru aceeasi conditie sustinuta se ataseaza la incidentul existent.
"""

from typing import Optional


# --- DEFINITIA REGULILOR (din PDF) ---
# severity_rank: ordine numerica (mai mare = mai sever)
SEVERITY_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITIC": 4}

# Fiecare regula:
#   metric: numele coloanei din `metrics` (cpu, ram, disk, ...)
#   metric_type: eticheta folosita in alarms/incidents (CPU, RAM, ...)
#   severity: nivelul declansat
#   threshold: valoarea prag (>)
#   window_minutes: 0 = instant; >0 = trebuie sustinut peste prag toata fereastra
RULES = [
    # CPU
    {"metric": "cpu", "metric_type": "CPU", "severity": "CRITIC", "threshold": 95, "window_minutes": 5},
    {"metric": "cpu", "metric_type": "CPU", "severity": "HIGH",   "threshold": 90, "window_minutes": 10},
    {"metric": "cpu", "metric_type": "CPU", "severity": "MEDIUM", "threshold": 85, "window_minutes": 15},
    {"metric": "cpu", "metric_type": "CPU", "severity": "LOW",    "threshold": 75, "window_minutes": 30},

    # RAM
    {"metric": "ram", "metric_type": "RAM", "severity": "CRITIC", "threshold": 95, "window_minutes": 0},
    {"metric": "ram", "metric_type": "RAM", "severity": "HIGH",   "threshold": 90, "window_minutes": 5},
    {"metric": "ram", "metric_type": "RAM", "severity": "MEDIUM", "threshold": 85, "window_minutes": 15},
    {"metric": "ram", "metric_type": "RAM", "severity": "LOW",    "threshold": 80, "window_minutes": 0},

    # Disk (toate instant conform PDF)
    {"metric": "disk", "metric_type": "DISK", "severity": "CRITIC", "threshold": 95, "window_minutes": 0},
    {"metric": "disk", "metric_type": "DISK", "severity": "HIGH",   "threshold": 90, "window_minutes": 0},
    {"metric": "disk", "metric_type": "DISK", "severity": "MEDIUM", "threshold": 85, "window_minutes": 0},
    {"metric": "disk", "metric_type": "DISK", "severity": "LOW",    "threshold": 80, "window_minutes": 0},

    # Response time (HIGH instant, MEDIUM 2 min, LOW 5 min; CRITIC = ping pierdut, tratat separat)
    {"metric": "response_time_ms", "metric_type": "RESPONSE_TIME", "severity": "HIGH",   "threshold": 1000, "window_minutes": 0},
    {"metric": "response_time_ms", "metric_type": "RESPONSE_TIME", "severity": "MEDIUM", "threshold": 500,  "window_minutes": 2},
    {"metric": "response_time_ms", "metric_type": "RESPONSE_TIME", "severity": "LOW",    "threshold": 250,  "window_minutes": 5},

    # App / DB
    {"metric": "http_5xx_rate", "metric_type": "HTTP_5XX",      "severity": "CRITIC", "threshold": 5,  "window_minutes": 0},
    {"metric": "db_conn_pct",   "metric_type": "DB_CONN_POOL",  "severity": "HIGH",   "threshold": 90, "window_minutes": 0},
    {"metric": "auth_failures", "metric_type": "AUTH_FAILURES", "severity": "MEDIUM", "threshold": 10, "window_minutes": 1},
]


# --- ROUTING: ce echipa primeste incidentul in functie de metrica ---
# Strategia este auto-assign la creare; UI-ul poate face reassign manual ulterior.
ROUTING = {
    "CPU":            "Infrastructure",
    "RAM":            "Infrastructure",
    "DISK":           "Infrastructure",
    "RESPONSE_TIME":  "Backend",
    "HTTP_5XX":       "Backend",
    "DB_CONN_POOL":   "Database",
    "AUTH_FAILURES":  "Security",
}
DEFAULT_TEAM = "Infrastructure"  # fallback daca apare o metric_type necunoscuta


def _evaluate_rule(cursor, server_id: str, rule: dict) -> bool:
    """
    Verifica daca o regula este indeplinita pentru un server.

    Pentru reguli instant (window_minutes=0): doar ultima valoare > prag.
    Pentru reguli sustinute: minimul valorilor din fereastra > prag SI fereastra
    contine date care acopera intervalul cerut (avem o mostra mai veche decat
    inceputul ferestrei, ca sa stim sigur ca a fost peste prag tot timpul).
    """
    metric = rule["metric"]
    threshold = rule["threshold"]
    window = rule["window_minutes"]

    if window == 0:
        # Instant: ultima valoare pentru aceasta metrica
        cursor.execute(
            f"""
            SELECT {metric} FROM metrics
            WHERE server_id = %s AND {metric} IS NOT NULL
            ORDER BY timestamp DESC LIMIT 1
            """,
            (server_id,),
        )
        row = cursor.fetchone()
        if row is None or row[0] is None:
            return False
        return float(row[0]) > threshold

    # Sustinut: cere ca min(valoare) din fereastra > prag SI sa avem cel putin
    # o mostra mai veche decat inceputul ferestrei (altfel nu putem demonstra
    # ca metrica a fost peste prag tot intervalul).
    cursor.execute(
        f"""
        SELECT
            MIN({metric}) AS min_val,
            COUNT(*) AS n,
            MIN(timestamp) AS oldest
        FROM metrics
        WHERE server_id = %s
          AND {metric} IS NOT NULL
          AND timestamp >= LOCALTIMESTAMP - (%s || ' minutes')::INTERVAL
        """,
        (server_id, window),
    )
    row = cursor.fetchone()
    if row is None:
        return False
    min_val, n, oldest = row
    if n == 0 or min_val is None or oldest is None:
        return False

    # Verificam ca fereastra e acoperita: cea mai veche mostra din fereastra
    # trebuie sa fie aproape de inceputul ferestrei (toleranta: 10% din window).
    # LOCALTIMESTAMP returneaza timestamp naive (la fel ca metrics.timestamp).
    cursor.execute(
        "SELECT LOCALTIMESTAMP - (%s || ' minutes')::INTERVAL",
        (window,),
    )
    window_start = cursor.fetchone()[0]
    tolerance_seconds = window * 60 * 0.1  # 10% toleranta
    if (oldest - window_start).total_seconds() > tolerance_seconds:
        return False

    return float(min_val) > threshold


def _find_open_incident(cursor, server_id: str, metric_type: str) -> Optional[tuple]:
    """Returneaza (id, severity) al incidentului OPEN pentru (server, metrica), sau None."""
    cursor.execute(
        """
        SELECT id, severity FROM incidents
        WHERE server_id = %s AND metric_type = %s AND status = 'OPEN'
        ORDER BY created_at DESC LIMIT 1
        """,
        (server_id, metric_type),
    )
    return cursor.fetchone()


def _create_incident(cursor, server_id: str, metric_type: str, severity: str) -> int:
    title = f"[{severity}] {metric_type} pe {server_id}"
    team = ROUTING.get(metric_type, DEFAULT_TEAM)
    cursor.execute(
        """
        INSERT INTO incidents (server_id, metric_type, title, severity, status, assigned_team)
        VALUES (%s, %s, %s, %s, 'OPEN', %s)
        RETURNING id
        """,
        (server_id, metric_type, title, severity, team),
    )
    return cursor.fetchone()[0]


def _escalate_incident(cursor, incident_id: int, new_severity: str) -> None:
    cursor.execute(
        """
        UPDATE incidents
        SET severity = %s, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """,
        (new_severity, incident_id),
    )


def _create_alarm(cursor, server_id: str, metric_type: str, severity: str,
                  message: str, incident_id: int) -> None:
    cursor.execute(
        """
        INSERT INTO alarms (server_id, metric_type, severity, message, incident_id)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (server_id, metric_type, severity, message, incident_id),
    )


def evaluate(conn, server_id: str) -> None:
    """
    Evalueaza toate regulile pentru un server dupa salvarea unei metrici noi.

    Pentru fiecare metric_type unic, gaseste cea mai severa regula indeplinita
    si emite alarma/incident corespunzator (cu deduplicare).

    Foloseste conexiunea data (nu deschide alta) si commit-uieste la final.
    """
    cursor = conn.cursor()
    try:
        # Grupam regulile pe metric_type, sortate descrescator dupa severitate
        by_metric: dict[str, list[dict]] = {}
        for rule in RULES:
            by_metric.setdefault(rule["metric_type"], []).append(rule)
        for rules in by_metric.values():
            rules.sort(key=lambda r: SEVERITY_RANK[r["severity"]], reverse=True)

        for metric_type, rules in by_metric.items():
            # Gasim cea mai severa regula indeplinita pentru aceasta metrica
            triggered = None
            for rule in rules:
                if _evaluate_rule(cursor, server_id, rule):
                    triggered = rule
                    break

            if triggered is None:
                continue

            severity = triggered["severity"]
            message = (
                f"{metric_type} > {triggered['threshold']}"
                + (f" sustinut {triggered['window_minutes']} min" if triggered["window_minutes"] > 0 else " (instant)")
            )

            existing = _find_open_incident(cursor, server_id, metric_type)
            if existing is None:
                # Caz 1: nu exista incident -> cream incident + alarma
                incident_id = _create_incident(cursor, server_id, metric_type, severity)
                _create_alarm(cursor, server_id, metric_type, severity, message, incident_id)
                print(f"[INCIDENT NOU] #{incident_id} {severity} {metric_type} @ {server_id}")
            else:
                incident_id, current_severity = existing
                if SEVERITY_RANK[severity] > SEVERITY_RANK[current_severity]:
                    # Caz 2: escaladare -> bump severitate + alarma noua
                    _escalate_incident(cursor, incident_id, severity)
                    _create_alarm(
                        cursor, server_id, metric_type, severity,
                        f"ESCALAT: {message}", incident_id,
                    )
                    print(f"[ESCALAT] #{incident_id} {current_severity} -> {severity} ({metric_type} @ {server_id})")
                # Caz 3: severitate egala/mai mica -> silent (sustinut, nu spam)

        conn.commit()
    finally:
        cursor.close()
