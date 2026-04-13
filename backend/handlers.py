"""
Handleri de mesaje pentru procesarea metricilor MQTT si salvarea in DB.
"""

import json
import psycopg2
from datetime import datetime

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

def on_message_received(client, userdata, msg):
    """
    Gestioneaza mesajele MQTT, le valideaza si le SALVEAZA in baza de date.
    """
    try:
        # 1. Decodam payload-ul si parsam JSON-ul
        payload = json.loads(msg.payload.decode())
        
        # 2. Validam campurile necesare (Munca originala a colegului)
        required_fields = ["server_id", "cpu", "timestamp"]
        if not all(field in payload for field in required_fields):
            print(f"[EROARE] Payload invalid: campuri lipsa {required_fields}")
            return
        
        # 3. Validam ca valoarea CPU este numerica si in intervalul [0-100]
        try:
            cpu_value = float(payload["cpu"])
            if not (0 <= cpu_value <= 100):
                print(f"[EROARE] Valoare CPU invalida: {cpu_value}%")
                return
        except (ValueError, TypeError):
            print(f"[EROARE] Valoarea CPU nu este numerica")
            return
        
        # Extragem datele sigure
        server_id = payload["server_id"]
        # Convertim timestamp-ul UNIX (numar) in obiect de timp real pentru Postgres
        dt_timestamp = datetime.fromtimestamp(payload["timestamp"])
        
        # Daca agentul trimite si RAM, il luam. Daca nu, punem None (NULL in DB)
        ram_value = float(payload.get("ram")) if "ram" in payload else None

        # --- 4. MAGIA NOUA: SALVAREA IN BAZA DE DATE ---
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Comanda SQL pentru a introduce datele
        insert_query = """
            INSERT INTO metrics (server_id, cpu, ram, timestamp)
            VALUES (%s, %s, %s, %s)
        """
        
        # Executam comanda
        cursor.execute(insert_query, (server_id, cpu_value, ram_value, dt_timestamp))
        
        # VITAL: Confirmam salvarea! Fara asta, datele se sterg la inchiderea functiei.
        conn.commit()
        
        # Inchidem usile curat
        cursor.close()
        conn.close()
        
        print(f"[SALVAT IN DB] Server: {server_id} | CPU: {cpu_value}% | Timp: {dt_timestamp}")
        
    except json.JSONDecodeError as e:
        print(f"[EROARE] Esuat la parsarea JSON: {e}")
    except psycopg2.Error as e:
        print(f"[EROARE DB] Problema la salvarea in Postgres: {e}")
    except Exception as e:
        print(f"[EROARE CRITICA] Eroare neasteptata: {e}")