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


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


# Roluri si echipe permise la crearea conturilor (doar de catre CEO)
ALLOWED_ROLES = {"CEO", "CTO", "Incident Manager", "System Manager", "Engineer"}
KNOWN_TEAMS = {
    "Infrastructure", "Backend", "Database", "Security", "Executive", "NOC",
}


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
            db_cursor.execute("SELECT * FROM users WHERE name = %s", (identity,))
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
            "SELECT id, name, email, team_name, role, on_call_status "
            "FROM users ORDER BY team_name, role, name"
        )
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()


class CreateUserBody(BaseModel):
    """Body pentru crearea unui cont nou. Doar CEO poate apela acest endpoint."""
    name: str
    email: str
    password: str
    team_name: str
    role: str
    on_call_status: bool = False


class OnCallBody(BaseModel):
    on_call_status: bool


@app.post("/api/users/{user_id}/on-call")
def set_on_call(
    user_id: int,
    body: OnCallBody,
    current_user: dict = Depends(get_current_user),
):
    """Toggle on-call. Fiecare user isi schimba DOAR propriul status."""
    if current_user.get("id") != user_id:
        raise HTTPException(status_code=403, detail="You can only change your own on-call status")

    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute(
            """
            UPDATE users SET on_call_status = %s
            WHERE id = %s
            RETURNING id, name, email, team_name, role, on_call_status
            """,
            (body.on_call_status, user_id),
        )
        row = db_cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        conn.commit()
        return row
    finally:
        db_cursor.close()
        conn.close()


@app.post("/api/users", status_code=201)
def create_user(
    body: CreateUserBody,
    current_user: dict = Depends(get_current_user),
):
    """Creare cont nou. Rezervat exclusiv CEO-ului (fara register public).
    Parola este salvata hash-uit (bcrypt), niciodata in clar."""
    if current_user.get("role") != "CEO":
        raise HTTPException(status_code=403, detail="Only the CEO can create accounts")

    name = (body.name or "").strip()
    email = (body.email or "").strip().lower()
    team_name = (body.team_name or "").strip()
    role = (body.role or "").strip()
    password = body.password or ""

    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if "@" not in email or len(email) < 3:
        raise HTTPException(status_code=400, detail="A valid email is required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if not team_name:
        raise HTTPException(status_code=400, detail="Team is required")
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Allowed: {sorted(ALLOWED_ROLES)}",
        )

    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if db_cursor.fetchone() is not None:
            raise HTTPException(status_code=409, detail="A user with this email already exists")

        db_cursor.execute(
            """
            INSERT INTO users (name, email, team_name, role, on_call_status, password_hash)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, name, email, team_name, role, on_call_status
            """,
            (name, email, team_name, role, body.on_call_status, hash_password(password)),
        )
        row = db_cursor.fetchone()
        conn.commit()
        return row
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
        conditions.append("i.assigned_team = %s AND (i.assigned_person = %s OR i.assigned_person IS NULL)")
        params.extend([current_user.get("team_name"), current_user.get("id")])
    elif role == "Incident Manager":
        pass
    elif role == "CEO" or role == "CTO":
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
    current_user: dict = Depends(get_current_user),
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
        
        # If an engineer was assigned/reassigned, create a notification
        if "assigned_person" in updates and updates["assigned_person"] is not None:
            db_cursor.execute(
                """
                INSERT INTO notification_log (
                    incident_id, user_id, list_name, delivery_method,
                    rendered_subject, rendered_body, triggered_by
                ) VALUES (%s, %s, 'direct_assign', 'in_app', %s, %s, %s)
                """,
                (
                    incident_id,
                    updates["assigned_person"],
                    f"ASSIGNMENT: Incident #{incident_id}",
                    f"You have been assigned incident #{incident_id} by {current_user.get('name')} ({current_user.get('role')}). Please investigate.",
                    current_user.get("id"),
                )
            )
        
        conn.commit()
        return row
    finally:
        db_cursor.close()
        conn.close()


@app.post("/api/incidents/{incident_id}/bridge")
def start_bridge_call(
    incident_id: int,
    current_user: dict = Depends(get_current_user),
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
    cur = conn.cursor()
    cur.execute("SELECT escalate_recurring_incidents();")
    conn.commit()

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
        ORDER BY severity DESC, last_seen DESC;
    """)

    rows = cur.fetchall()

    cur.close()
    conn.close()

    return [
        {
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
        for row in rows
    ]
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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
            
        role = current_user.get("role")
        if role in ["CEO", "CTO"]:
            conditions.append("nl.list_name = 'red'")
        elif role in ["Engineer", "System Manager"]:
            conditions.append("(nl.user_id = %s OR nl.triggered_by = %s)")
            params.extend([current_user.get("id"), current_user.get("id")])
        elif role == "Incident Manager":
            conditions.append("nl.triggered_by = %s")
            params.append(current_user.get("id"))
        else:
            raise HTTPException(status_code=403, detail="Role not allowed")
        
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

