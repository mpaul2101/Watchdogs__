/* Main app shell — routes between screens */

import React, { useState } from 'react';
import { useStore, setBase, refresh, logout } from './api.js';
import { Icon, relTime } from './components/Common.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { Topbar } from './components/Topbar.jsx';
import { Modal } from './components/Modals.jsx';
import { LoginScreen } from './screens/Login.jsx';
import { DashboardScreen } from './screens/Dashboard.jsx';
import { IncidentsScreen } from './screens/Incidents.jsx';
import { TriageScreen } from './screens/Triage.jsx';
import { ServersScreen } from './screens/Servers.jsx';
import { MetricsScreen } from './screens/Metrics.jsx';
import { ProblemsScreen } from './screens/Problems.jsx';
import { NotificationsScreen } from './screens/Notifications.jsx';
import { TeamsScreen } from './screens/Teams.jsx';

export default function App() {
  const store = useStore();
  const [route, setRoute] = useState('dashboard');
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const currentUser = store.currentUser;
  const isAuthenticated = Boolean(store.token);

  const openIncident = (id) => { setRoute('incidents'); setSelectedIncidentId(id); };
  const openServer = (id) => { setRoute('metrics'); window.__focusServer = id; };

  if (!isAuthenticated) {
    return (
      <>
        <LoginScreen onSettings={() => setShowSettings(true)} onRetry={refresh} />
        {showSettings && <SettingsModal store={store} onClose={() => setShowSettings(false)} />}
      </>
    );
  }

  if (!currentUser) {
    return (
      <div className="app" style={{gridTemplateColumns: '1fr', gridTemplateAreas: '"topbar" "main"'}}>
        <header className="topbar">
          <div className="brand" style={{borderRight: 'none', padding: 0, gap: 10}}>
            <div className="brand-mark"></div>
            <div className="brand-name">Watchdogs<span>__</span></div>
          </div>
          <div className="topbar-spacer"></div>
          <ConnectionPill connection={store.connection} base={store.base} onSettings={() => setShowSettings(true)} />
        </header>
        <main className="main center">
          <div className="col gap-12" style={{maxWidth: 520, padding: 24, textAlign: 'center', alignItems: 'center'}}>
            <div className="dim text-md">Loading profile…</div>
            <div className="mono dim text-xs">{store.base}</div>
          </div>
        </main>
        {showSettings && <SettingsModal store={store} onClose={() => setShowSettings(false)} />}
      </div>
    );
  }

  let screen;
  if (route === 'dashboard')      screen = <DashboardScreen currentUser={currentUser} openIncident={openIncident} setRoute={setRoute} />;
  else if (route === 'incidents') screen = <IncidentsScreen currentUser={currentUser} selectedId={selectedIncidentId} setSelectedId={setSelectedIncidentId} />;
  else if (route === 'triage')    screen = <TriageScreen currentUser={currentUser} openIncident={openIncident} />;
  else if (route === 'my-queue')  screen = <IncidentsScreen currentUser={currentUser} selectedId={selectedIncidentId} setSelectedId={setSelectedIncidentId} myOnly={true} />;
  else if (route === 'servers')   screen = <ServersScreen currentUser={currentUser} openServer={openServer} openIncident={openIncident} />;
  else if (route === 'metrics')   screen = <MetricsScreen currentUser={currentUser} />;
  else if (route === 'problems')  screen = <ProblemsScreen currentUser={currentUser} openIncident={openIncident} />;
  else if (route === 'notifications') screen = <NotificationsScreen currentUser={currentUser} openIncident={openIncident} />;
  else if (route === 'teams')     screen = <TeamsScreen currentUser={currentUser} />;
  else screen = <div className="empty">Coming soon</div>;

  return (
    <div className="app">
      <Sidebar route={route} setRoute={setRoute} currentUser={currentUser} />
      <Topbar currentUser={currentUser} onLogout={logout} setRoute={setRoute} onSettings={() => setShowSettings(true)} />
      <main className="main">
        {store.connection.status === 'disconnected' && (
          <div style={{background: 'var(--critic-bg)', borderBottom: '1px solid rgba(255,77,94,0.3)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12}}>
            <Icon name="alert" size={14} />
            <span style={{color: 'var(--critic)', fontWeight: 500}}>Backend disconnected.</span>
            <span className="dim">{store.connection.error}</span>
            <button className="btn btn-xs" style={{marginLeft: 'auto'}} onClick={() => refresh()}><Icon name="refresh" size={11} /> Retry</button>
            <button className="btn btn-xs" onClick={() => setShowSettings(true)}><Icon name="settings" size={11} /> API URL</button>
          </div>
        )}
        {screen}
      </main>
      {showSettings && <SettingsModal store={store} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function ConnectionPill({ connection, base, onSettings }) {
  let label = 'Connected', cls = 'pill-ok';
  if (connection.status === 'connecting') { label = 'Connecting'; cls = 'pill-warn'; }
  else if (connection.status === 'disconnected') { label = 'Disconnected'; cls = 'sev-critic'; }
  return (
    <button className={`pill ${cls}`} style={{cursor: 'pointer', padding: '4px 10px', border: 'none'}} onClick={onSettings} title={base}>
      <span className="dot"></span>{label}
    </button>
  );
}

function SettingsModal({ store, onClose }) {
  const [url, setUrl] = useState(store.base);
  const save = () => { setBase(url); onClose(); };
  return (
    <Modal title="API connection settings" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={save}>Save & retry</button>
    </>}>
      <div className="col gap-12">
        <div className="field">
          <label className="field-label">API base URL</label>
          <input className="input mono" value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:8000" />
          <div className="dim text-xs" style={{marginTop: 4}}>FastAPI server URL. Must allow CORS from this origin.</div>
        </div>
        <div className="field">
          <label className="field-label">Status</label>
          <div className="card" style={{background: 'var(--bg-elev)', padding: 10}}>
            <div className="row gap-8">
              <span className={`pill ${store.connection.status === 'connected' ? 'pill-ok' : store.connection.status === 'connecting' ? 'pill-warn' : 'sev-critic'}`}>
                <span className="dot"></span>{store.connection.status}
              </span>
              {store.connection.lastSuccess && (
                <span className="dim text-xs">last success {relTime(new Date(store.connection.lastSuccess).toISOString())}</span>
              )}
            </div>
            {store.connection.error && (
              <div className="mono text-xs" style={{color: 'var(--critic)', marginTop: 8, wordBreak: 'break-all'}}>{store.connection.error}</div>
            )}
          </div>
        </div>
        <div className="field">
          <label className="field-label">Cheat sheet</label>
          <div className="mono text-xs" style={{padding: 12, background: 'var(--bg)', borderRadius: 6, color: 'var(--text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap'}}>
            <span className="dim"># start db + broker</span>{'\n'}
            docker compose up -d{'\n\n'}
            <span className="dim"># start api</span>{'\n'}
            cd backend && uvicorn api:app --reload --port 8000{'\n\n'}
            <span className="dim"># start mqtt agent on a host</span>{'\n'}
            cd agent && python agent.py
          </div>
        </div>
      </div>
    </Modal>
  );
}
