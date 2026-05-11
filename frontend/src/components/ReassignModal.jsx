import { useMemo, useState, useEffect } from 'react';
import { fetchTeams, updateIncident } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export function ReassignModal({ incident, onClose, onSuccess }) {
  const [team, setTeam] = useState(incident.assigned_team || '');
  const [assignedPersonId, setAssignedPersonId] = useState(incident.assigned_person ?? '');
  const [teams, setTeams] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const { users } = useAuth();
  
  // Fetch lista echipelor disponibile
  useEffect(() => {
    fetchTeams().then(setTeams).catch(console.error);
  }, []);

  const engineers = useMemo(() => {
    return users.filter(
      (u) => u.role === 'Engineer' && (!team || u.team_name === team)
    );
  }, [users, team]);

  useEffect(() => {
    if (!assignedPersonId) return;
    const selected = engineers.find((u) => u.id === Number(assignedPersonId));
    if (!selected) setAssignedPersonId('');
  }, [engineers, assignedPersonId]);
  
  // Esc pentru închidere
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const updates = {};
      if (team !== incident.assigned_team) updates.assigned_team = team;
      const currentAssigned = incident.assigned_person ?? '';
      if (String(currentAssigned) !== String(assignedPersonId)) {
        updates.assigned_person = assignedPersonId ? Number(assignedPersonId) : null;
      }
      
      if (Object.keys(updates).length > 0) {
        await updateIncident(incident.id, updates);
      }
      
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      alert(`Failed to update: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Reassign Incident</div>
            <div className="modal-subtitle">{incident.title}</div>
            <div className="mono" style={{ marginTop: 6, fontSize: 11, color: 'var(--fg-3)' }}>
              #{incident.id} · {incident.severity} · {incident.status}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <line x1="2" y1="2" x2="12" y2="12"/>
              <line x1="12" y1="2" x2="2" y2="12"/>
            </svg>
          </button>
        </div>
        
        <div className="modal-body">
          <div className="modal-section">Route to team</div>
          <div className="team-options">
            {teams.map(t => (
              <button
                key={t}
                className={`team-option ${team === t ? 'selected' : ''} ${incident.assigned_team === t ? 'current' : ''}`}
                onClick={() => setTeam(t)}
              >
                <span className="swatch" style={{ background: 'var(--accent)' }} />
                <span className="name">{t}</span>
              </button>
            ))}
          </div>
          
          <div className="modal-section">Assign engineer</div>
          <select
            className="modal-select"
            value={assignedPersonId}
            onChange={(e) => setAssignedPersonId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {engineers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.team_name}
              </option>
            ))}
          </select>
          {engineers.length === 0 && (
            <div className="modal-hint">No engineers available for this team.</div>
          )}
        </div>
        
        <div className="modal-footer">
          <span className="hint">esc to cancel</span>
          <button className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button 
            className="btn primary" 
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  );
}