import { formatTime } from '../utils/formatters.js';
import { normalizeSeverity } from '../utils/severity.js';

export function AlarmRow({ alarm }) {
  const severity = normalizeSeverity(alarm.severity);
  
  return (
    <div className={`alarm-row sev-${severity}`}>
      <div className="ts">{formatTime(alarm.created_at)}</div>
      <div className="sev-mark" />
      <div className="msg">
        <span className="target">{alarm.server_id}</span>{' '}
        <span style={{ color: 'var(--fg-3)' }}>{alarm.metric_type}</span>{' '}
        <span className="v">{alarm.message || ''}</span>
        <div style={{ color: 'var(--fg-3)', fontSize: 10.5, marginTop: 2 }}>
          #{alarm.id}
        </div>
      </div>
    </div>
  );
}