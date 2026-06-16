import React, { useState } from 'react';
import { useStore, createUser } from '../api.js';
import { Avatar, Icon, Empty } from '../components/Common.jsx';
import { Modal } from '../components/Modals.jsx';

const TEAMS = ['Infrastructure', 'Backend', 'Database', 'Security', 'Executive', 'NOC'];
const ROLES = ['CEO', 'CTO', 'Incident Manager', 'System Manager', 'Engineer'];

export function UsersScreen({ currentUser }) {
  const store = useStore();
  const [showCreate, setShowCreate] = useState(false);

  // Hard guard — only the CEO manages accounts. No public register exists.
  if (currentUser.role !== 'CEO') {
    return (
      <div className="page" style={{gridTemplateRows: 'auto 1fr', gap: 12}}>
        <div className="page-header">
          <div className="page-title">User management</div>
        </div>
        <div className="card"><Empty icon="shield">Restricted · only the CEO can manage accounts</Empty></div>
      </div>
    );
  }

  const users = [...store.users].sort((a, b) =>
    (a.team_name || '').localeCompare(b.team_name || '') ||
    (a.role || '').localeCompare(b.role || '') ||
    (a.name || '').localeCompare(b.name || '')
  );

  return (
    <div className="page" style={{gridTemplateRows: 'auto 1fr', gap: 12}}>
      <div className="page-header">
        <div className="page-title">User management</div>
        <div className="page-subtitle">{users.length} accounts · only the CEO can create new accounts</div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={12} /> Create account
          </button>
        </div>
      </div>

      <div className="card" style={{minHeight: 0}}>
        <div className="card-body no-pad" style={{overflow: 'auto'}}>
          <table className="table">
            <thead><tr>
              <th>NAME</th><th>EMAIL</th><th>TEAM</th><th>ROLE</th><th>ON-CALL</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <span className="row gap-8">
                      <Avatar name={u.name} size={22} />
                      <span className="fw-500">{u.name}</span>
                      {u.id === currentUser.id && <span className="dim text-xs">· you</span>}
                    </span>
                  </td>
                  <td className="mono text-xs">{u.email}</td>
                  <td>{u.team_name || <span className="dim">—</span>}</td>
                  <td>{u.role}</td>
                  <td>
                    {u.on_call_status
                      ? <span className="pill pill-ok"><span className="dot"></span>ON-CALL</span>
                      : <span className="dim text-xs">off</span>}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5}><div className="empty">No accounts yet</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateUserModal({ onClose }) {
  const store = useStore();
  const [form, setForm] = useState({ name: '', email: '', password: '', team_name: '', role: '', on_call_status: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const teamOptions = Array.from(new Set([...(store.teams || []), ...TEAMS]));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const valid = form.name.trim() && form.email.includes('@') && form.password.length >= 6 && form.team_name && form.role;

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      await createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        team_name: form.team_name,
        role: form.role,
        on_call_status: form.on_call_status,
      });
      onClose();
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Create account"
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={!valid || submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </>}
    >
      <div className="col gap-12">
        {error && (
          <div className="card" style={{background: 'var(--critic-bg)', borderColor: 'rgba(255,77,94,0.3)'}}>
            <div style={{padding: 10, color: 'var(--critic)', fontSize: 12}} className="mono">{error}</div>
          </div>
        )}

        <div className="field">
          <label className="field-label">Full name</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Doe" />
        </div>

        <div className="field">
          <label className="field-label">Email</label>
          <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@watchdogs.local" autoComplete="off" />
        </div>

        <div className="field">
          <label className="field-label">Initial password</label>
          <input className="input mono" type="text" value={form.password} onChange={e => set('password', e.target.value)} placeholder="min. 6 characters" autoComplete="new-password" />
          <div className="dim text-xs" style={{marginTop: 4}}>Stored hashed (bcrypt). Share it with the user to sign in, they can change it later.</div>
        </div>

        <div className="row gap-12">
          <div className="field flex-1">
            <label className="field-label">Team</label>
            <select className="select" value={form.team_name} onChange={e => set('team_name', e.target.value)}>
              <option value="">— select team —</option>
              {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field flex-1">
            <label className="field-label">Role</label>
            <select className="select" value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="">— select role —</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {form.role === 'Engineer' && (
          <label className="row gap-8" style={{cursor: 'pointer', alignItems: 'center'}}>
            <input type="checkbox" checked={form.on_call_status} onChange={e => set('on_call_status', e.target.checked)} />
            <span className="text-sm">Mark as on-call</span>
          </label>
        )}
      </div>
    </Modal>
  );
}
