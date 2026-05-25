import React from 'react';
import { useStore } from '../api.js';
import { Avatar, Icon } from './Common.jsx';

export function Sidebar({ route, setRoute, currentUser }) {
  const store = useStore();
  const role = currentUser.role;

  const openCount = store.incidents.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length;
  const criticOpen = store.incidents.filter(i => i.status === 'OPEN' && i.severity === 'CRITIC').length;
  const unassigned = store.incidents.filter(i => i.triage_status === 'Unassigned' && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')).length;
  const myQueue = store.incidents.filter(i => i.assigned_person === currentUser.id && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')).length;
  const problemCount = store.problems.filter(p => p.status === 'open').length;

  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'incidents', label: 'Incidents', icon: 'alert', badge: openCount > 0 ? openCount : null, badgeKind: criticOpen > 0 ? 'critic' : null },
  ];
  if (role === 'Incident Manager') {
    items.push({ id: 'triage', label: 'Triage Queue', icon: 'triage', badge: unassigned, badgeKind: unassigned > 0 ? 'critic' : null });
  }
  if (role === 'Engineer') {
    items.push({ id: 'my-queue', label: 'My Queue', icon: 'triage', badge: myQueue || null });
  }
  items.push(
    { id: 'servers', label: 'Servers', icon: 'server' },
    { id: 'metrics', label: 'Metrics', icon: 'metric' },
    { id: 'problems', label: 'Problems', icon: 'problem', badge: problemCount || null, badgeKind: 'high' },
  );

  const operations = [];
  if (role !== 'CEO' && role !== 'CTO') {
    operations.push({ id: 'notifications', label: 'Notifications', icon: 'bell' });
  } else {
    operations.push({ id: 'notifications', label: 'Alerts I Receive', icon: 'bell' });
  }
  operations.push({ id: 'teams', label: 'Teams & On-Call', icon: 'team' });

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"></div>
        <div className="brand-name">Watchdogs<span>__</span></div>
      </div>

      <div className="nav-section">Monitor</div>
      <div className="nav-list">
        {items.map(it => (
          <button key={it.id} className={`nav-item ${route === it.id ? 'active' : ''}`} onClick={() => setRoute(it.id)}>
            <span className="nav-icon"><Icon name={it.icon} /></span>
            <span>{it.label}</span>
            {it.badge && <span className={`nav-badge ${it.badgeKind || ''}`}>{it.badge}</span>}
          </button>
        ))}
      </div>

      <div className="nav-section">Operations</div>
      <div className="nav-list">
        {operations.map(it => (
          <button key={it.id} className={`nav-item ${route === it.id ? 'active' : ''}`} onClick={() => setRoute(it.id)}>
            <span className="nav-icon"><Icon name={it.icon} /></span>
            <span>{it.label}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="role-card">
          <div className="role-card-row">
            <Avatar name={currentUser.name} size={28} />
            <div className="col" style={{gap:1}}>
              <div className="role-name">{currentUser.name}</div>
              <div className="role-title">{currentUser.role}</div>
            </div>
            {currentUser.on_call_status && (
              <span className="pill pill-ok" style={{marginLeft:'auto'}}><span className="dot"></span>ON-CALL</span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
