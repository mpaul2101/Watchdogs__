import re

with open("frontend/src/api.js", "r") as f:
    content = f.read()

# 1. Update WD state
content = content.replace("notificationLog: [],", "notifications: [], bridgeInvites: [],")

# 2. Update refresh function
refresh_old = "notifLog:      authed ? apiFetch('/api/notifications/log?limit=200') : null,"
refresh_new = "notifications: authed ? apiFetch('/api/notifications') : null,\n    bridgeInvites: authed ? apiFetch('/api/bridge-calls/invites') : null,"
content = content.replace(refresh_old, refresh_new)

# 3. Update refresh state assignment
assign_old = "if (u.notifLog.status === 'fulfilled' && u.notifLog.value !== null) WD.notificationLog = u.notifLog.value;"
assign_new = "if (u.notifications.status === 'fulfilled' && u.notifications.value !== null) WD.notifications = u.notifications.value;\n  if (u.bridgeInvites.status === 'fulfilled' && u.bridgeInvites.value !== null) WD.bridgeInvites = u.bridgeInvites.value;"
content = content.replace(assign_old, assign_new)

# 4. Replace startBridge function
bridge_old = re.compile(r'export async function startBridge\(id\) \{.*?return res\.json\(\);\n\}', re.DOTALL)
bridge_new = """export async function startBridge(incidentId, engineerIds) {
  if (!WD.token) throw new Error('Not authenticated');
  const res = await fetch(WD.base + `/api/incidents/${incidentId}/bridge-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WD.token}` },
    body: JSON.stringify({ engineer_ids: engineerIds }),
    mode: 'cors',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body}`);
  }
  await refresh();
  return res.json();
}

export async function markNotificationRead(id) {
  if (!WD.token) throw new Error('Not authenticated');
  const res = await fetch(WD.base + `/api/notifications/${id}/read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WD.token}` },
    body: JSON.stringify({ is_read: true }),
    mode: 'cors',
  });
  await refresh();
}

export async function respondToBridgeInvite(id, status) {
  if (!WD.token) throw new Error('Not authenticated');
  const res = await fetch(WD.base + `/api/bridge-calls/invites/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WD.token}` },
    body: JSON.stringify({ status }),
    mode: 'cors',
  });
  await refresh();
}
"""
content = bridge_old.sub(bridge_new, content)

with open("frontend/src/api.js", "w") as f:
    f.write(content)

print("frontend/src/api.js updated!")
