"""
Serviciul Backend MQTT pentru colectarea metricilor Watchdogs.

Se conecteaza la broker MQTT Mosquitto, se aboneaza la topicul metrics/cpu,
si proceseaza mesajele de metrici primite prin handleri dedicati.
"""

import os
import sys
import time
from dotenv import load_dotenv
import paho.mqtt.client as mqtt
from paho.mqtt.client import CallbackAPIVersion

from handlers import on_message_received


# Incarca configuratia din variabilele de mediu
load_dotenv()

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "metrics/cpu")
CLIENT_ID = os.getenv("CLIENT_ID", "python-backend")


def on_connect(client, userdata, connect_flags, rc, properties=None):
    """
    Callback pentru cand clientul se conecteaza la broker MQTT.
    
    Args:
        client: Instanta clientului MQTT
        userdata: Date utilizator
        connect_flags: Marcatori de conexiune
        rc: Codul rezultatului conexiunii (0 = succes)
        properties: Proprietatile conexiunii (paho-mqtt 2.0+)
    """
    if rc == 0:
        print(f"[OK] Conectat la broker MQTT la {MQTT_BROKER}:{MQTT_PORT}")
        # Abonare la topicul de metrici
        try:
            client.subscribe(MQTT_TOPIC, qos=1)
            print(f"[OK] Abonat la topicul: {MQTT_TOPIC}")
        except Exception as e:
            print(f"[EROARE] Esuat sa se aboneze la {MQTT_TOPIC}: {e}")
    else:
        print(f"[EROARE] Esuat sa se conecteze la brokerul MQTT. Cod: {rc}")


def on_disconnect(client, userdata, disconnect_flags, rc, properties=None):
    """
    Callback pentru cand clientul se deconecteaza de la broker MQTT.
    
    Args:
        client: Instanta clientului MQTT
        userdata: Date utilizator
        disconnect_flags: Marcatori de deconectare
        rc: Codul rezultatului deconectarii (0 = intentionat, non-zero = neasteptat)
        properties: Proprietatile deconectarii (paho-mqtt 2.0+)
    """
    if rc == 0:
        print("[INFO] Deconectat de la broker MQTT (intentionat)")
    else:
        print(f"[AVERTISMENT] Deconectare neasteptata de la broker MQTT. Cod: {rc}")


def main():
    """
    Initializeaza si porneste serviciul backend MQTT.
    
    Configureaza clientul MQTT, se conecteaza la broker, se aboneaza la topicul de metrici,
    si porneste bucla clientului intr-un thread de fundal.
    """
    print(f"[INCEPUT] Initializare serviciu MQTT Backend...")
    print(f"   Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print(f"   Topic: {MQTT_TOPIC}")
    print(f"   ID Client: {CLIENT_ID}")
    print()
    
    # Cream clientul MQTT cu API-ul de callback paho-mqtt 2.0+
    try:
        client = mqtt.Client(
            callback_api_version=CallbackAPIVersion.VERSION2,
            client_id=CLIENT_ID
        )
    except Exception as e:
        print(f"[EROARE] Esuat de a crea clientul MQTT: {e}")
        sys.exit(1)
    
    # Configuram callback-urile
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message_received
    
    # Conectare la broker
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        print("[INFO] Conectare la broker MQTT...")
    except Exception as e:
        print(f"[EROARE] Esuat de a se conecta la broker MQTT: {e}")
        sys.exit(1)
    
    # Pornim bucla clientului MQTT intr-un thread de fundal
    # Asta permite threadului principal sa ramana activ fara sa se blocheze
    try:
        client.loop_start()
        print("[INFO] Bucla client MQTT pornita (thread de fundal)")
        print()
        print("=" * 60)
        print("Backend ruleaza. Se asteapta metrice...")
        print("=" * 60)
        print()
        
        # Mentinem threadul principal activ
        # Clientul MQTT ruleaza intr-un thread separat de fundal
        while True:
            time.sleep(1)
    
    except KeyboardInterrupt:
        print("\n\n[INFO] Se inchide...")
    except Exception as e:
        print(f"[EROARE] Eroare neasteptata: {e}")
        sys.exit(1)
    finally:
        # Curatare: oprim bucla MQTT si ne deconectam
        client.loop_stop()
        client.disconnect()
        print("[OK] Backend inchis curat")


if __name__ == "__main__":
    main()
