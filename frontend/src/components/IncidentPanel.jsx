import { useState, useEffect } from 'react';
import { timeAgo } from '../utils/formatters.js';
import { normalizeSeverity, SEVERITY_LABELS } from '../utils/severity.js';
import { fetchAlarms } from '../services/api.js';

export function IncidentPanel({ incident, onClose }) {
  const [alarms, setAlarms] = useState([]);
  const severity = normalizeSeverity(incident.severity);

  useEffect(() => {
    fetchAlarms({ incident_id: incident.id })
      .then(data => setAlarms(data))
      .catch(() => setAlarms([]));
  }, [incident.id]);

  if (!incident) return null;

  return (
    <div className="incident-panel">
      <div className="ip-header">
        <div className="ip-header-top">
          <span className="ip-id">INC-{incident.id} - SEVERITY {SEVERITY_LABELS[severity]}</span>
          <button className="ip-close" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </button>
        </div>
        <h2 className="ip-title">{incident.title}</h2>
        <div className="ip-meta">
          <span className={`ip-status-dot sev-${severity}`}></span>
          <span className={`ip-sev-text sev-${severity}`}>{SEVERITY_LABELS[severity]}</span>
          <span>{incident.status}</span>
          <span>{incident.assigned_team || 'unassigned'}</span>
          <span>opened {timeAgo(incident.created_at)}</span>
        </div>
      </div>

      <div className="ip-body">
        {/* SNAPSHOT */}
        <div className="ip-section">
          <div className="ip-sec-title">SNAPSHOT</div>
          <div className="ip-snapshot-grid">
            <div className="ip-snap-box">
              <span className="label">SERVER</span>
              <span className="val">{incident.server_id || 'unknown'}</span>
            </div>
            <div className="ip-snap-box">
              <span className="label">ALARMS</span>
              <span className="val">{alarms.length}</span>
            </div>
            <div className="ip-snap-box">
              <span className="label">CREATED</span>
              <span className="val">{new Date(incident.created_at).toLocaleString('sv').replace(',', '')}</span>
            </div>
            <div className="ip-snap-box">
              <span className="label">UPDATED</span>
              <span className="val">{new Date(incident.updated_at).toLocaleString('sv').replace(',', '')}</span>
            </div>
          </div>
        </div>

        {/* SEVERITY HISTORY (Mock) */}
        <div className="ip-section">
          <div className="ip-sec-title">SEVERITY HISTORY (LAST 60 MIN)</div>
          <div className="ip-history-chart">
            <div className="ih-bars">
              {[...Array(12)].map((_, i) => {
                let colorClass = 'bg-3'; // normal
                if (i > 8) colorClass = `sev-${severity}-bg`;
                else if (i > 4) colorClass = 'sev-medium-bg';
                else if (i > 2) colorClass = 'sev-high-bg';
                return <div key={i} className={`ih-bar ${colorClass}`}></div>;
              })}
            </div>
            <div className="ih-labels">
              <span>-60m</span>
              <span>-45m</span>
              <span>-30m</span>
              <span>-15m</span>
              <span>now</span>
            </div>
          </div>
        </div>

        {/* ASSOCIATED ALARMS */}
        <div className="ip-section">
          <div className="ip-sec-title">ASSOCIATED ALARMS ({Math.min(alarms.length, 6)} OF {alarms.length})</div>
          <div className="ip-alarms-list">
            {alarms.slice(0, 6).map(a => {
              const aSev = normalizeSeverity(a.severity);
              return (
                <div key={a.id} className="ip-alarm-row">
                  <span className="time">{new Date(a.created_at).toLocaleTimeString('sv')}</span>
                  <span className={`dot sev-${aSev}`}></span>
                  <span className="msg" dangerouslySetInnerHTML={{ __html: a.message.replace(/([0-9]+(ms|%|rpm|)?)/g, `<span class="val sev-${aSev}">$1</span>`) }}></span>
                  <span className="id">A-{a.id.toString().substring(0, 4).toUpperCase()}</span>
                </div>
              );
            })}
            {alarms.length === 0 && <div className="empty">No associated alarms found.</div>}
          </div>
        </div>

        {/* TIMELINE (Mock) */}
        <div className="ip-section">
          <div className="ip-sec-title">TIMELINE</div>
          <div className="ip-timeline">
            <div className="tl-item">
              <div className="tl-icon blue"></div>
              <div className="tl-content">
                <div className="time">{new Date(incident.created_at).toLocaleString('sv').replace(',', '')}</div>
                <div className="text">Incident opened automatically. Threshold breach on {incident.server_id || 'server'}.</div>
                <div className="author">— watchdogs.bot</div>
              </div>
            </div>
            <div className="tl-item">
              <div className="tl-icon red"></div>
              <div className="tl-content">
                <div className="time">{new Date(new Date(incident.created_at).getTime() + 15 * 60000).toLocaleString('sv').replace(',', '')}</div>
                <div className="text">Severity escalated to {incident.severity} after sustained breach.</div>
                <div className="author">— watchdogs.bot</div>
              </div>
            </div>
            {incident.assigned_team && (
              <div className="tl-item">
                <div className="tl-icon gray"></div>
                <div className="tl-content">
                  <div className="time">{new Date(new Date(incident.created_at).getTime() + 20 * 60000).toLocaleString('sv').replace(',', '')}</div>
                  <div className="text">Auto-routed to {incident.assigned_team}.</div>
                  <div className="author">— router.v2</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ip-footer">
        <div className="ip-status-group">
          <button className={`ip-btn-status ${incident.status === 'OPEN' ? 'active' : ''}`}>OPEN</button>
          <button className={`ip-btn-status ${incident.status === 'IN_PROGRESS' ? 'active' : ''}`}>IN PROGRESS</button>
          <button className={`ip-btn-status ${incident.status === 'RESOLVED' ? 'active' : ''}`}>RESOLVED</button>
          <button className={`ip-btn-status ${incident.status === 'CLOSED' ? 'active' : ''}`}>CLOSED</button>
        </div>
        <div className="ip-actions-group">
          <button className="ip-btn-action">Reassign team</button>
          <button className="ip-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
