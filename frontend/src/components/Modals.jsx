import React, { useState, useEffect } from 'react';
import { useStore, WD, patchIncident, startBridge, dispatchNotifications, fetchNotificationTargets } from '../api.js';
import { SeverityPill, Avatar, Icon, relTime } from './Common.jsx';

export function Modal({ title, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" style={{marginLeft:'auto'}} onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ReassignModal({ incident, currentUser, onClose }) {
  const store = useStore();
  const [team, setTeam] = useState(incident.assigned_team || '');
  const [personId, setPersonId] = useState(incident.assigned_person || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const teamEngineers = store.users.filter(u => u.role === 'Engineer' && (!team || u.team_name === team));
  const blockers = [];
  if (currentUser.role !== 'Incident Manager') blockers.push('Only Incident Manager can assign incidents.');
  if (incident.triage_status !== 'Unassigned' && !incident.assigned_person) blockers.push('Incident is not in triage queue.');
  if (incident.bridge_required && incident.bridge_status !== 'Active') blockers.push('Bridge must be active before assignment.');

  const canSubmit = blockers.length === 0 && team && personId;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await patchIncident(incident.id, {
        assigned_team: team,
        assigned_person: Number(personId),
        triage_status: 'Assigned',
        status: incident.status === 'OPEN' ? 'IN_PROGRESS' : incident.status,
      });
      onClose();
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`Assign incident #${incident.id}`}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={!canSubmit || submitting}>{submitting ? 'Assigning…' : 'Assign & start work'}</button>
      </>}
    >
      <div className="col gap-12">
        <div className="card" style={{background:'var(--bg-elev)'}}>
          <div style={{padding: 12}}>
            <div className="row gap-8" style={{marginBottom: 6}}>
              <SeverityPill value={incident.severity} />
              <span className="mono dim text-xs">{incident.metric_type}</span>
              <span className="mono dim text-xs">·</span>
              <span className="mono text-xs">{incident.server_id}</span>
            </div>
            <div className="text-md fw-500">{incident.title}</div>
          </div>
        </div>

        {error && (
          <div className="card" style={{background:'var(--critic-bg)', borderColor: 'rgba(255,77,94,0.3)'}}>
            <div style={{padding: 10, color: 'var(--critic)', fontSize: 12}} className="mono">{error}</div>
          </div>
        )}

        {blockers.length > 0 && (
          <div className="card" style={{background:'var(--critic-bg)', borderColor: 'rgba(255,77,94,0.3)'}}>
            <div style={{padding: 10}}>
              {blockers.map((b, i) => <div key={i} className="row gap-6" style={{color:'var(--critic)', fontSize: 12}}><Icon name="alert" size={14} />{b}</div>)}
              {incident.bridge_required && incident.bridge_status !== 'Active' && currentUser.role === 'Incident Manager' && (
                <button className="btn btn-sm btn-primary" style={{marginTop: 8}} onClick={() => startBridge(incident.id).catch(e => alert(e.message))}>
                  <Icon name="phone" size={12} /> Start bridge call
                </button>
              )}
            </div>
          </div>
        )}

        <div className="row gap-12">
          <div className="field flex-1">
            <label className="field-label">Team</label>
            <select className="select" value={team} onChange={e => { setTeam(e.target.value); setPersonId(''); }}>
              <option value="">— select team —</option>
              {store.teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field flex-1">
            <label className="field-label">Engineer</label>
            <select className="select" value={personId} onChange={e => setPersonId(e.target.value)} disabled={!team}>
              <option value="">— select engineer —</option>
              {teamEngineers.map(u => <option key={u.id} value={u.id}>{u.name} {u.on_call_status ? '· on-call' : ''}</option>)}
            </select>
          </div>
        </div>

        {team && (
          <div className="col gap-6">
            <div className="field-label">Engineers in {team}</div>
            <div className="col gap-4">
              {teamEngineers.map(u => (
                <div key={u.id} className="team-member" style={{background: Number(personId) === u.id ? 'var(--surface-2)' : 'transparent', cursor: 'pointer'}} onClick={() => setPersonId(u.id)}>
                  <Avatar name={u.name} size={24} />
                  <span className="name">{u.name}</span>
                  {u.on_call_status && <span className="on-call">ON-CALL</span>}
                  <span className="role-tag">{u.email}</span>
                </div>
              ))}
              {teamEngineers.length === 0 && <div className="dim text-xs" style={{padding: 8}}>No engineers in this team.</div>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function NotifyModal({ incident, currentUser, onClose }) {
  const store = useStore();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchNotificationTargets(incident.id);
  }, [incident.id]);

  const cache = store.notificationTargetsCache[incident.id];
  const targets = (cache && !cache.__error) ? cache : [];
  const fetchError = cache && cache.__error;
  const loading = !cache;

  const send = async () => {
    setSending(true);
    try {
      await dispatchNotifications(incident.id);
      onClose();
    } catch (e) {
      console.error(e);
      setSending(false);
    }
  };

  const priorityLabel = (p) => p === 1 ? 'Distribution list' : p === 2 ? 'On-call' : 'Team manager';

  return (
    <Modal
      title={`Send notifications · Incident #${incident.id}`}
      onClose={onClose}
      size="lg"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={send} disabled={targets.length === 0 || sending}>
          <Icon name="send" size={12} /> {sending ? 'Sending…' : `Send to ${targets.length} ${targets.length === 1 ? 'recipient' : 'recipients'}`}
        </button>
      </>}
    >
      <div className="col gap-12">
        <div className="card" style={{background:'var(--bg-elev)'}}>
          <div style={{padding: 12}}>
            <div className="row gap-8" style={{marginBottom: 6}}>
              <SeverityPill value={incident.severity} />
              <span className="mono dim text-xs">{incident.metric_type}</span>
              <span className="mono text-xs">{incident.server_id}</span>
            </div>
            <div className="text-md fw-500">{incident.title}</div>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Recipients ({targets.length})</label>
          <div className="col gap-4" style={{marginTop: 6}}>
            {loading && <div className="dim text-xs" style={{padding: 12}}>Loading targets from /api/notifications/targets…</div>}
            {fetchError && <div style={{padding: 12, color: 'var(--critic)', fontSize: 12}}>Failed to fetch targets: {fetchError}</div>}
            {targets.map(t => (
              <div key={`${t.user_id}-${t.list_name}`} className="row gap-12" style={{padding: '8px 10px', background: 'var(--bg-elev)', borderRadius: 6, border: '1px solid var(--border-soft)'}}>
                <Avatar name={t.user_name} size={28} />
                <div className="col" style={{gap: 1, flex: 1}}>
                  <div className="text-sm fw-500">{t.user_name} <span className="dim">· {t.user_role}</span></div>
                  <div className="dim text-xs mono">{t.user_email}</div>
                </div>
                <div className="col" style={{alignItems: 'flex-end', gap: 2}}>
                  <span className={`pill ${t.list_name === 'red' ? 'sev-critic' : t.list_name === 'yellow' ? 'sev-medium' : t.list_name === 'green' ? 'pill-ok' : 'pill-info'}`}><span className="dot"></span>{t.list_name}</span>
                  <span className="dim text-xs">{priorityLabel(t.priority)}</span>
                </div>
              </div>
            ))}
            {!loading && !fetchError && targets.length === 0 && <div className="dim text-xs" style={{padding: 12}}>No recipients matched. Make sure the incident has an assigned team and severity.</div>}
          </div>
        </div>

        <div className="field">
          <label className="field-label">Rendered message preview</label>
          <div className="card" style={{background: 'var(--bg)', marginTop: 6}}>
            <div style={{padding: 12, fontFamily: 'Geist Mono, monospace', fontSize: 11.5, whiteSpace: 'pre-wrap', color: 'var(--text-2)'}}>
              <div style={{color: 'var(--text)', fontWeight: 600, marginBottom: 8}}>Subject: {incident.severity}: {incident.metric_type} on {incident.server_id}</div>
              Server: {incident.server_id}{'\n'}
              Metric: {incident.metric_type}{'\n'}
              Severity: {incident.severity}{'\n'}
              Incident ID: #{incident.id}{'\n'}
              Assigned team: {incident.assigned_team || 'unassigned'}{'\n\n'}
              {incident.severity === 'CRITIC' && 'Immediate action required. War room scheduled.'}
              {incident.severity === 'HIGH' && 'Please investigate within 30 minutes.'}
              {incident.severity === 'MEDIUM' && 'For your awareness. Monitor situation.'}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function StatusModal({ incident, currentUser, onClose }) {
  const [status, setStatus] = useState(incident.status);
  const [note, setNote] = useState('');
  const states = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

  const submit = async () => {
    try {
      await patchIncident(incident.id, { status });
      onClose();
    } catch (e) {
      alert('Failed: ' + e.message);
    }
  };

  return (
    <Modal
      title={`Update status · Incident #${incident.id}`}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}>Save</button>
      </>}
    >
      <div className="col gap-12">
        <div className="field">
          <label className="field-label">Status</label>
          <div className="chip-row" style={{marginTop: 6}}>
            {states.map(s => (
              <button key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
                {s.replace('_',' ')}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label">Resolution note (optional)</label>
          <textarea className="textarea" rows={4} placeholder="Root cause, fix applied, follow-ups…" value={note} onChange={e => setNote(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
