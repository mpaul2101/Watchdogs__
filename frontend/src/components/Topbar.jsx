import React, { useState, useMemo } from 'react';
import { useStore, useNow } from '../api.js';
import { Avatar, Icon, timeOnly, relTime } from './Common.jsx';

export function Topbar({ currentUser, setCurrentUser, setRoute, onSettings }) {
  const store = useStore();
  useNow(1000);
  const [openSwitch, setOpenSwitch] = useState(false);
  const [openNotif, setOpenNotif] = useState(false);

  const openIncidents = store.incidents.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length;
  const criticOpen = store.incidents.filter(i => (i.status === 'OPEN' || i.status === 'IN_PROGRESS') && i.severity === 'CRITIC').length;
  const onlineServers = store.servers.filter(s => s.status === 'online').length;
  const totalServers = store.servers.length;
  const myNotifs = store.notificationLog.filter(n => n.user_id === currentUser.id).slice(0, 5);
  const unreadNotifs = myNotifs.length;

  const groupedUsers = useMemo(() => {
    const groups = {};
    store.users.forEach(u => {
      if (!groups[u.role]) groups[u.role] = [];
      groups[u.role].push(u);
    });
    return groups;
  }, [store.users]);

  const roleOrder = ['CEO', 'CTO', 'Incident Manager', 'System Manager', 'Engineer'];

  const conn = store.connection;
  const connClass = conn.status === 'connected' ? 'pill-ok' : conn.status === 'connecting' ? 'pill-warn' : 'sev-critic';
  const connLabel = conn.status === 'connected' ? 'API' : conn.status === 'connecting' ? 'connecting' : 'offline';

  return (
    <header className="topbar">
      <div className="topbar-search">
        <input className="search-input" placeholder="Search incidents, servers, users… ⌘K" />
      </div>

      <div className="topbar-spacer"></div>

      <button className={`pill ${connClass}`} style={{cursor: 'pointer', border: 'none'}} onClick={onSettings} title={`${store.base} · ${conn.status}`}>
        <span className="dot"></span>{connLabel}
      </button>

      <div className="live-ticker">
        <span className="live-dot" style={{background: conn.status === 'connected' ? 'var(--ok)' : 'var(--text-4)'}}></span>
        <span className="mono tnum">{conn.status === 'connected' ? 'LIVE' : 'IDLE'}</span>
        <span className="dim">·</span>
        <span className="mono">{timeOnly(new Date().toISOString())}</span>
      </div>

      <div className="topbar-stat">
        <span>Open</span>
        <span className="num">{openIncidents}</span>
        {criticOpen > 0 && <span className="pill sev-critic" style={{padding:'1px 6px'}}>{criticOpen}C</span>}
      </div>
      <div className="topbar-stat">
        <span>Servers</span>
        <span className="num">{onlineServers}/{totalServers}</span>
      </div>

      <button className="icon-btn" onClick={() => setOpenNotif(o => !o)}>
        <Icon name="bell" size={18} />
        {unreadNotifs > 0 && <span className="ping"></span>}
      </button>

      <button className="icon-btn" onClick={onSettings} title="API settings">
        <Icon name="settings" size={18} />
      </button>

      <div className="role-switcher" onClick={() => setOpenSwitch(o => !o)}>
        <Avatar name={currentUser.name} size={22} />
        <span className="name">{currentUser.name}</span>
        <span className="dim text-xs">·</span>
        <span className="dim text-xs">{currentUser.role}</span>
        <span className="chev"><Icon name="chev" size={14} /></span>
      </div>

      {openSwitch && (
        <div className="dropdown" onClick={(e) => e.stopPropagation()} style={{right: 16, top: 46, minWidth: 280}}>
          <div className="dropdown-section-title">Impersonate user · Role-aware view</div>
          {roleOrder.map(role => groupedUsers[role] && (
            <div key={role}>
              <div className="dropdown-section-title" style={{paddingTop: 6}}>{role}</div>
              {groupedUsers[role].map(u => (
                <div key={u.id} className={`dropdown-item ${currentUser.id === u.id ? 'selected' : ''}`} onClick={() => { setCurrentUser(u); setOpenSwitch(false); }}>
                  <Avatar name={u.name} size={26} />
                  <div className="col" style={{gap: 1}}>
                    <div style={{fontSize: 12.5, fontWeight: 500}}>{u.name}</div>
                    <div className="meta">{u.team_name}{u.on_call_status ? ' · on-call' : ''}</div>
                  </div>
                  {currentUser.id === u.id && <span className="check"><Icon name="check" size={14} /></span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {openNotif && (
        <div className="dropdown" onClick={(e) => e.stopPropagation()} style={{right: 90, top: 46, minWidth: 360}}>
          <div className="dropdown-section-title">Recent notifications</div>
          {myNotifs.length === 0 && <div className="empty" style={{padding: 24}}>No notifications</div>}
          {myNotifs.map(n => (
            <div key={n.id} className="dropdown-item" onClick={() => { setRoute('notifications'); setOpenNotif(false); }}>
              <div className="col" style={{flex: 1, gap: 2}}>
                <div style={{fontSize: 12, fontWeight: 500}}>{n.rendered_subject}</div>
                <div className="meta">{n.list_name} · {relTime(n.sent_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
