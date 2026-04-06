"""
Handleri de mesaje pentru procesarea metricilor MQTT.
"""

import json
from datetime import datetime

def on_message_received(client, userdata, msg):
    """
    Gestioneaza mesajele MQTT primite de la topicul metrics/cpu.
    
    Parseaza payload-ul JSON si valideaza structura inainte de procesare.
    Afiseaza iesirea metricilor formatate in consola.
    
    Args:
        client: Instanta clientului MQTT
        userdata: Date utilizator asociate cu clientul
        msg: Obiectul mesajului MQTT cu topic si sarcina
    """
    try:
        # Decodam payload-ul si parsam JSON-ul
        payload = json.loads(msg.payload.decode())
        
        # Validam campurile necesare
        required_fields = ["server_id", "cpu", "timestamp"]
        if not all(field in payload for field in required_fields):
            print(f"[EROARE] Payload invalid: campuri lipsa {required_fields}")
            print(f"   Primit: {payload}")
            return
        
        # Validam ca valoarea CPU este numerica si in intervalul [0-100]
        try:
            cpu_value = float(payload["cpu"])
            if not (0 <= cpu_value <= 100):
                print(f"[EROARE] Valoare CPU invalida: {cpu_value}% (trebuie intre 0-100)")
                return
        except (ValueError, TypeError):
            print(f"[EROARE] Valoarea CPU nu este numerica: {payload['cpu']}")
            return
        
        # Extragem campurile
        server_id = payload["server_id"]
        timestamp = payload["timestamp"]
        
        # Formatam timestamp-ul pentru afisare
        try:
            readable_time = datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")
        except (ValueError, OSError):
            readable_time = f"<timestamp invalid: {timestamp}>"
        
        # Afisam iesirea formatata
        print(f"[OK] Metric primit | Server: {server_id} | CPU: {cpu_value}% | Timp: {readable_time}")
        
    except json.JSONDecodeError as e:
        print(f"[EROARE] Esuat la parsarea JSON: {e}")
        print(f"   Payload brut: {msg.payload.decode()}")
    except Exception as e:
        print(f"[EROARE] Eroare neasteptata la procesarea mesajului: {e}")
