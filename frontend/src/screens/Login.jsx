import React, { useState } from 'react';
import { login, useStore } from '../api.js';
import { Icon } from '../components/Common.jsx';

export function LoginScreen({ onSettings, onRetry }) {
  const store = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const conn = store.connection;
  const connClass = conn.status === 'connected' ? 'pill-ok' : conn.status === 'connecting' ? 'pill-warn' : 'sev-critic';
  const connLabel = conn.status === 'connected' ? 'API' : conn.status === 'connecting' ? 'connecting' : 'offline';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app" style={{gridTemplateColumns: '1fr', gridTemplateAreas: '"topbar" "main"'}}>
      <header className="topbar">
        <div className="brand" style={{borderRight: 'none', padding: 0, gap: 10}}>
          <div className="brand-mark"></div>
          <div className="brand-name">Watchdogs<span>__</span></div>
        </div>
        <div className="topbar-spacer"></div>
        <button className={`pill ${connClass}`} style={{cursor: 'pointer', border: 'none'}} onClick={onSettings} title={`${store.base} · ${conn.status}`}>
          <span className="dot"></span>{connLabel}
        </button>
      </header>

      <main className="main center">
        <div className="col gap-16" style={{maxWidth: 520, padding: 24, textAlign: 'center', alignItems: 'center'}}>
          <div className="text-lg fw-600">Sign in</div>
          <div className="dim text-sm">Use your Watchdogs account to continue.</div>

          <form className="card" onSubmit={handleSubmit} style={{width: '100%', textAlign: 'left', padding: 18}}>
            <div className="field">
              <label className="field-label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@watchdogs.local"
                autoComplete="username"
                required
              />
            </div>

            <div className="field" style={{marginTop: 12}}>
              <label className="field-label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="card" style={{background: 'var(--critic-bg)', border: '1px solid rgba(255,77,94,0.3)', marginTop: 12, padding: 10, color: 'var(--critic)'}}>
                {error}
              </div>
            )}

            <div className="row gap-8" style={{marginTop: 16, justifyContent: 'space-between'}}>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <div className="row gap-8">
                <button className="btn" type="button" onClick={onRetry}>
                  <Icon name="refresh" size={12} /> Retry
                </button>
                <button className="btn" type="button" onClick={onSettings}>
                  <Icon name="settings" size={12} /> API URL
                </button>
              </div>
            </div>
          </form>

          {conn.status === 'disconnected' && (
            <div className="card" style={{background: 'var(--bg-elev)', padding: 14, textAlign: 'left', width: '100%'}}>
              <div className="field-label" style={{marginBottom: 6}}>Backend unreachable</div>
              <div className="dim text-sm" style={{marginBottom: 8}}>{conn.error}</div>
              <div className="mono text-xs" style={{color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.7}}>
                <span style={{color: 'var(--text-3)'}}># 1. Database + broker</span>{'\n'}
                docker compose up -d{'\n\n'}
                <span style={{color: 'var(--text-3)'}}># 2. API</span>{'\n'}
                cd backend && uvicorn api:app --reload{'\n'}
              </div>
            </div>
          )}

          <div className="dim text-xs mono">target: {store.base}</div>
        </div>
      </main>
    </div>
  );
}
