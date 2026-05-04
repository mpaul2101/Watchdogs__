// Constante pentru severități
export const SEVERITY_LEVELS = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

// Mapare backend → frontend
// Backend folosește 'CRITIC', frontend folosește 'critical'
export function normalizeSeverity(backendSeverity) {
  const map = {
    CRITIC: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
  };
  return map[backendSeverity] || 'low';
}

// Mapare health_status → severity (pentru heatmap)
// Backend returnează 'CRITIC', 'WARNING', 'OK' din procedura get_infrastructure_health
export function healthStatusToSeverity(status) {
  if (status === 'CRITIC') return 'critical';
  if (status === 'WARNING') return 'high';
  return 'low'; // 'OK' → low (verde)
}

// Pentru afișare în UI
export const SEVERITY_LABELS = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

// Ordine numerică pentru sortare
export function severityRank(severity) {
  const ranks = { critical: 0, high: 1, medium: 2, low: 3 };
  return ranks[severity] ?? 9;
}