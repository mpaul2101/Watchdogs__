from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.extras import RealDictCursor

app = FastAPI(title="Watchdogs API")

# Lăsăm colegul de la Frontend să ne acceseze datele
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_CONFIG = {
    "dbname": "metrics",
    "user": "postgres",
    "password": "postgres",
    "host": "localhost",
    "port": "5432"
}

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG)

@app.get("/")
def read_root():
    return {"status": "online", "message": "API-ul ruleaza perfect!"}

@app.get("/api/metrics")
def get_metrics():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM metrics ORDER BY timestamp DESC LIMIT 50;")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

@app.get("/api/alarms")
def get_alarms():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM alarms ORDER BY created_at DESC;")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

@app.get("/api/incidents")
def get_incidents():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM incidents ORDER BY created_at DESC;")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()