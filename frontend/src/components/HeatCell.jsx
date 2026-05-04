import { healthStatusToSeverity } from '../utils/severity.js';

// Calculează culoarea pentru o bară (CPU/RAM/DISK) în funcție de valoare
function getBarColor(value, severity) {
  if (value > 90) return 'var(--sev-critical)';
  if (value > 75) return 'var(--sev-high)';
  if (value > 55) return 'var(--sev-medium)';
  if (severity === 'critical') return 'var(--sev-critical)';
  if (severity === 'high') return 'var(--sev-high)';
  return '#4b5562';
}

export function HeatCell({ server, onMouseEnter, onMouseLeave }) {
  // Mapăm health_status (CRITIC/WARNING/OK) la severity (critical/high/low)
  const severity = healthStatusToSeverity(server.health_status);
  
  return (
    <div
      className={`heat-cell sev-${severity}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="hc-id">{server.server_id}</div>
      
      <div className="hc-bars">
        <div
          className="hc-bar"
          style={{
            height: `${Math.max(2, server.avg_cpu)}%`,
            background: getBarColor(server.avg_cpu, severity),
          }}
          title="cpu"
        />
        <div
          className="hc-bar"
          style={{
            height: `${Math.max(2, server.avg_ram)}%`,
            background: getBarColor(server.avg_ram, severity),
          }}
          title="ram"
        />
        <div
          className="hc-bar"
          style={{
            height: `${Math.max(2, server.avg_disk)}%`,
            background: getBarColor(server.avg_disk, severity),
          }}
          title="disk"
        />
      </div>
      
      <div className="hc-meta">
        <span>{server.avg_cpu}%</span>
        <span>{server.health_status}</span>
      </div>
    </div>
  );
}