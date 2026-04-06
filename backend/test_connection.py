"""
Script de test pentru verificarea conexiunii backend MQTT si gestionarii mesajelor.

Ruleaza acest script intr-un terminal separat pentru a verifica ca:
1. Backend-ul poate sa se conecteze la broker MQTT
2. Metricile sunt primite de la agent
3. Parsarea si validarea mesajelor functioneaza corect
"""

import os
import json
import time
from dotenv import load_dotenv
import paho.mqtt.client as mqtt
from paho.mqtt.client import CallbackAPIVersion


# Incarca configuratia
load_dotenv()

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "metrics/cpu")

message_count = 0
MAX_MESSAGES = 5


def on_connect(client, userdata, connect_flags, rc, properties=None):
    """Callback pentru conexiune."""
    if rc == 0:
        print(f"[OK] Conectat la broker la {MQTT_BROKER}:{MQTT_PORT}")
        client.subscribe(MQTT_TOPIC, qos=1)
        print(f"[OK] Abonat la {MQTT_TOPIC}")
    else:
        print(f"[EROARE] Conexiune esuat cu codul {rc}")


def on_message(client, userdata, msg):
    """Callback pentru primirea mesajelor."""
    global message_count
    message_count += 1
    
    print(f"\n[Mesaj {message_count}]")
    print(f"  Topic: {msg.topic}")
    
    try:
        payload = json.loads(msg.payload.decode())
        print(f"  Sarcina (Payload):")
        for key, value in payload.items():
            print(f"    - {key}: {value}")
    except json.JSONDecodeError:
        print(f"  Brut: {msg.payload.decode()}")
    
    if message_count >= MAX_MESSAGES:
        print(f"\n[OK] Primit {MAX_MESSAGES} mesaje. Test complet!")
        client.disconnect()


def main():
    """Ruleaza testul de conectare."""
    print("=" * 60)
    print("Test de Conectare MQTT Backend")
    print("=" * 60)
    print(f"\nIncerc sa ma conectez la {MQTT_BROKER}:{MQTT_PORT}...")
    print(f"Ascult mesaje pe topic: {MQTT_TOPIC}")
    print(f"Voi captura primele {MAX_MESSAGES} mesaje apoi ies\n")
    
    try:
        client = mqtt.Client(
            callback_api_version=CallbackAPIVersion.VERSION2,
            client_id="test-client"
        )
        
        client.on_connect = on_connect
        client.on_message = on_message
        
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        client.loop_start()
        
        # Asteptam mesaje sau timeout
        timeout = time.time() + 30  # Timeout de 30 secunde
        while message_count < MAX_MESSAGES and time.time() < timeout:
            time.sleep(0.1)
        
        if message_count == 0:
            print("[TIMEOUT] Nici un mesaj primit!")
            print("   Verifica ca agentul ruleaza si publica la broker")
        
        client.loop_stop()
        client.disconnect()
    
    except Exception as e:
        print(f"[EROARE] Eroare: {e}")
        print("   Asigura-te ca broker MQTT ruleaza si este accesibil")


if __name__ == "__main__":
    main()

