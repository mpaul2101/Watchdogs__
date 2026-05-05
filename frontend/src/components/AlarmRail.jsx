import { useState } from 'react';
import { useApiData } from '../hooks/useApiData.js';
import { fetchAlarms } from '../services/api.js';
import { AlarmRow } from './AlarmRow.jsx';

const SEVERITY_FILTERS = ['all', 'CRITIC', 'HIGH', 'MEDIUM', 'LOW'];

export function AlarmRail({ onClose }) {
  const [severityFilter, setSeverityFilter] = useState('all');
  const [paused, setPaused] = useState(false);
  
  // Fetch cu filtru — dacă filter e 'all', nu trimitem severity
  const { data: alarms, loading } = useApiData(
    () => fetchAlarms(severityFilter === 'all' ? {} : { severity: severityFilter }),
    {
      refreshMs: paused ? 0 : 3000,  // 3s normal, 0 = oprit când paused
      deps: [severityFilter, paused],
    }
  );
  
  // Counter pe severitate (din toate alarmele, nu doar filtrate)
  const counts = {
    critical: alarms?.filter(a => a.severity === 'CRITIC').length || 0,
    high: alarms?.filter(a => a.severity === 'HIGH').length || 0,
    medium: alarms?.filter(a => a.severity === 'MEDIUM').length || 0,
    low: alarms?.filter(a => a.severity === 'LOW').length || 0,
  };
  
  return (
    <div className="panel alarms">
      <div className="panel-header">
        <span className="ph-title">Alarm Stream</span>
        <span className="ph-meta" style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', marginRight: '8px' }}>
          <span style={{ color: 'var(--sev-critical)' }}>{counts.critical}</span>
          <span style={{ color: 'var(--sev-high)' }}>{counts.high}</span>
          <span style={{ color: 'var(--sev-medium)' }}>{counts.medium}</span>
          <span style={{ color: 'var(--sev-low)' }}>{counts.low}</span>
        </span>
        {onClose && (
          <button className="ip-close" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </button>
        )}
      </div>
      
      <div className="alarm-controls">
        {SEVERITY_FILTERS.map(sev => {
          const isActive = severityFilter === sev;
          const colorStyle = (isActive && sev !== 'all') ? {
            color: `var(--sev-${sev.toLowerCase()})`,
            borderColor: `var(--sev-${sev.toLowerCase()})`,
            background: `var(--sev-${sev.toLowerCase()}-bg)`,
          } : null;
          
          return (
            <button
              key={sev}
              className={`toggle ${isActive ? 'active' : ''}`}
              onClick={() => setSeverityFilter(sev)}
              style={colorStyle}
            >
              {sev === 'all' ? 'ALL' : sev[0]}
            </button>
          );
        })}
        
        <button
          className={`toggle ${!paused ? 'active' : ''}`}
          onClick={() => setPaused(!paused)}
          style={{ marginLeft: 'auto' }}
        >
          <span className="led" />
          {paused ? 'PAUSED' : 'LIVE'}
        </button>
      </div>
      
      <div className="alarm-stream">
        {loading && !alarms ? (
          <div className="empty">loading...</div>
        ) : !alarms || alarms.length === 0 ? (
          <div className="empty">
            no alarms<br />
            <span style={{ opacity: 0.6 }}>// silence_</span>
          </div>
        ) : (
          alarms.slice(0, 80).map(alarm => (
            <AlarmRow key={alarm.id} alarm={alarm} />
          ))
        )}
      </div>
      
      <div className="alarm-footer">
        <span className="live">
          <span className="led" />
          {paused ? 'paused' : 'streaming'} · {alarms?.length || 0} events
        </span>
      </div>
    </div>
  );
}