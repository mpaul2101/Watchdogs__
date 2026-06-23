"""
Agent Watchdogs — colecteaza metrici locale (CPU/RAM/Disk) si le publica
pe MQTT, pe un topic ierarhic. Robust la deconectari (reconnect automat).
"""

import os
import time
import json
import psutil
import paho.mqtt.client as mqtt
from dotenv import load_dotenv

# Incarca configuratia din .env (fiecare masina are valorile ei)
load_dotenv(override=True)

SERVER_ID = os.getenv("SERVER_ID", "unknown-server")
REGION = os.getenv("REGION", "unknown-region")
MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))

# Topic ierarhic: watchdogs/{regiune}/{server}/metrics
METRICS_TOPIC = f"watchdogs/{REGION}/{SERVER_ID}/metrics"
STATUS_TOPIC = f"watchdogs/{REGION}/{SERVER_ID}/status"

PUBLISH_INTERVAL = 4  # secunde intre masuratori


def on_connect(client, userdata, flags, rc, properties=None):
    """Callback la (re)conectare. rc=0 inseamna succes."""
    if rc == 0:
        print(f"[OK] Conectat la broker {MQTT_BROKER}:{MQTT_PORT}")
        print(f"[OK] Voi publica pe: {METRICS_TOPIC}")
        # Anuntam ca suntem activi (retain => starea curenta e mereu disponibila)
        client.publish(STATUS_TOPIC, payload="online", qos=1, retain=True)
    else:
        print(f"[EROARE] Conectare esuata, cod {rc}")


def on_disconnect(client, userdata, flags, rc, properties=None):
    """Callback la deconectare. paho va reincerca automat (vezi reconnect_delay_set)."""
    if rc != 0:
        print(f"[AVERTISMENT] Deconectat neasteptat (cod {rc}). Se reincearca...")


def build_payload():
    """Citeste metricile locale si construieste payload-ul JSON."""
    return {
        "server_id": SERVER_ID,
        "region": REGION,
        "cpu": psutil.cpu_percent(interval=1),
        "ram": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage("/").percent,
        "timestamp": int(time.time()),
    }


def main():
    print(f"[INCEPUT] Agent Watchdogs — {SERVER_ID} ({REGION})")

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"agent-{SERVER_ID}",
    )
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect

    # Reconnect automat cu backoff: 1s, 2s, 4s... pana la max 30s
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    # Last Will: daca agentul moare brusc, brokerul publica "offline" in locul lui.
    # retain=True => mesajul ramane pe topic pentru cine se aboneaza ulterior.
    client.will_set(STATUS_TOPIC, payload="offline", qos=1, retain=True)
    # Conectare initiala (daca brokerul e jos acum, loop_start reincearca oricum)
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    except Exception as e:
        print(f"[AVERTISMENT] Broker indisponibil la pornire: {e}")
        print("[INFO] Se va reincerca automat...")

    # Porneste thread-ul de fundal care gestioneaza reteaua si reconectarea
    client.loop_start()

    try:
        while True:
            payload = build_payload()
            # QoS 1 = "cel putin o data" — metrica ajunge garantat
            result = client.publish(
                METRICS_TOPIC, json.dumps(payload), qos=1
            )
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                print(f"[TRIMIS] {payload}")
            else:
                print(f"[AVERTISMENT] Publicare esuata, cod {result.rc}")
            time.sleep(PUBLISH_INTERVAL)
    except KeyboardInterrupt:
        print("\n[INFO] Oprire agent...")
    finally:
        client.loop_stop()
        client.disconnect()
        print("[OK] Agent oprit curat")


if __name__ == "__main__":
    main()