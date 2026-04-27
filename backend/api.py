from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor

from threshold_engine import ROUTING

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


class IncidentUpdate(BaseModel):
    """Body pentru reassign / update status. Toate campurile sunt optionale -
    se actualizeaza doar cele furnizate."""
    assigned_team: Optional[str] = None
    assigned_to: Optional[str] = None
    status: Optional[str] = None


ALLOWED_STATUSES = {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"}


@app.patch("/api/incidents/{incident_id}")
def update_incident(incident_id: int, body: IncidentUpdate):
    """Actualizeaza echipa, inginerul atribuit sau statusul unui incident."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Niciun camp de actualizat")

    if "status" in updates and updates["status"] not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status invalid. Permise: {sorted(ALLOWED_STATUSES)}",
        )
    if "assigned_team" in updates and updates["assigned_team"] not in ROUTING.values():
        raise HTTPException(
            status_code=400,
            detail=f"Echipa necunoscuta. Permise: {sorted(set(ROUTING.values()))}",
        )

    set_clause = ", ".join(f"{k} = %s" for k in updates) + ", updated_at = CURRENT_TIMESTAMP"
    params = list(updates.values()) + [incident_id]

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            f"UPDATE incidents SET {set_clause} WHERE id = %s RETURNING *",
            params,
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Incident #{incident_id} negasit")
        conn.commit()
        return row
    finally:
        cur.close()
        conn.close()


@app.get("/api/teams")
def get_teams():
    """Returneaza lista echipelor disponibile pentru atribuire (din ROUTING)."""
    return sorted(set(ROUTING.values()))