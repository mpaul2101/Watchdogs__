// Base URL pentru API-ul tău FastAPI
const API_BASE_URL = 'http://localhost:8000';

// Helper generic pentru GET requests
async function apiGet(endpoint, params = {}) {
  // Construim query string din params (ex: ?status=OPEN&severity=CRITIC)
  const queryString = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  
  const url = queryString 
    ? `${API_BASE_URL}${endpoint}?${queryString}`
    : `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

// Helper pentru PATCH requests
async function apiPatch(endpoint, body) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

// =======================================================
// ENDPOINTS — câte o funcție per endpoint
// =======================================================

// Health/heatmap data — apelează procedura ta!
export function fetchInfrastructureHealth() {
  return apiGet('/api/health');
}

// Incidente cu filtre opționale
export function fetchIncidents({ status, severity, team, server_id } = {}) {
  return apiGet('/api/incidents', { status, severity, team, server_id });
}

// Alarme cu filtre opționale
export function fetchAlarms({ severity, server_id, incident_id } = {}) {
  return apiGet('/api/alarms', { severity, server_id, incident_id });
}

// Metrici (cu filtre temporale)
export function fetchMetrics({ server_id, minutes = 60, limit = 100 } = {}) {
  return apiGet('/api/metrics', { server_id, minutes, limit });
}

// Lista de echipe
export function fetchTeams() {
  return apiGet('/api/teams');
}

// Update incident (reassign, status change)
export function updateIncident(incidentId, updates) {
  return apiPatch(`/api/incidents/${incidentId}`, updates);
}