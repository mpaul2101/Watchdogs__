/* ============================================================
   WATCHDOGS__ API CLIENT
   ES module. Fetches everything from the FastAPI backend.
   When the backend is down, all arrays stay empty and a clear
   connection banner is shown in the UI.

   Base URL is configurable from the Settings modal (localStorage).
   ============================================================ */

import { useState, useEffect } from 'react';

const SUBS = new Set();
function subscribe(fn) { SUBS.add(fn); return () => SUBS.delete(fn); }
function notify() { SUBS.forEach(fn => fn()); }

const LS_BASE = 'watchdogs.api.base';
const LS_TOKEN = 'watchdogs.auth.token';

export const WD = {
  // === cached state ===
  users: [],
  teams: [],
  servers: [],
  incidents: [],
  alarms: [],
  problems: [],
  problemTimelines: {},
  notificationLists: [],
  notificationLog: [],
  metricsHistory: {},
  notificationTargetsCache: {},
  health: [],
  bridgeParticipants: {},

  // === auth ===
  token: localStorage.getItem(LS_TOKEN),
  currentUser: null,

  // === connection ===
  connection: { status: 'connecting', error: null, lastFetch: null, lastSuccess: null },

  // === config ===
  base: localStorage.getItem(LS_BASE) || 'http://localhost:8000',

  subscribe,
};

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function clearAuth() {
  WD.token = null;
  WD.currentUser = null;
  WD.incidents = [];
  WD.notificationLog = [];
  localStorage.removeItem(LS_TOKEN);
  notify();
}

function setToken(token) {
  WD.token = token;
  if (token) localStorage.setItem(LS_TOKEN, token);
  else localStorage.removeItem(LS_TOKEN);
}

function resolveCurrentUserFromToken() {
  if (!WD.token || WD.users.length === 0) return;
  const payload = decodeJwtPayload(WD.token);
  const userId = payload?.user_id;
  if (!userId) return;
  const next = WD.users.find(u => u.id === userId) || null;
  if (next) WD.currentUser = next;
}

async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (WD.token) headers.Authorization = `Bearer ${WD.token}`;
  const res = await fetch(WD.base + path, { ...opts, headers, mode: 'cors' });
  if (res.status === 401) {
    clearAuth();
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function refresh() {
  const authed = Boolean(WD.token);
  const realCalls = {
    users:         apiFetch('/api/users'),
    teams:         apiFetch('/api/teams'),
    serverStatus:  apiFetch('/api/server-status'),
    health:        apiFetch('/api/health'),
    alarms:        apiFetch('/api/alarms'),
    problems:      apiFetch('/api/problems'),
    notifLists:    apiFetch('/api/notifications/lists'),
    metrics:       apiFetch('/api/metrics?minutes=10&limit=1000'),
  };
  const userScoped = {
    incidents:     authed ? apiFetch('/api/incidents') : null,
    notifLog:      authed ? apiFetch('/api/notifications/log?limit=200') : null,
  };

  const realKeys = Object.keys(realCalls);
  const realSettled = await Promise.allSettled(Object.values(realCalls));
  const userKeys = Object.keys(userScoped);
  const userSettled = await Promise.allSettled(Object.values(userScoped).map(p => p || Promise.resolve(null)));

  const r = Object.fromEntries(realKeys.map((k, i) => [k, realSettled[i]]));
  const u = Object.fromEntries(userKeys.map((k, i) => [k, userSettled[i]]));

  const anySuccess = realSettled.some(s => s.status === 'fulfilled');
  const allFail    = realSettled.every(s => s.status === 'rejected');
  const firstError = realSettled.find(s => s.status === 'rejected')?.reason?.message;

  if (allFail) {
    WD.connection = {
      status: 'disconnected',
      error: firstError ? `${firstError} · check that the API is reachable at ${WD.base}` : `Cannot reach API at ${WD.base}`,
      lastFetch: Date.now(),
      lastSuccess: WD.connection.lastSuccess,
    };
    notify();
    return;
  }
  if (anySuccess) {
    WD.connection = {
      status: 'connected',
      error: null,
      lastFetch: Date.now(),
      lastSuccess: Date.now(),
    };
  }

  if (r.users.status === 'fulfilled') WD.users = r.users.value;
  if (r.teams.status === 'fulfilled') WD.teams = r.teams.value;
  if (r.health.status === 'fulfilled') WD.health = r.health.value;
  if (r.alarms.status === 'fulfilled') WD.alarms = r.alarms.value;
  if (r.problems.status === 'fulfilled') WD.problems = r.problems.value;
  if (r.notifLists.status === 'fulfilled') WD.notificationLists = r.notifLists.value;
  if (u.incidents.status === 'fulfilled' && u.incidents.value !== null) WD.incidents = u.incidents.value;
  if (u.notifLog.status === 'fulfilled' && u.notifLog.value !== null) WD.notificationLog = u.notifLog.value;

  if (r.serverStatus.status === 'fulfilled') {
    const fromStatus = r.serverStatus.value.map(s => ({
      id: s.server_id, region: s.region, status: s.status, last_changed: s.last_changed,
    }));
    const seen = new Set(fromStatus.map(s => s.id));
    if (r.health.status === 'fulfilled') {
      r.health.value.forEach(h => {
        if (!seen.has(h.server_id)) {
          fromStatus.push({ id: h.server_id, region: 'unknown', status: 'online' });
          seen.add(h.server_id);
        }
      });
    }
    WD.servers = fromStatus;
  }

  if (r.metrics.status === 'fulfilled') {
    const byServer = {};
    r.metrics.value.forEach(m => {
      if (!byServer[m.server_id]) byServer[m.server_id] = [];
      byServer[m.server_id].push({
        ts: m.timestamp ? new Date(m.timestamp).getTime() : 0,
        cpu:  m.cpu  != null ? Number(m.cpu)  : null,
        ram:  m.ram  != null ? Number(m.ram)  : null,
        disk: m.disk != null ? Number(m.disk) : null,
        response_time_ms: m.response_time_ms != null ? Number(m.response_time_ms) : null,
        http_5xx_rate:    m.http_5xx_rate    != null ? Number(m.http_5xx_rate)    : null,
        db_conn_pct:      m.db_conn_pct      != null ? Number(m.db_conn_pct)      : null,
        auth_failures:    m.auth_failures,
        traffic_users:    m.traffic_users,
      });
    });
    Object.keys(byServer).forEach(k => byServer[k].sort((a, b) => a.ts - b.ts));
    WD.metricsHistory = byServer;
  }

  if (authed) resolveCurrentUserFromToken();

  notify();
}

export async function fetchNotificationTargets(incidentId) {
  try {
    const targets = await apiFetch(`/api/notifications/targets/${incidentId}`);
    WD.notificationTargetsCache[incidentId] = targets;
    notify();
    return targets;
  } catch (e) {
    WD.notificationTargetsCache[incidentId] = { __error: e.message };
    notify();
    return [];
  }
}

export async function fetchProblemTimeline(problemId) {
  try {
    const tl = await apiFetch(`/api/problems/${problemId}/timeline`);
    WD.problemTimelines[problemId] = tl;
    notify();
    return tl;
  } catch (e) {
    WD.problemTimelines[problemId] = [];
    notify();
    return [];
  }
}

export async function patchIncident(id, patch) {
  if (!WD.token) throw new Error('Not authenticated');
  const res = await fetch(WD.base + `/api/incidents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WD.token}` },
    body: JSON.stringify(patch),
    mode: 'cors',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body}`);
  }
  await refresh();
  return res.json();
}

export async function startBridge(id) {
  if (!WD.token) throw new Error('Not authenticated');
  const res = await fetch(WD.base + `/api/incidents/${id}/bridge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WD.token}` },
    mode: 'cors',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body}`);
  }
  await refresh();
  return res.json();
}

export async function endBridge(id) {
  if (!WD.token) throw new Error('Not authenticated');
  const res = await fetch(WD.base + `/api/incidents/${id}/bridge/stop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WD.token}` },
    mode: 'cors',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body}`);
  }
  await refresh();
  return res.json();
}

export async function fetchBridgeParticipants(id) {
  if (!WD.token) return [];
  try {
    const list = await apiFetch(`/api/incidents/${id}/bridge/participants`);
    WD.bridgeParticipants = { ...WD.bridgeParticipants, [id]: list };
    notify();
    return list;
  } catch (e) {
    return WD.bridgeParticipants[id] || [];
  }
}

export async function setMyBridgeState(id, state) {
  if (!WD.token) throw new Error('Not authenticated');
  const res = await fetch(WD.base + `/api/incidents/${id}/bridge/participants/me`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WD.token}` },
    body: JSON.stringify(state),
    mode: 'cors',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body}`);
  }
  await fetchBridgeParticipants(id);
  return res.json();
}

export async function createUser(payload) {
  if (!WD.token) throw new Error('Not authenticated');
  const res = await fetch(WD.base + '/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WD.token}` },
    body: JSON.stringify(payload),
    mode: 'cors',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || data?.message || `${res.status} create failed`);
  }
  const created = await res.json();
  await refresh();
  return created;
}

export async function dispatchNotifications(incidentId) {
  if (!WD.token) throw new Error('Not authenticated');
  const res = await fetch(WD.base + `/api/notifications/send/${incidentId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WD.token}` },
    mode: 'cors',
  });
  const data = await res.json();
  await refresh();
  return data.sent_count || 0;
}

export async function toggleOnCall(userId, next) {
  if (!WD.token) throw new Error('Not authenticated');
  const res = await fetch(WD.base + `/api/users/${userId}/on-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WD.token}` },
    body: JSON.stringify({ on_call_status: next }),
    mode: 'cors',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `${res.status} on-call toggle failed`);
  }
  await refresh();
  return res.json();
}
export function listMembership() {
  WD.connection.lastWarning = 'No backend endpoint for list membership.';
  notify();
}

export function setBase(url) {
  WD.base = url.replace(/\/$/, '');
  localStorage.setItem(LS_BASE, WD.base);
  WD.connection = { status: 'connecting', error: null, lastFetch: null, lastSuccess: null };
  notify();
  refresh();
}

export async function login(email, password) {
  const body = new URLSearchParams();
  body.set('username', email);
  body.set('password', password);
  const res = await fetch(WD.base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    mode: 'cors',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.detail || data?.message || 'Login failed';
    throw new Error(message);
  }
  const data = await res.json();
  if (!data?.access_token) throw new Error('Login failed: missing token');
  setToken(data.access_token);
  await refresh();
  return data;
}

export function logout() {
  clearAuth();
  refresh();
}

export function getInfrastructureHealth() {
  return WD.health.map(h => {
    const s = WD.servers.find(x => x.id === h.server_id);
    return { ...h, region: s?.region || 'unknown' };
  });
}
export function getLatest(serverId) {
  const hist = WD.metricsHistory[serverId];
  if (!hist || hist.length === 0) return null;
  return hist[hist.length - 1];
}
export function getServerStatus(serverId) {
  const s = WD.servers.find(x => x.id === serverId);
  return s ? s.status : 'unknown';
}
export function getNotificationTargets(incidentId) {
  const v = WD.notificationTargetsCache[incidentId];
  if (!v || v.__error) return [];
  return v;
}

// React hook: subscribe to store changes
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => WD.subscribe(() => force(v => v + 1)), []);
  return WD;
}

// Force re-render every `interval` ms (for relative time labels)
export function useNow(interval = 1000) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(v => v + 1), interval);
    return () => clearInterval(id);
  }, [interval]);
}

// boot + polling
refresh();
setInterval(refresh, 5000);
