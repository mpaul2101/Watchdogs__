import React, { useState } from 'react';
import { useStore, useNow } from '../api.js';
import { Avatar, Icon, timeOnly, relTime } from './Common.jsx';

export function Topbar({ currentUser, onLogout, setRoute, onSettings }) {
  const store = useStore();
  useNow(1000);
  const [openNotif, setOpenNotif] = useState(false);

  const openIncidents = store.incidents.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length;
  const criticOpen = store.incidents.filter(i => (i.status === 'OPEN' || i.status === 'IN_PROGRESS') && i.severity === 'CRITIC').length;
  const onlineServers = store.servers.filter(s => s.status === 'online').length;
  const totalServers = store.servers.length;
  const myNotifs = store.notificationLog.filter(n => n.user_id === currentUser.id).slice(0, 5);
  const unreadNotifs = myNotifs.length;

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

      <div className="role-switcher" style={{gap: 10}}>
        <Avatar name={currentUser.name} size={22} />
        <div className="col" style={{gap: 2}}>
          <span className="name">{currentUser.name}</span>
          <span className="dim text-xs">{currentUser.role}</span>
        </div>
        <button className="icon-btn" onClick={onLogout} title="Log out">
          <Icon name="logout" size={16} />
        </button>
      </div>

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
