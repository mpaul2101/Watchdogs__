import re

with open("backend/api.py", "r") as f:
    content = f.read()

# 1. Replace assign_incident notification
old_assign = """        # log notification
        db_cursor.execute(
            \"\"\"
            INSERT INTO notification_log (incident_id, user_id, action_type, message, triggered_by)
            VALUES (%s, %s, 'assigned', %s, %s)
            \"\"\",
            (incident_id, body.assignee_id, f"Assigned incident {incident_id} to engineer {body.assignee_id}", current_user["id"])
        )"""

new_assign = """        # insert into notifications table
        db_cursor.execute(
            \"\"\"
            INSERT INTO notifications (user_id, message, type)
            VALUES (%s, %s, 'assignment')
            \"\"\",
            (body.assignee_id, f"You have been assigned to incident #{incident_id}")
        )"""

content = content.replace(old_assign, new_assign)

# 2. Replace start_bridge_call
old_bridge_call_regex = re.compile(r'@app\.post\("/api/incidents/\{incident_id\}/bridge-call"\)\ndef start_bridge_call\(.*?finally:\n        db_cursor\.close\(\)\n        conn\.close\(\)', re.DOTALL)

new_bridge_call = """class BridgeCallCreate(BaseModel):
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

    bridge_url = f"https://meet.google.com/watchdogs-bridge-{incident_id}"

    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        db_cursor.execute("SELECT * FROM incidents WHERE id = %s", (incident_id,))
        existing = db_cursor.fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail=f"Incident #{incident_id} not found")

        db_cursor.execute(
            \"\"\"
            UPDATE incidents
            SET bridge_status = 'Active', bridge_url = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING *
            \"\"\",
            (bridge_url, incident_id),
        )
        row = db_cursor.fetchone()
        
        # Create bridge_call
        db_cursor.execute(
            \"\"\"
            INSERT INTO bridge_calls (incident_id, created_by, link)
            VALUES (%s, %s, %s) RETURNING id
            \"\"\", (incident_id, current_user["id"], bridge_url)
        )
        bridge_call_id = db_cursor.fetchone()["id"]
        
        # Create invites and notifications
        for eng_id in body.engineer_ids:
            db_cursor.execute(
                "INSERT INTO bridge_call_invites (bridge_call_id, engineer_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (bridge_call_id, eng_id)
            )
            db_cursor.execute(
                \"\"\"
                INSERT INTO notifications (user_id, message, type)
                VALUES (%s, %s, 'bridge_call')
                \"\"\", (eng_id, f"You have been invited to a Bridge Call for incident #{incident_id}")
            )

        conn.commit()
        return row
    finally:
        db_cursor.close()
        conn.close()"""

content = old_bridge_call_regex.sub(new_bridge_call, content)

# 3. Replace GET /api/problems
old_problems_regex = re.compile(r'@app\.get\("/api/problems"\)\ndef get_problems\(\):.*?for row in rows\n    \]', re.DOTALL)

new_problems = """@app.get("/api/problems")
def get_problems():
    conn = get_db_connection()
    db_cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = \"\"\"
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
        \"\"\"
        db_cursor.execute(query)
        return db_cursor.fetchall()
    finally:
        db_cursor.close()
        conn.close()"""

content = old_problems_regex.sub(new_problems, content)

# 4. Append New Routes
new_routes = """

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
        query = \"\"\"
        SELECT bci.status as invite_status, bc.* 
        FROM bridge_call_invites bci
        JOIN bridge_calls bc ON bci.bridge_call_id = bc.id
        WHERE bci.engineer_id = %s
        ORDER BY bc.created_at DESC
        \"\"\"
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
        conn.commit()
        return row
    finally:
        db_cursor.close()
        conn.close()
"""

content += new_routes

with open("backend/api.py", "w") as f:
    f.write(content)

print("backend/api.py updated!")
