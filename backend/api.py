from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Depends, Header
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


def get_mock_user(
    x_mock_user_id: Optional[int] = Header(None, alias="X-Mock-User-Id"),
):
    """Returneaza userul mock pe baza header-ului X-Mock-User-Id."""
    if x_mock_user_id is None:
        raise HTTPException(status_code=401, detail="Missing X-Mock-User-Id header")

    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT * FROM users WHERE id = %s", (x_mock_user_id,))
        user = db_cursor.fetchone()
        if user is None:
            raise HTTPException(status_code=404, detail="Mock user not found")
        return user
    finally:
        db_cursor.close()
        conn.close()

@app.get("/")
def read_root():
    return {"status": "online", "message": "API-ul ruleaza perfect!"}


@app.get("/api/users")
def get_users():
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT * FROM users ORDER BY team_name, role, name")
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()

@app.get("/api/metrics")
def get_metrics(
    server_id: Optional[str] = Query(None),
    minutes: int = Query(60, ge=1, le=1440),
    limit: int = Query(100, ge=1, le=1000),
):
   
    conditions = ["timestamp >= LOCALTIMESTAMP - (%s || ' minutes')::INTERVAL"]
    params = [minutes]
    if server_id is not None:
        conditions.append(" server_id = %s ")
        params.append(server_id)
       
  
   
    where_clause = "WHERE " + " AND ".join(conditions)
    

    query = f"SELECT * FROM metrics {where_clause} ORDER BY timestamp DESC LIMIT %s"
    params.append(limit)
    
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute(query, params)
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()

@app.get("/api/alarms")
def get_alarms(
    severity: Optional[str] =  Query(None),
    server_id: Optional[str] = Query(None),
    incident_id: Optional[int] = Query(None),

):
    conditions = []
    params = []
    if severity is not None:
        conditions.append("severity = %s")
        params.append(severity)
    if server_id is not None:
        conditions.append("server_id = %s")
        params.append(server_id)
    if incident_id is not None:
        conditions.append("incident_id = %s")
        params.append(incident_id)
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)
    else:
        where_clause = ""
    query = f"SELECT * FROM alarms {where_clause} ORDER BY created_at DESC"
    conn = get_db_connection()
    db_cursor=conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute(query , params)
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()         

@app.get("/api/incidents")
def get_incidents(
    status: Optional [str] = Query(None),
    severity: Optional[str] = Query(None),
    team: Optional[str] =Query(None),
    server_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_mock_user),
):
    conditions = []
    params = []
    if status is not None:
        conditions.append( "i.status = %s" )
        params.append(status)
    if severity is not None:
        conditions.append( "i.severity = %s" )
        params.append(severity) 
    if  team is not None:
        conditions.append( "i.assigned_team = %s" )
        params.append(team)
    if server_id is not None:
        conditions.append( "i.server_id = %s" )
        params.append(server_id)

    role = current_user.get("role")
    if role == "System Manager":
        conditions.append("i.assigned_team = %s")
        params.append(current_user.get("team_name"))
    elif role == "Engineer":
        conditions.append("i.assigned_person = %s")
        params.append(current_user.get("id"))
    elif role == "Incident Manager":
        pass
    elif role == "CEO":
        pass
    else:
        raise HTTPException(status_code=403, detail="Role not allowed")

    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)
    else:
        where_clause=""
    query = f"""
    SELECT
        i.*,
        u.name AS assigned_person_name,
        u.role AS assigned_person_role,
        u.team_name AS assigned_person_team
    FROM incidents i
    LEFT JOIN users u ON u.id = i.assigned_person
    {where_clause}
    ORDER BY 
        CASE i.severity 
            WHEN 'CRITIC' THEN 1 
            WHEN 'HIGH' THEN 2 
            WHEN 'MEDIUM' THEN 3 
            WHEN 'LOW' THEN 4 
            ELSE 5 
        END,
        i.created_at DESC
"""
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory =RealDictCursor)   
    try:
        db_cursor.execute(query , params)
        rows = db_cursor.fetchall()
        if role == "CEO":
            for row in rows:
                row["read_only"] = True
        return rows
    finally:
            db_cursor.close()
            conn.close()
        

class IncidentUpdate(BaseModel):
    """Body pentru reassign / update status. Toate campurile sunt optionale -
    se actualizeaza doar cele furnizate."""
    assigned_team: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_person: Optional[int] = None
    triage_status: Optional[str] = None
    status: Optional[str] = None


ALLOWED_STATUSES = {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"}
ALLOWED_TRIAGE_STATUSES = {"Unassigned", "Assigned"}


@app.patch("/api/incidents/{incident_id}")
def update_incident(
    incident_id: int,
    body: IncidentUpdate,
    current_user: dict = Depends(get_mock_user),
):
    """Actualizeaza echipa, inginerul atribuit sau statusul unui incident."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Niciun camp de actualizat")

    if "status" in updates and updates["status"] not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status invalid. Permise: {sorted(ALLOWED_STATUSES)}",
        )
    if "triage_status" in updates and updates["triage_status"] not in ALLOWED_TRIAGE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Triage status invalid. Permise: {sorted(ALLOWED_TRIAGE_STATUSES)}",
        )
    if "assigned_team" in updates and updates["assigned_team"] not in ROUTING.values():
        raise HTTPException(
            status_code=400,
            detail=f"Echipa necunoscuta. Permise: {sorted(set(ROUTING.values()))}",
        )

    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT * FROM incidents WHERE id = %s", (incident_id,))
        existing = db_cursor.fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail=f"Incident #{incident_id} negasit")

        role = current_user.get("role")
        update_fields = set(updates.keys())
        assignment_fields = {"assigned_team", "assigned_person"}
        triage_fields = {"triage_status"}
        if role == "CEO":
            raise HTTPException(status_code=403, detail="Read-only access")
        if role == "Incident Manager":
            pass
        elif role == "System Manager":
            if existing.get("assigned_team") != current_user.get("team_name"):
                raise HTTPException(status_code=403, detail="Incident not in your team")
            if update_fields & (assignment_fields | triage_fields):
                raise HTTPException(status_code=403, detail="Only Incident Manager can assign or triage")
        elif role == "Engineer":
            if existing.get("assigned_person") != current_user.get("id"):
                raise HTTPException(status_code=403, detail="Incident not assigned to you")
            non_status_updates = update_fields - {"status"}
            if non_status_updates:
                raise HTTPException(status_code=403, detail="Engineers can only update status")
        else:
            raise HTTPException(status_code=403, detail="Role not allowed")

        if update_fields & assignment_fields:
            if role != "Incident Manager":
                raise HTTPException(status_code=403, detail="Only Incident Manager can assign incidents")
            if existing.get("triage_status") != "Unassigned":
                raise HTTPException(status_code=400, detail="Incident is not in triage queue")
            if existing.get("bridge_required") and existing.get("bridge_status") != "Active":
                raise HTTPException(status_code=400, detail="Bridge must be active before assignment")

        if "assigned_person" in updates:
            target_team = updates.get("assigned_team") or existing.get("assigned_team")
            assigned_person = updates["assigned_person"]
            if assigned_person is not None:
                db_cursor.execute(
                    "SELECT id, role, team_name FROM users WHERE id = %s",
                    (assigned_person,),
                )
                assignee = db_cursor.fetchone()
                if assignee is None:
                    raise HTTPException(status_code=400, detail="Assigned user not found")
                if assignee.get("role") != "Engineer":
                    raise HTTPException(status_code=400, detail="Assigned user must be an Engineer")
                if assignee.get("team_name") != target_team:
                    raise HTTPException(status_code=400, detail="Assigned user is not in incident team")

        if update_fields & assignment_fields and "triage_status" not in updates:
            updates["triage_status"] = "Assigned"

        set_clause = ", ".join(f"{k} = %s" for k in updates) + ", updated_at = CURRENT_TIMESTAMP"
        params = list(updates.values()) + [incident_id]

        db_cursor.execute(
            f"UPDATE incidents SET {set_clause} WHERE id = %s RETURNING *",
            params,
        )
        row = db_cursor.fetchone()
        conn.commit()
        return row
    finally:
        db_cursor.close()
        conn.close()


@app.post("/api/incidents/{incident_id}/bridge")
def start_bridge_call(
    incident_id: int,
    current_user: dict = Depends(get_mock_user),
):
    role = current_user.get("role")
    if role != "Incident Manager":
        raise HTTPException(status_code=403, detail="Only Incident Manager can start a bridge")

    bridge_url = f"https://teams.mock/bridge/{incident_id}"

    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT id FROM incidents WHERE id = %s", (incident_id,))
        existing = db_cursor.fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail=f"Incident #{incident_id} negasit")

        db_cursor.execute(
            """
            UPDATE incidents
            SET bridge_status = 'Active', bridge_url = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING *
            """,
            (bridge_url, incident_id),
        )
        row = db_cursor.fetchone()
        conn.commit()
        return row
    finally:
        db_cursor.close()
        conn.close()


@app.get("/api/teams")
def get_teams():
    """Returneaza lista echipelor disponibile pentru atribuire (din ROUTING)."""
    return sorted(set(ROUTING.values()))

@app.get("/api/health")
def get_infrastructure_health():
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT * FROM get_infrastructure_health();")
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()