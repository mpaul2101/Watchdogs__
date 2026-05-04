import { useState } from 'react';
import { useApiData } from '../hooks/useApiData.js';
import { fetchInfrastructureHealth } from '../services/api.js';
import { healthStatusToSeverity } from '../utils/severity.js';
import { HeatCell } from './HeatCell.jsx';

export function Heatmap() {
  // Fetch automat la 5 secunde, prin custom hook-ul nostru
  const { data: servers, loading, error } = useApiData(
    fetchInfrastructureHealth,
    { refreshMs: 5000 }
  );
  
  // State pentru tooltip pe hover
  const [hoveredServer, setHoveredServer] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const handleMouseMove = (e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };
  
  // Loading state
  if (loading && !servers) {
    return (
      <div className="panel metrics">
        <div className="panel-header">
          <span className="ph-title">Live Infrastructure Health</span>
        </div>
        <div className="empty">loading data...</div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="panel metrics">
        <div className="panel-header">
          <span className="ph-title">Live Infrastructure Health</span>
        </div>
        <div className="empty" style={{ color: 'var(--sev-critical)' }}>
          ⚠ failed to load: {error.message}
          <br />
          <span style={{ opacity: 0.6 }}>// is the backend running?</span>
        </div>
      </div>
    );
  }
  
  const serverCount = servers?.length || 0;
  
  return (
    <div className="panel metrics">
      <div className="panel-header">
        <span className="ph-title">Live Infrastructure Health · {serverCount} servers</span>
        <span className="ph-meta">
          <span>cpu · ram · disk</span>
          <span style={{ color: 'var(--fg-3)' }}>refresh 5s</span>
        </span>
      </div>
      
      <div className="heatmap" onMouseMove={handleMouseMove}>
        {servers.map(server => (
          <HeatCell
            key={server.server_id}
            server={server}
            onMouseEnter={() => setHoveredServer(server)}
            onMouseLeave={() => setHoveredServer(null)}
          />
        ))}
      </div>
      
      <div className="heatmap-legend">
        <span>
          <span className="swatch" style={{ background: 'var(--bg-3)' }} />
          OK
        </span>
        <span>
          <span className="swatch" style={{ 
            background: 'var(--sev-high-bg)', 
            borderColor: 'rgba(249,115,22,0.55)' 
          }} />
          warning
        </span>
        <span>
          <span className="swatch" style={{ 
            background: 'var(--sev-critical-bg)', 
            borderColor: 'rgba(239,68,68,0.7)' 
          }} />
          critical
        </span>
      </div>
      
      {/* Tooltip floating când hover pe o cell */}
      {hoveredServer && (
        <div
          className="heat-tooltip"
          style={{
            left: Math.min(window.innerWidth - 220, mousePos.x + 14),
            top: Math.min(window.innerHeight - 200, mousePos.y + 14),
          }}
        >
          <div className="tt-id">{hoveredServer.server_id}</div>
          <div className="tt-row">
            <span>status</span>
            <span className="v">{hoveredServer.health_status}</span>
          </div>
          <div className={`tt-row ${hoveredServer.avg_cpu > 70 ? 'high' : ''}`}>
            <span>avg cpu</span>
            <span className="v">{hoveredServer.avg_cpu}%</span>
          </div>
          <div className={`tt-row ${hoveredServer.avg_ram > 70 ? 'high' : ''}`}>
            <span>avg ram</span>
            <span className="v">{hoveredServer.avg_ram}%</span>
          </div>
          <div className="tt-row">
            <span>avg disk</span>
            <span className="v">{hoveredServer.avg_disk}%</span>
          </div>
          <div className={`tt-row ${hoveredServer.max_cpu > 90 ? 'crit' : ''}`}>
            <span>max cpu</span>
            <span className="v">{hoveredServer.max_cpu}%</span>
          </div>
          <div className="tt-row">
            <span>incidents</span>
            <span className="v">{hoveredServer.open_incidents}</span>
          </div>
        </div>
      )}
    </div>
  );
}