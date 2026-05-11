import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchNotificationTargets, sendNotifications } from '../services/api.js';

export function NotifyModal({ incident, onClose, onSuccess }) {
  const { currentUser } = useAuth();
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    fetchNotificationTargets(incident.id)
      .then(data => {
        setTargets(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [incident.id]);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await sendNotifications(incident.id, currentUser?.id);
      if (res.status === 'success') {
        onSuccess(res.sent_count);
        onClose();
      } else {
        alert('Failed to send notifications: ' + res.message);
        setSending(false);
      }
    } catch (err) {
      alert('Error sending notifications: ' + err.message);
      setSending(false);
    }
  };

  // Grouping logic
  const groups = {
    red: { title: 'RED LIST (Executive)', items: [] },
    yellow: { title: 'YELLOW LIST', items: [] },
    green: { title: 'GREEN LIST', items: [] },
    on_call_team: { title: 'ON-CALL TEAM', items: [] },
    team_manager: { title: 'TEAM MANAGER', items: [] }
  };

  targets.forEach(t => {
    if (groups[t.list_name]) {
      groups[t.list_name].items.push(t);
    } else {
      // In case there's another list name
      if (!groups.other) {
        groups.other = { title: 'OTHER', items: [] };
      }
      groups.other.items.push(t);
    }
  });

  return (
    <div className="modal-overlay notify-overlay" onClick={onClose}>
      <div className="modal notify-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Notification Preview</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-subhead">
          <p>{incident.title}</p>
          <p className="mono">#{incident.id} · {incident.severity} · {incident.status}</p>
        </div>

        <div className="modal-body">
          {loading ? (
            <p className="loading-state">Loading targets...</p>
          ) : error ? (
            <p className="error-state">Error: {error}</p>
          ) : (
            <>
              <p className="notify-intro">This incident will notify the following people:</p>
              <div className="notify-targets">
                {Object.values(groups).map(g => g && g.items.length > 0 && (
                  <div key={g.title} className="target-group">
                    <h4>{g.title}</h4>
                    <ul>
                      {g.items.map(user => (
                        <li key={user.user_id}>
                          ● {user.user_name} — {user.user_role}
                          {user.list_name === 'on_call_team' ? ' (ON-CALL)' : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {targets.length === 0 && (
                  <p className="no-targets">No targets found for this incident.</p>
                )}
              </div>

              <div className="notify-template-preview">
                <h4>Template preview:</h4>
                <div className="template-box">
                  <p><strong>{incident.severity}</strong>: {incident.title}</p>
                  <br />
                  <p>Server: {incident.server_id}</p>
                  <p>Metric: {incident.metric_type}</p>
                  <p>Incident ID: #{incident.id}</p>
                  <p>Severity: {incident.severity}</p>
                  <p>Assigned team: {incident.assigned_team}</p>
                  <br />
                  <p>Immediate action required. War room scheduled.</p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose} disabled={sending}>Cancel</button>
          <button className="btn-primary btn-send" onClick={handleSend} disabled={sending || loading || targets.length === 0}>
            {sending ? 'Sending...' : 'Send Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
