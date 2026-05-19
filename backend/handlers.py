"""
Handleri de mesaje pentru procesarea metricilor MQTT si salvarea in DB.
"""

import json
import psycopg2
from datetime import datetime, timezone

from threshold_engine import evaluate as evaluate_thresholds

# --- SETARILE BAZEI DE DATE ---
DB_CONFIG = {
    "dbname": "metrics",
    "user": "postgres",
    "password": "postgres",
    "host": "localhost",
    "port": "5432"
}

def get_db_connection():
    """Deschide o conexiune noua catre baza de date"""
    return psycopg2.connect(**DB_CONFIG)


def _safe_pct(payload: dict, key: str):
    """Extrage o valoare procentuala [0,100] din payload, sau None daca lipseste/invalida."""
    if key not in payload or payload[key] is None:
        return None
    try:
        v = float(payload[key])
    except (ValueError, TypeError):
        print(f"[AVERTISMENT] Valoare invalida pentru {key}: {payload[key]}")
        return None
    if not (0 <= v <= 100):
        print(f"[AVERTISMENT] {key} in afara intervalului [0,100]: {v}")
        return None
    return v
def handle_status_message(msg):
    """
    Trateaza mesajele de status (online/offline) venite prin Last Will
    sau publicate direct de agent.
    Topic: watchdogs/{region}/{server}/status
    """
    status = msg.payload.decode().strip()
    parts = msg.topic.split("/")
    if len(parts) < 4:
        print(f"[AVERTISMENT] Topic status invalid: {msg.topic}")
        return
    region = parts[1]
    server_id = parts[2]

    print(f"[STATUS] {server_id} ({region}) este acum: {status}")

    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        # 1. Actualizam starea curenta a serverului (upsert: insert sau update)
        cursor.execute(
            """
            INSERT INTO server_status (server_id, region, status, last_changed)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (server_id)
            DO UPDATE SET
                status = EXCLUDED.status,
                region = EXCLUDED.region,
                last_changed = CURRENT_TIMESTAMP
            """,
            (server_id, region, status),
        )

        # 2. Daca serverul a picat, cream incident NODE_DOWN (cu deduplicare)
        if status == "offline":
            cursor.execute(
                """
                SELECT id FROM incidents
                WHERE server_id = %s AND metric_type = 'NODE_DOWN' AND status = 'OPEN'
                LIMIT 1
                """,
                (server_id,),
            )
            if cursor.fetchone() is None:
                cursor.execute(
                    """
                    INSERT INTO incidents
                      (server_id, metric_type, title, severity, status,
                       triage_status, bridge_required)
                    VALUES (%s, 'NODE_DOWN', %s, 'CRITIC', 'OPEN', 'Unassigned', TRUE)
                    RETURNING id
                    """,
                    (server_id, f"[CRITIC] Server {server_id} este offline"),
                )
                incident_id = cursor.fetchone()[0]
                cursor.execute(
                    """
                    INSERT INTO alarms (server_id, metric_type, severity, message, incident_id)
                    VALUES (%s, 'NODE_DOWN', 'CRITIC', %s, %s)
                    """,
                    (server_id, f"Agentul de pe {server_id} a pierdut conexiunea", incident_id),
                )
                print(f"[INCIDENT NOU] #{incident_id} CRITIC NODE_DOWN @ {server_id}")
        # 3. Daca serverul a revenit, inchidem automat incidentul NODE_DOWN
        if status == "online":
            cursor.execute(
                """
                SELECT id FROM incidents
                WHERE server_id = %s AND metric_type = 'NODE_DOWN' AND status = 'OPEN'
                """,
                (server_id,),
            )
            open_node_down = cursor.fetchall()
            for (incident_id,) in open_node_down:
                cursor.execute(
                    """
                    UPDATE incidents
                    SET status = 'RESOLVED', updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    """,
                    (incident_id,),
                )
                cursor.execute(
                    """
                    INSERT INTO alarms (server_id, metric_type, severity, message, incident_id)
                    VALUES (%s, 'NODE_DOWN', 'LOW', %s, %s)
                    """,
                    (server_id, f"Serverul {server_id} a revenit online — incident auto-rezolvat", incident_id),
                )
                print(f"[AUTO-REZOLVAT] #{incident_id} NODE_DOWN @ {server_id} — server online")
        conn.commit()
        cursor.close()
    finally:
        conn.close()


def on_message_received(client, userdata, msg):
    """
    Gestioneaza mesajele MQTT, le valideaza, le SALVEAZA in baza de date,
    apoi RULEAZA motorul de praguri pentru a emite alarme/incidente.
    """# Rutam dupa ultimul nivel al topicului: metrics sau status
    topic_kind = msg.topic.split("/")[-1]

    if topic_kind == "status":
        handle_status_message(msg)
        return
    try:
        # 1. Decodam payload-ul si parsam JSON-ul
        payload = json.loads(msg.payload.decode())

        # 2. Validam campurile obligatorii
        required_fields = ["server_id", "cpu", "timestamp"]
        if not all(field in payload for field in required_fields):
            print(f"[EROARE] Payload invalid: campuri lipsa {required_fields}")
            return

        # 3. Validam si extragem valorile
        cpu_value = _safe_pct(payload, "cpu")
        if cpu_value is None:
            print(f"[EROARE] CPU obligatoriu lipsa sau invalid")
            return

        ram_value = _safe_pct(payload, "ram")
        disk_value = _safe_pct(payload, "disk")

        # Metrici aplicative (optionale, nu vin de la agentul psutil; vor fi NULL pana
        # cand le furnizeaza un alt producator)
        response_time_ms = payload.get("response_time_ms")
        http_5xx_rate = payload.get("http_5xx_rate")
        db_conn_pct = payload.get("db_conn_pct")
        auth_failures = payload.get("auth_failures")
        traffic_users = payload.get("traffic_users")

        server_id = payload["server_id"]
        # Regiunea: din payload, sau din topic ca fallback
        region = payload.get("region")
        if region is None:
            # topic: watchdogs/{region}/{server}/metrics -> piesa [1]
            parts = msg.topic.split("/")
            region = parts[1] if len(parts) >= 4 else "unknown"
        # UTC, naive: agentul trimite unix epoch (UTC); DB stocheaza TIMESTAMP
        # without time zone si query-urile motorului folosesc LOCALTIMESTAMP
        # (returneaza UTC daca containerul Postgres ruleaza in UTC).
        dt_timestamp = datetime.fromtimestamp(payload["timestamp"])

        # 4. Salvam in DB si rulam motorul de praguri pe aceeasi conexiune
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
            """
             INSERT INTO metrics
             (server_id, region, cpu, ram, disk, response_time_ms, http_5xx_rate,
               db_conn_pct, auth_failures, traffic_users, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
                 (server_id, region, cpu_value, ram_value, disk_value, response_time_ms,
                 http_5xx_rate, db_conn_pct, auth_failures, traffic_users, dt_timestamp),
        )
            conn.commit()
            cursor.close()

            print(f"[SALVAT] {server_id} | CPU={cpu_value}% RAM={ram_value}% DISK={disk_value}% @ {dt_timestamp}")

            # 5. Evaluam pragurile -> emite alarme / incidente daca e cazul
            evaluate_thresholds(conn, server_id)
        finally:
            conn.close()

    except json.JSONDecodeError as e:
        print(f"[EROARE] Esuat la parsarea JSON: {e}")
    except psycopg2.Error as e:
        print(f"[EROARE DB] Problema la salvarea in Postgres: {e}")
    except Exception as e:
        print(f"[EROARE CRITICA] Eroare neasteptata: {e}")
