import React, { useState, useEffect } from 'react';
import { useStore, useNow } from '../api.js';
import { sevClass, Icon } from '../components/Common.jsx';

export function MetricsScreen({ currentUser }) {
  const store = useStore();
  useNow(2500);

  const [serverId, setServerId] = useState(null);
  const [windowMin, setWindowMin] = useState(2);

  useEffect(() => {
    if (!serverId && store.servers.length > 0) {
      setServerId(store.servers.find(s => s.status === 'online')?.id || store.servers[0].id);
    }
  }, [store.servers]);

  if (!serverId || store.servers.length === 0) {
    return <div className="page"><div className="empty">No servers in fleet yet</div></div>;
  }

  const server = store.servers.find(s => s.id === serverId);
  const hist = store.metricsHistory[serverId] || [];
  const samples = Math.min(hist.length, windowMin * 15);
  const data = hist.slice(-samples).map(h => ({
    ts: h.ts,
    cpu: h.cpu || 0,
    ram: h.ram || 0,
    disk: h.disk || 0,
    response_time_ms: h.response_time_ms || 0,
  }));
  const last = data[data.length - 1] || {};

  const isOffline = server?.status === 'offline';

  const charts = [
    { key: 'cpu',  label: 'CPU',  unit: '%',  color: 'var(--accent)', thresholds: [{ v: 75, sev: 'LOW' }, { v: 85, sev: 'MEDIUM' }, { v: 90, sev: 'HIGH' }, { v: 95, sev: 'CRITIC' }] },
    { key: 'ram',  label: 'RAM',  unit: '%',  color: 'var(--info)',   thresholds: [{ v: 80, sev: 'LOW' }, { v: 85, sev: 'MEDIUM' }, { v: 90, sev: 'HIGH' }, { v: 95, sev: 'CRITIC' }] },
    { key: 'disk', label: 'Disk', unit: '%',  color: 'var(--low)',    thresholds: [{ v: 80, sev: 'LOW' }, { v: 85, sev: 'MEDIUM' }, { v: 90, sev: 'HIGH' }, { v: 95, sev: 'CRITIC' }] },
    { key: 'response_time_ms', label: 'Response time', unit: 'ms', color: 'var(--high)', thresholds: [{ v: 250, sev: 'LOW' }, { v: 500, sev: 'MEDIUM' }, { v: 1000, sev: 'HIGH' }] },
  ];

  return (
    <div className="page" style={{gridTemplateRows: 'auto auto 1fr', gap: 12}}>
      <div className="page-header">
        <div className="page-title">Metrics Explorer</div>
        <div className="page-subtitle">Real-time deep-dive · thresholds from engine rules</div>
        <div className="page-actions">
          <div className="row gap-8">
            <span className="dim text-xs">Window</span>
            <div className="chip-row">
              {[1, 2, 5, 15].map(m => (
                <button key={m} className={`chip ${windowMin === m ? 'active' : ''}`} onClick={() => setWindowMin(m)}>{m}m</button>
              ))}
            </div>
          </div>
          <select className="select" value={serverId} onChange={e => setServerId(e.target.value)} style={{width: 200}}>
            {store.servers.map(s => <option key={s.id} value={s.id}>{s.id} · {s.region}</option>)}
          </select>
        </div>
      </div>

      <div className="stats-grid">
        <KpiCard label="CPU"      value={isOffline ? '—' : (last.cpu  ?? 0).toFixed(1) + '%'} sub={`max ${data.length ? Math.max(...data.map(d => d.cpu || 0)).toFixed(0) : 0}%`} crit={!isOffline && last.cpu > 90} warn={!isOffline && last.cpu > 75} />
        <KpiCard label="RAM"      value={isOffline ? '—' : (last.ram  ?? 0).toFixed(1) + '%'} sub={`max ${data.length ? Math.max(...data.map(d => d.ram || 0)).toFixed(0) : 0}%`} crit={!isOffline && last.ram > 90} warn={!isOffline && last.ram > 80} />
        <KpiCard label="DISK"     value={isOffline ? '—' : (last.disk ?? 0).toFixed(1) + '%'} sub={`max ${data.length ? Math.max(...data.map(d => d.disk || 0)).toFixed(0) : 0}%`} crit={!isOffline && last.disk > 90} warn={!isOffline && last.disk > 80} />
        <KpiCard label="RESPONSE" value={isOffline ? '—' : Math.round(last.response_time_ms || 0) + 'ms'} sub={`avg ${data.length ? Math.round(data.reduce((a,b)=>a+(b.response_time_ms||0),0)/(data.length||1)) : 0}ms`} crit={!isOffline && last.response_time_ms > 1000} warn={!isOffline && last.response_time_ms > 500} />
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 12, minHeight: 0}}>
        {charts.map(c => {
          const v = last[c.key];
          const triggered = c.thresholds.filter(t => v > t.v).pop();
          return (
            <div key={c.key} className="card" style={{minHeight: 0}}>
              <div className="card-header">
                <div className="card-title">{c.label}</div>
                <div className="card-subtitle">last {windowMin} min</div>
                <div className="card-actions">
                  {triggered && <span className={`pill ${sevClass(triggered.sev)}`}><span className="dot"></span>{triggered.sev} threshold</span>}
                  <span className="mono tnum text-sm fw-600" style={{color: triggered ? `var(--${triggered.sev.toLowerCase()})` : 'var(--text)'}}>
                    {isOffline ? '—' : c.key === 'response_time_ms' ? Math.round(v || 0) + 'ms' : (v ?? 0).toFixed(1) + '%'}
                  </span>
                </div>
              </div>
              <div className="card-body">
                {isOffline ? (
                  <div className="empty">Server offline</div>
                ) : (
                  <div style={{height: '100%', position: 'relative'}}>
                    <ThresholdChart data={data} dataKey={c.key} color={c.color} thresholds={c.thresholds} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, crit, warn }) {
  const color = crit ? 'var(--critic)' : warn ? 'var(--high)' : 'var(--text)';
  return (
    <div className="stat-card">
      <div className="kpi">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value" style={{color}}>{value}</div>
        <div className="kpi-meta mono">{sub}</div>
      </div>
    </div>
  );
}

function ThresholdChart({ data, dataKey, color, thresholds }) {
  const width = 600;
  const height = 200;
  const padding = { top: 8, right: 60, bottom: 22, left: 32 };
  const W = width - padding.left - padding.right;
  const H = height - padding.top - padding.bottom;
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(100, ...data.map(d => d[dataKey] || 0), ...thresholds.map(t => t.v * 1.1));
  const minVal = 0;
  const stepX = W / (data.length - 1 || 1);
  const yFor = (v) => padding.top + H - ((v - minVal) / (maxVal - minVal)) * H;
  const xFor = (i) => padding.left + i * stepX;
  const sevColor = (sev) => sev === 'CRITIC' ? 'var(--critic)' : sev === 'HIGH' ? 'var(--high)' : sev === 'MEDIUM' ? 'var(--medium)' : 'var(--low)';
  const pts = data.map((d, i) => `${xFor(i).toFixed(1)},${yFor(d[dataKey] || 0).toFixed(1)}`).join(' ');
  const area = `${padding.left},${padding.top + H} ${pts} ${width - padding.right},${padding.top + H}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{width: '100%', height: '100%'}}>
      <g className="chart-grid">
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = padding.top + H * p;
          return <line key={i} x1={padding.left} y1={y} x2={width - padding.right} y2={y} />;
        })}
      </g>
      <g className="chart-axis">
        {[0, 0.5, 1].map((p, i) => {
          const v = Math.round(maxVal - p * maxVal);
          const y = padding.top + H * p + 3;
          return <text key={i} x={4} y={y}>{v}</text>;
        })}
      </g>
      {thresholds.map((t, i) => (
        <g key={i}>
          <line x1={padding.left} y1={yFor(t.v)} x2={width - padding.right} y2={yFor(t.v)} stroke={sevColor(t.sev)} className="threshold-line" opacity={0.7} />
          <text x={width - padding.right + 4} y={yFor(t.v) + 3} fill={sevColor(t.sev)} fontSize="10" fontFamily="Geist Mono, monospace">{t.sev}</text>
        </g>
      ))}
      <polygon points={area} fill={color} className="chart-area" />
      <polyline points={pts} className="chart-line" stroke={color} />
    </svg>
  );
}
