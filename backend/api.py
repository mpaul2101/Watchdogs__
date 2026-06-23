import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
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

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def get_user_by_identity(identity: str) -> Optional[dict]:
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT * FROM users WHERE email = %s", (identity,))
        user = db_cursor.fetchone()
        if user is None:
            db_cursor.execute("SELECT * FROM users WHERE username = %s", (identity,))
            user = db_cursor.fetchone()
        return user
    finally:
        db_cursor.close()
        conn.close()


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = db_cursor.fetchone()
        if user is None:
            raise credentials_exception
        return user
    finally:
        db_cursor.close()
        conn.close()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


@app.post("/api/auth/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user_by_identity(form_data.username)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    password_hash = user.get("password_hash")
    if not password_hash or not verify_password(form_data.password, password_hash):
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        {
            "sub": user.get("email"),
            "user_id": user.get("id"),
            "role": user.get("role"),
        }
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/")
def read_root():
    return {"status": "online", "message": "API-ul ruleaza perfect!"}


@app.get("/api/users")
def get_users():
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute(
            "SELECT id, username as name, email, role "
            "FROM users ORDER BY role, username"
        )
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
    server_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    conditions = []
    params = []
    if status is not None:
        conditions.append( "i.status = %s" )
        params.append(status)
    if severity is not None:
        conditions.append( "i.severity = %s" )
        params.append(severity) 
    if server_id is not None:
        conditions.append( "i.server_id = %s" )
        params.append(server_id)

    role = current_user.get("role")
    if role == "engineer":
        conditions.append("i.assignee_id = %s")
        params.append(current_user.get("id"))
    elif role == "admin":
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
        u.username AS assigned_person_name,
        u.role AS assigned_person_role
    FROM incidents i
    LEFT JOIN users u ON u.id = i.assignee_id
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
        return rows
    finally:
        db_cursor.close()
        conn.close()
        

class IncidentUpdate(BaseModel):
    status: Optional[str] = None

ALLOWED_STATUSES = {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"}

@app.patch("/api/incidents/{incident_id}")
def update_incident(
    incident_id: int,
    body: IncidentUpdate,
    current_user: dict = Depends(get_current_user),
):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Niciun camp de actualizat")

    if "status" in updates and updates["status"] not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status invalid. Permise: {sorted(ALLOWED_STATUSES)}")

    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT * FROM incidents WHERE id = %s", (incident_id,))
        existing = db_cursor.fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail=f"Incident #{incident_id} negasit")

        role = current_user.get("role")
        if role == "engineer":
            if existing.get("assignee_id") != current_user.get("id"):
                raise HTTPException(status_code=403, detail="Incident not assigned to you")

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

class AssignUpdate(BaseModel):
    assignee_id: int

@app.put("/api/incidents/{incident_id}/assign")
def assign_incident(
    incident_id: int,
    body: AssignUpdate,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only Admins can assign incidents")

    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT id, role FROM users WHERE id = %s", (body.assignee_id,))
        assignee = db_cursor.fetchone()
        if not assignee:
            raise HTTPException(status_code=404, detail="Assignee not found")
        if assignee["role"] != "engineer":
            raise HTTPException(status_code=400, detail="Can only assign to engineers")

        db_cursor.execute(
            """
            UPDATE incidents
            SET assignee_id = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING *
            """,
            (body.assignee_id, incident_id),
        )
        row = db_cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Incident #{incident_id} not found")
        
        # insert into notifications table
        db_cursor.execute(
            """
            INSERT INTO notifications (user_id, message, type)
            VALUES (%s, %s, 'assignment')
            """,
            (body.assignee_id, f"You have been assigned to incident #{incident_id}")
        )

        conn.commit()
        return row
    finally:
        db_cursor.close()
        conn.close()

class BridgeCallCreate(BaseModel):
    engineer_ids: list[int]

@app.post("/api/incidents/{incident_id}/bridge-call")
def start_bridge_call(
    incident_id: int,
    body: BridgeCallCreate,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only Admin can start a bridge call")

    bridge_url = f"https://meet.google.com/lookup/watchdogs-{incident_id}"

    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT * FROM incidents WHERE id = %s", (incident_id,))
        existing = db_cursor.fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail=f"Incident #{incident_id} not found")

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
        
        # Create bridge_call
        db_cursor.execute(
            """
            INSERT INTO bridge_calls (incident_id, created_by, link)
            VALUES (%s, %s, %s) RETURNING id
            """, (incident_id, current_user["id"], bridge_url)
        )
        bridge_call_id = db_cursor.fetchone()["id"]
        
        # Create invites and notifications
        for eng_id in body.engineer_ids:
            db_cursor.execute(
                "INSERT INTO bridge_call_invites (bridge_call_id, engineer_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (bridge_call_id, eng_id)
            )
            db_cursor.execute(
                """
                INSERT INTO notifications (user_id, message, type)
                VALUES (%s, %s, 'bridge_call')
                """, (eng_id, f"You have been invited to a Bridge Call for incident #{incident_id}")
            )

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

@app.get("/api/server-status")
def get_server_status():
    """Starea curenta (online/offline) a tuturor serverelor."""
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("""
            SELECT server_id, region, status, last_changed
            FROM server_status
            ORDER BY server_id
        """)
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()


# Returneaza lista de probleme recurente
@app.get("/api/problems")
def get_problems():
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = """
        WITH old_open AS (
            SELECT server_id, metric_type, title, severity, 'open' as status, created_at as first_seen,
                   CURRENT_TIMESTAMP as last_seen, 1 as occurrence_count,
                   'Open > 2 hours' as description,
                   'Incident left open for too long' as probable_cause,
                   'Assign an engineer immediately' as suggested_fix
            FROM incidents
            WHERE status = 'OPEN' AND created_at < CURRENT_TIMESTAMP - INTERVAL '2 hours'
        ),
        recurring AS (
            SELECT server_id, 'recurring_metric' as metric_type, 
                   'Recurring issue' as title, 'HIGH' as severity, 'open' as status,
                   MIN(timestamp) as first_seen, MAX(timestamp) as last_seen,
                   COUNT(*) as occurrence_count,
                   'Breached threshold > 3 times in 24h' as description,
                   'Unstable infrastructure' as probable_cause,
                   'Investigate root cause' as suggested_fix
            FROM (
                SELECT server_id, timestamp, cpu > 90 as is_breach,
                       LAG(cpu > 90) OVER (PARTITION BY server_id ORDER BY timestamp) as prev_breach
                FROM metrics
                WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '24 hours'
            ) t
            WHERE is_breach AND NOT COALESCE(prev_breach, FALSE)
            GROUP BY server_id
            HAVING COUNT(*) > 3
        )
        SELECT * FROM old_open
        UNION ALL
        SELECT * FROM recurring
        ORDER BY last_seen DESC
        """
        db_cursor.execute(query)
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()
# Returneaza detaliile unei singure probleme selectate din UI
@app.get("/api/problems/{problem_id}")
def get_problem(problem_id: int):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            id,
            server_id,
            metric_type,
            title,
            description,
            severity,
            status,
            occurrence_count,
            first_seen,
            last_seen,
            probable_cause,
            suggested_fix,
            created_at,
            updated_at
        FROM problems
        WHERE id = %s;
    """, (problem_id,))

    row = cur.fetchone()

    cur.close()
    conn.close()

    if row is None:
        return {"error": "Problem not found"}

    return {
        "id": row[0],
        "server_id": row[1],
        "metric_type": row[2],
        "title": row[3],
        "description": row[4],
        "severity": row[5],
        "status": row[6],
        "occurrence_count": row[7],
        "first_seen": row[8],
        "last_seen": row[9],
        "probable_cause": row[10],
        "suggested_fix": row[11],
        "created_at": row[12],
        "updated_at": row[13],
    }
# Returneaza timeline-ul problemei: toate momentele cand aceasta a reaparut
@app.get("/api/problems/{problem_id}/timeline")
def get_problem_timeline_api(problem_id: int):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT * FROM get_problem_timeline(%s);",
        (problem_id,)
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    return [
        {
            "occurred_at": row[0],
            "value": float(row[1]),
            "threshold": float(row[2])
        }
        for row in rows
    ]


@app.get("/api/notifications/log")
def get_notification_log(
    incident_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=500),
):
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        conditions = []
        params = []
        if incident_id is not None:
            conditions.append("nl.incident_id = %s")
            params.append(incident_id)
        
        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
        params.append(limit)
        
        query = f"""
            SELECT 
                nl.*,
                u.username as triggered_by_name
            FROM notification_log nl
            LEFT JOIN users u ON nl.triggered_by = u.id
            {where_clause}
            ORDER BY nl.sent_at DESC
            LIMIT %s
        """
        db_cursor.execute(query, params)
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()



class NotificationRead(BaseModel):
    is_read: bool

@app.get("/api/notifications")
def get_notifications(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT * FROM notifications WHERE user_id = %s ORDER BY created_at DESC", (current_user["id"],))
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()

@app.patch("/api/notifications/{notif_id}/read")
def read_notification(notif_id: int, body: NotificationRead, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("UPDATE notifications SET is_read = %s WHERE id = %s AND user_id = %s RETURNING *", (body.is_read, notif_id, current_user["id"]))
        row = db_cursor.fetchone()
        conn.commit()
        return row
    finally:
        db_cursor.close()
        conn.close()

@app.get("/api/bridge-calls/invites")
def get_bridge_invites(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = """
        SELECT bci.status as invite_status, bc.* 
        FROM bridge_call_invites bci
        JOIN bridge_calls bc ON bci.bridge_call_id = bc.id
        WHERE bci.engineer_id = %s
        ORDER BY bc.created_at DESC
        """
        db_cursor.execute(query, (current_user["id"],))
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()

class InviteUpdate(BaseModel):
    status: str

@app.patch("/api/bridge-calls/invites/{bridge_call_id}")
def update_bridge_invite(bridge_call_id: int, body: InviteUpdate, current_user: dict = Depends(get_current_user)):
    if body.status not in ("accepted", "declined"):
        raise HTTPException(status_code=400, detail="Invalid status")
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute(
            "UPDATE bridge_call_invites SET status = %s WHERE bridge_call_id = %s AND engineer_id = %s RETURNING *",
            (body.status, bridge_call_id, current_user["id"])
        )
        row = db_cursor.fetchone()
        
        if body.status == "accepted":
            # Fetch bridge call details to notify admin
            db_cursor.execute("SELECT created_by, link, incident_id FROM bridge_calls WHERE id = %s", (bridge_call_id,))
            bridge_call = db_cursor.fetchone()
            if bridge_call:
                admin_id = bridge_call["created_by"]
                incident_id = bridge_call["incident_id"]
                link = bridge_call["link"]
                eng_name = current_user.get("username", "An engineer")
                
                # Insert notification for admin
                db_cursor.execute(
                    """
                    INSERT INTO notifications (user_id, message, type)
                    VALUES (%s, %s, 'bridge_call')
                    """,
                    (admin_id, f"{eng_name} accepted the Bridge Call for incident #{incident_id}. Link: {link}")
                )
        
        conn.commit()
        return row
    finally:
        db_cursor.close()
        conn.close()
