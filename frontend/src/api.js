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
const LS_USER = 'watchdogs.api.userId';

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

  // === current impersonated user ===
  currentUser: null,

  // === connection ===
  connection: { status: 'connecting', error: null, lastFetch: null, lastSuccess: null },

  // === config ===
  base: localStorage.getItem(LS_BASE) || 'http://localhost:8000',

  subscribe,
};

async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (WD.currentUser) headers['X-Mock-User-Id'] = String(WD.currentUser.id);
  const res = await fetch(WD.base + path, { ...opts, headers, mode: 'cors' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function refresh() {
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
    incidents:     WD.currentUser ? apiFetch('/api/incidents') : null,
    notifLog:      WD.currentUser ? apiFetch('/api/notifications/log?limit=200') : null,
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

  if (!WD.currentUser && WD.users.length > 0) {
    const savedId = Number(localStorage.getItem(LS_USER));
    const found = savedId ? WD.users.find(x => x.id === savedId) : null;
    WD.currentUser = found || WD.users.find(x => x.role === 'Incident Manager') || WD.users[0];
    Promise.allSettled([
      apiFetch('/api/incidents').then(d => { WD.incidents = d; }),
      apiFetch('/api/notifications/log?limit=200').then(d => { WD.notificationLog = d; }),
    ]).then(notify).catch(() => {});
  }

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
  if (!WD.currentUser) throw new Error('No current user');
  const res = await fetch(WD.base + `/api/incidents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Mock-User-Id': String(WD.currentUser.id) },
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
  if (!WD.currentUser) throw new Error('No current user');
  const res = await fetch(WD.base + `/api/incidents/${id}/bridge`, {
    method: 'POST',
    headers: { 'X-Mock-User-Id': String(WD.currentUser.id) },
    mode: 'cors',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body}`);
  }
  await refresh();
  return res.json();
}

export async function dispatchNotifications(incidentId) {
  if (!WD.currentUser) throw new Error('No current user');
  const res = await fetch(WD.base + `/api/notifications/send/${incidentId}`, {
    method: 'POST',
    headers: { 'X-Mock-User-Id': String(WD.currentUser.id) },
    mode: 'cors',
  });
  const data = await res.json();
  await refresh();
  return data.sent_count || 0;
}

export function toggleOnCall() {
  WD.connection.lastWarning = 'No backend endpoint for on_call toggle — add POST /api/users/{id}/on-call';
  notify();
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

export function setCurrentUser(u) {
  WD.currentUser = u;
  if (u) localStorage.setItem(LS_USER, String(u.id));
  notify();
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
