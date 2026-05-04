import { useState } from 'react';
import { timeAgo } from '../utils/formatters.js';
import { normalizeSeverity, SEVERITY_LABELS } from '../utils/severity.js';
import { fetchAlarms, updateIncident } from '../services/api.js';

// Status order pentru "advance" — fiecare avansează la următorul
const STATUS_ORDER = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export function IncidentCard({ incident, onReassign, onUpdate }) {
  const [alarmCount, setAlarmCount] = useState(null);
  const severity = normalizeSeverity(incident.severity);
  
  // Fetch numărul de alarme la prima randare
  useState(() => {
    fetchAlarms({ incident_id: incident.id })
      .then(alarms => setAlarmCount(alarms.length))
      .catch(() => setAlarmCount(0));
  }, [incident.id]);
  
  // Handler pentru "Advance status" — trece la următorul status
  const handleAdvance = async (e) => {
    e.stopPropagation();
    const currentIdx = STATUS_ORDER.indexOf(incident.status);
    if (currentIdx >= STATUS_ORDER.length - 1) return; // deja CLOSED
    
    const nextStatus = STATUS_ORDER[currentIdx + 1];
    
    try {
      await updateIncident(incident.id, { status: nextStatus });
      if (onUpdate) onUpdate();  // trigger refresh în lista părinte
    } catch (err) {
      console.error('Failed to advance status:', err);
      alert(`Failed to update: ${err.message}`);
    }
  };
  
  const handleReassign = (e) => {
    e.stopPropagation();
    if (onReassign) onReassign(incident);
  };
  
  return (
    <div className={`incident-card sev-${severity}`}>
      <div className="ic-stripe" />
      
      <div className="ic-main">
        <div className="ic-row1">
          <span className={`ic-sev-tag sev-${severity}`}>
            {SEVERITY_LABELS[severity]}
          </span>
          <span className="ic-title">{incident.title}</span>
          <span className="ic-id">#{incident.id}</span>
        </div>
        
        <div className="ic-row2">
          <span className={`ic-status ${incident.status}`}>
            <span className="st-dot" />
            {incident.status.replace('_', ' ')}
          </span>
          <span className="ic-team">
            {incident.assigned_team || 'unassigned'}
          </span>
          {incident.assigned_to && (
            <span>· {incident.assigned_to}</span>
          )}
          <span className="ic-meta-sep">·</span>
          <span>opened {timeAgo(incident.created_at)}</span>
        </div>
      </div>
      
      <div className="ic-side">
        <div className="ic-side-stat alarms">
          <span>alarms</span>
          <span className="v mono">{alarmCount ?? '...'}</span>
        </div>
        <div className="ic-actions">
          <button 
            className="ic-action-btn" 
            onClick={handleReassign}
          >
            REASSIGN <span className="arrow">→</span>
          </button>
          <button 
            className="ic-action-btn" 
            onClick={handleAdvance}
            disabled={incident.status === 'CLOSED'}
          >
            ADVANCE <span className="arrow">»</span>
          </button>
        </div>
      </div>
    </div>
  );
}