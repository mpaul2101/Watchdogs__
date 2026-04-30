"""
Seed data generator pentru Watchdogs
Genereaza date realiste prin MQTT pentru testare si demo.
"""

import json
import random
import time
from dataclasses import dataclass
from datetime import datetime

import paho.mqtt.client as mqtt


# --- CONFIGURARE MQTT ---
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC = "metrics/cpu"


# --- DEFINITIA TIPURILOR DE DISPOZITIVE ---
DEVICE_PROFILES = {
    "web": {
        "cpu_base": (20, 45),
        "ram_base": (40, 60),
        "disk_base": (30, 50),
        "description": "Web server",
    },
    "database": {
        "cpu_base": (15, 35),
        "ram_base": (60, 80),
        "disk_base": (40, 70),
        "description": "Database server",
    },
    "cache": {
        "cpu_base": (5, 20),
        "ram_base": (70, 85),
        "disk_base": (10, 25),
        "description": "Redis/Memcached",
    },
    "worker": {
        "cpu_base": (10, 60),
        "ram_base": (30, 55),
        "disk_base": (20, 40),
        "description": "Background worker",
    },
    "antenna": {
        "cpu_base": (10, 30),
        "ram_base": (25, 50),
        "disk_base": (15, 35),
        "description": "Telecom antenna/BTS",
    },
    "edge": {
        "cpu_base": (15, 40),
        "ram_base": (35, 55),
        "disk_base": (40, 65),
        "description": "Edge/CDN node",
    },
}


# Multipliers pentru ritm circadian
CIRCADIAN_MULTIPLIERS = {
    0: 0.5, 1: 0.5, 2: 0.4, 3: 0.4, 4: 0.5, 5: 0.6,
    6: 0.7, 7: 0.8, 8: 0.9,
    9: 1.0, 10: 1.1, 11: 1.2, 12: 1.2,
    13: 1.2, 14: 1.2, 15: 1.1, 16: 1.1, 17: 1.0,
    18: 1.0, 19: 0.9, 20: 0.9, 21: 0.8,
    22: 0.7, 23: 0.6,
}


@dataclass
class Device:
    """Reprezinta un dispozitiv simulat (server, antena, etc.)."""
    server_id: str
    device_type: str
    region: str
    personality: str  # 'healthy', 'busy', 'problematic'


def build_inventory() -> list[Device]:
    """Construieste lista de 30 dispozitive cu mix realist."""
    devices = []
    
    # Web servers (8)
    devices.append(Device("prod-eu-web-01",  "web", "eu-west",    "healthy"))
    devices.append(Device("prod-eu-web-02",  "web", "eu-west",    "busy"))
    devices.append(Device("prod-eu-web-03",  "web", "eu-central", "healthy"))
    devices.append(Device("prod-us-web-01",  "web", "us-east",    "healthy"))
    devices.append(Device("prod-us-web-02",  "web", "us-east",    "problematic"))
    devices.append(Device("prod-ap-web-01",  "web", "ap-south",   "busy"))
    devices.append(Device("staging-web-01",  "web", "eu-west",    "healthy"))
    devices.append(Device("staging-web-02",  "web", "eu-west",    "healthy"))
    
    # Databases (4)
    devices.append(Device("prod-eu-db-master",      "database", "eu-west",    "busy"))
    devices.append(Device("prod-eu-db-replica-01",  "database", "eu-west",    "healthy"))
    devices.append(Device("prod-us-db-master",      "database", "us-east",    "problematic"))
    devices.append(Device("prod-ap-db-master",      "database", "ap-south",   "healthy"))
    
    # Cache (3)
    devices.append(Device("prod-eu-redis-01",  "cache", "eu-west",    "healthy"))
    devices.append(Device("prod-us-redis-01",  "cache", "us-east",    "healthy"))
    devices.append(Device("prod-ap-redis-01",  "cache", "ap-south",   "busy"))
    
    # Workers (3)
    devices.append(Device("worker-jobs-01",     "worker", "eu-west", "busy"))
    devices.append(Device("worker-jobs-02",     "worker", "eu-west", "problematic"))
    devices.append(Device("worker-emails-01",   "worker", "us-east", "healthy"))
    
    # Antene/BTS (8)
    devices.append(Device("bts-bucuresti-sector-1",  "antenna", "eu-central", "healthy"))
    devices.append(Device("bts-bucuresti-sector-3",  "antenna", "eu-central", "busy"))
    devices.append(Device("bts-cluj-floresti",       "antenna", "eu-central", "healthy"))
    devices.append(Device("bts-timisoara-centru",    "antenna", "eu-central", "healthy"))
    devices.append(Device("bts-iasi-copou",          "antenna", "eu-central", "problematic"))
    devices.append(Device("bts-constanta-mamaia",    "antenna", "eu-central", "busy"))
    devices.append(Device("bts-brasov-poiana",       "antenna", "eu-central", "healthy"))
    devices.append(Device("bts-sibiu-centru",        "antenna", "eu-central", "healthy"))
    
    # Edge nodes (4)
    devices.append(Device("edge-cdn-frankfurt",  "edge", "eu-central", "healthy"))
    devices.append(Device("edge-cdn-london",     "edge", "eu-west",    "busy"))
    devices.append(Device("edge-cdn-virginia",   "edge", "us-east",    "healthy"))
    devices.append(Device("edge-cdn-singapore",  "edge", "ap-south",   "healthy"))
    
    return devices


# --- FUNCTII GENERARE METRICI ---

def _clamp(value: float, min_val: float = 0, max_val: float = 100) -> float:
    """Limiteaza o valoare in intervalul [min_val, max_val]."""
    return max(min_val, min(max_val, value))


def _baseline_for_device(device: Device) -> tuple[float, float, float]:
    """Calculeaza baseline-ul (cpu, ram, disk) pentru un dispozitiv."""
    profile = DEVICE_PROFILES[device.device_type]
    
    cpu_base = (profile["cpu_base"][0] + profile["cpu_base"][1]) / 2
    ram_base = (profile["ram_base"][0] + profile["ram_base"][1]) / 2
    disk_base = (profile["disk_base"][0] + profile["disk_base"][1]) / 2
    
    if device.personality == "busy":
        cpu_base *= 1.3
        ram_base *= 1.15
    elif device.personality == "problematic":
        cpu_base *= 1.2
        ram_base *= 1.1
    
    return cpu_base, ram_base, disk_base


def generate_metric_sample(
    device: Device,
    timestamp: datetime,
    previous: dict | None = None,
) -> dict:
    """Genereaza o singura mostra de metrici realista."""
    cpu_base, ram_base, disk_base = _baseline_for_device(device)
    
    hour = timestamp.hour
    multiplier = CIRCADIAN_MULTIPLIERS[hour]
    cpu_target = cpu_base * multiplier
    ram_target = ram_base * multiplier
    
    if previous is None:
        cpu = cpu_target + random.uniform(-3, 3)
        ram = ram_target + random.uniform(-3, 3)
        disk = disk_base + random.uniform(-2, 2)
    else:
        cpu_drift = (cpu_target - previous["cpu"]) * 0.05
        cpu_noise = random.uniform(-1.5, 1.5)
        cpu = previous["cpu"] + cpu_drift + cpu_noise
        
        ram_drift = (ram_target - previous["ram"]) * 0.03
        ram_noise = random.uniform(-1.0, 1.0)
        ram = previous["ram"] + ram_drift + ram_noise
        
        disk_noise = random.uniform(-0.1, 0.3)
        disk = previous["disk"] + disk_noise
    
    if cpu > 70:
        ram += (cpu - 70) * 0.3
    
    cpu = _clamp(cpu)
    ram = _clamp(ram)
    disk = _clamp(disk)
    
    return {
        "server_id": device.server_id,
        "cpu": round(cpu, 1),
        "ram": round(ram, 1),
        "disk": round(disk, 1),
        "timestamp": int(timestamp.timestamp()),
    }


# --- FUNCTII MQTT ---

def create_mqtt_client() -> mqtt.Client:
    """Creeaza si conecteaza un client MQTT la broker."""
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="seed-data-generator",
    )
    
    print(f"[MQTT] Conectare la {MQTT_BROKER}:{MQTT_PORT}...")
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()
    print("[MQTT] Conectat!")
    return client


def publish_sample(client: mqtt.Client, sample: dict) -> None:
    """Publica o mostra de metrici pe topicul MQTT."""
    payload = json.dumps(sample)
    client.publish(MQTT_TOPIC, payload, qos=1)


# --- TEST ---

if __name__ == "__main__":
    inventory = build_inventory()
    print(f"Total dispozitive: {len(inventory)}\n")
    
    # Conectare la MQTT
    client = create_mqtt_client()
    time.sleep(1)
    
    # Test: trimitem o mostra pentru fiecare dispozitiv (cu timestamp curent)
    print(f"\n[TEST] Trimitem {len(inventory)} mostre prin MQTT...\n")
    
    now = datetime.now()
    for device in inventory:
        sample = generate_metric_sample(device, now, previous=None)
        publish_sample(client, sample)
        print(f"  → {sample['server_id']:<35} CPU={sample['cpu']:<6} RAM={sample['ram']:<6} DISK={sample['disk']}")
    
    # Asteapta sa se trimita toate mesajele
    time.sleep(2)
    
    client.loop_stop()
    client.disconnect()
    print("\n[OK] Toate mesajele trimise. Verifica DB-ul!")