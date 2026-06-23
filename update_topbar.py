import re

with open("frontend/src/components/Topbar.jsx", "r") as f:
    content = f.read()

# Replace notificationLog references
content = content.replace("const myNotifs = store.notificationLog.filter(n => n.user_id === currentUser.id).slice(0, 5);", "const myNotifs = (store.notifications || []).slice(0, 5);")
content = content.replace("const unreadNotifs = myNotifs.length;", "const unreadNotifs = myNotifs.filter(n => !n.is_read).length;")

# Replace dropdown rendering
old_dropdown_item = """            <div key={n.id} className="dropdown-item" onClick={() => { setRoute('notifications'); setOpenNotif(false); }}>
              <div className="col" style={{flex: 1, gap: 2}}>
                <div style={{fontSize: 12, fontWeight: 500}}>{n.rendered_subject}</div>
                <div className="meta">{n.list_name} · {relTime(n.sent_at)}</div>
              </div>
            </div>"""

new_dropdown_item = """            <div key={n.id} className="dropdown-item" onClick={() => { setRoute('notifications'); setOpenNotif(false); }} style={{ opacity: n.is_read ? 0.6 : 1 }}>
              <div className="col" style={{flex: 1, gap: 2}}>
                <div style={{fontSize: 12, fontWeight: 500}}>{n.message}</div>
                <div className="meta">{n.type} · {relTime(n.created_at)}</div>
              </div>
            </div>"""

content = content.replace(old_dropdown_item, new_dropdown_item)

with open("frontend/src/components/Topbar.jsx", "w") as f:
    f.write(content)

print("Topbar updated!")
