from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor

from threshold_engine import ROUTING

app = FastAPI(title="Watchdogs API")

# Frontend sa acceseze datele
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
    status: Optional[str] = None


ALLOWED_STATUSES = {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"}


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
        if role == "CEO":
            raise HTTPException(status_code=403, detail="Read-only access")
        if role == "System Manager":
            if existing.get("assigned_team") != current_user.get("team_name"):
                raise HTTPException(status_code=403, detail="Incident not in your team")
        elif role == "Engineer":
            if existing.get("assigned_person") != current_user.get("id"):
                raise HTTPException(status_code=403, detail="Incident not assigned to you")
            non_status_updates = set(updates.keys()) - {"status"}
            if non_status_updates:
                raise HTTPException(status_code=403, detail="Engineers can only update status")
        else:
            raise HTTPException(status_code=403, detail="Role not allowed")

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


# =====================================================================
# NOTIFICATIONS — Persoana 3 (Paul)
# =====================================================================

@app.get("/api/notifications/lists")
def get_notification_lists():
    """Liste de distribuție cu numărul de membri."""
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("""
            SELECT 
                nl.id, nl.name, nl.color, nl.description, nl.severity_trigger,
                COUNT(nlm.user_id) as member_count
            FROM notification_lists nl
            LEFT JOIN notification_list_members nlm ON nl.id = nlm.list_id
            GROUP BY nl.id
            ORDER BY 
                CASE nl.severity_trigger
                    WHEN 'CRITIC' THEN 1
                    WHEN 'HIGH' THEN 2
                    WHEN 'MEDIUM' THEN 3
                    ELSE 4
                END;
        """)
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()


@app.get("/api/notifications/targets/{incident_id}")
def get_notification_targets(incident_id: int):
    """Cine ar fi notificat dacă s-ar trimite pentru acest incident."""
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute(
            "SELECT * FROM get_notification_targets(%s);",
            (incident_id,)
        )
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()


@app.post("/api/notifications/send/{incident_id}")
def send_notifications(
    incident_id: int,
    triggered_by: Optional[int] = None,
    current_user: dict = Depends(get_mock_user),
):
    """Execută trimiterea (simulată) pentru un incident.
    triggered_by se ia automat din user-ul curent dacă nu e furnizat."""
    # Dacă nu primim triggered_by explicit, folosim user-ul curent
    if triggered_by is None:
        triggered_by = current_user.get("id")
    
    conn = get_db_connection()
    db_cursor = conn.cursor()
    try:
        db_cursor.execute(
            "SELECT dispatch_notifications(%s, %s);",
            (incident_id, triggered_by)
        )
        sent_count = db_cursor.fetchone()[0]
        conn.commit()
        return {"sent_count": sent_count, "status": "success"}
    except Exception as e:
        conn.rollback()
        return {"sent_count": 0, "status": "error", "message": str(e)}
    finally:
        db_cursor.close()
        conn.close()


@app.get("/api/notifications/log")
def get_notification_log(
    incident_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=500),
):
    """Istoric notificări cu filtre parametrizate."""
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        conditions = []
        params = []
        
        if incident_id is not None:
            conditions.append("nl.incident_id = %s")
            params.append(incident_id)
        if user_id is not None:
            conditions.append("nl.user_id = %s")
            params.append(user_id)
        
        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
        params.append(limit)
        
        query = f"""
            SELECT 
                nl.id,
                nl.incident_id,
                nl.user_id,
                nl.list_name,
                nl.delivery_method,
                nl.rendered_subject,
                nl.rendered_body,
                nl.sent_at,
                nl.delivery_status,
                u.name as user_name,
                u.email as user_email,
                u.role as user_role
            FROM notification_log nl
            LEFT JOIN users u ON nl.user_id = u.id
            {where_clause}
            ORDER BY nl.sent_at DESC
            LIMIT %s
        """
        
        db_cursor.execute(query, params)
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()