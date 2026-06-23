import re

with open("backend/api.py", "r") as f:
    content = f.read()

# 1. Update the link generation
old_link = 'bridge_url = f"https://meet.google.com/watchdogs-bridge-{incident_id}"'
new_link = 'bridge_url = f"https://meet.google.com/lookup/watchdogs-{incident_id}"'
content = content.replace(old_link, new_link)

# 2. Update the PATCH route to insert notification
patch_route_old = """@app.patch("/api/bridge-calls/invites/{bridge_call_id}")
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
        conn.close()"""

patch_route_new = """@app.patch("/api/bridge-calls/invites/{bridge_call_id}")
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
                    \"\"\"
                    INSERT INTO notifications (user_id, message, type)
                    VALUES (%s, %s, 'bridge_call')
                    \"\"\",
                    (admin_id, f"{eng_name} accepted the Bridge Call for incident #{incident_id}. Link: {link}")
                )
        
        conn.commit()
        return row
    finally:
        db_cursor.close()
        conn.close()"""

content = content.replace(patch_route_old, patch_route_new)

with open("backend/api.py", "w") as f:
    f.write(content)

print("backend/api.py updated!")
