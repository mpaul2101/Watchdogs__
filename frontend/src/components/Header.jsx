import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApiData } from '../hooks/useApiData.js';
import { fetchNotificationLog } from '../services/api.js';

// Sub-componentă: iconul de ochi pentru logo
function WatchEye() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3b82f6" strokeWidth="1.6">
      <path d="M2 12 C 6 5, 18 5, 22 12 C 18 19, 6 19, 2 12 Z" />
      <circle cx="12" cy="12" r="3.4" fill="#3b82f6" stroke="none" />
      <circle cx="13" cy="11" r="1" fill="#0a0c0f" stroke="none" />
      <line x1="12" y1="3" x2="12" y2="6" stroke="#3b82f6" />
    </svg>
  );
}

// Hook custom pentru clock care se actualizează la fiecare secundă
function useClock() {
  const [now, setNow] = useState(new Date());
  
  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(intervalId);
  }, []);
  
  return now;
}

export function Header({ globalState, openCount, critCount, onNav }) {
  const now = useClock();
  const { users, currentUser, loading, setCurrentUserId } = useAuth();
  
  // Fetch notification log pentru badge (last 24h)
  const { data: logsData } = useApiData(
    () => fetchNotificationLog({ limit: 100 }), 
    { refreshMs: 30000 }
  );
  const logs = logsData || [];

  // Calculați câte notificări au fost trimise în ultimele 24h
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = logs.filter(l => new Date(l.sent_at) > yesterday).length;
  
  // Formatare ora "HH:MM:SS UTC"
  const pad = (n) => String(n).padStart(2, '0');
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  
  // Eticheta status-ului
  const statusLabel = globalState === 'ok' 
    ? 'ALL SYSTEMS NORMAL'
    : globalState === 'warn' 
    ? 'DEGRADED'
    : 'INCIDENTS ACTIVE';

  const initials = currentUser?.name
    ? currentUser.name
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '--';
  
  return (
    <header className="header">
      {/* Logo + brand */}
      <div className="header-brand">
        <div className="header-brand-mark"><WatchEye /></div>
        <div className="header-brand-name">WATCHDOGS</div>
      </div>
      
      {/* Status global cu dot pulsant */}
      <div className={`header-status ${globalState}`}>
        <span className="dot" />
        <span className="label">{statusLabel}</span>
        <span className="mono" style={{ color: 'var(--fg-3)' }}>·</span>
        <span className="mono">{critCount} crit · {openCount} open</span>
        {recentCount > 0 && (
          <button 
            className="header-badge notify-badge" 
            onClick={() => onNav && onNav('alm')}
          >
            {recentCount} new
          </button>
        )}
      </div>
      
      {/* Meta info dreapta */}
      <div className="header-meta">
        <span className="uptime">poll <span>5s</span></span>
        <span className="clock mono">{clock}</span>
        <span className="user user-select">
          <span className={`user-avatar ${currentUser?.on_call_status ? 'on-call' : ''}`}>{initials}</span>
          <span className="user-info">
            <span className="mono">{currentUser?.name || 'Login As...'}</span>
            <span className="user-role">
              {currentUser ? `${currentUser.role} · ${currentUser.team_name}` : 'select a user'}
            </span>
          </span>
          <select
            aria-label="Login as"
            value={currentUser?.id ?? ''}
            onChange={(e) => setCurrentUserId(e.target.value)}
            disabled={loading || users.length === 0}
          >
            <option value="" disabled>
              Login As...
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.role}
              </option>
            ))}
          </select>
        </span>
      </div>
    </header>
  );
}