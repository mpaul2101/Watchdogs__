/* Common UI primitives — pills, sparklines, metric bars, icons, etc. */

import React, { useState, useEffect } from 'react';

// ============ TIME ============
export function relTime(iso) {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}
export function timeOnly(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}
export function dateShort(iso) {
  const d = new Date(iso);
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ============ SEVERITY ============
export function sevClass(sev) {
  if (!sev) return 'pill-neutral';
  const s = String(sev).toLowerCase();
  if (s === 'critic' || s === 'critical') return 'sev-critic';
  if (s === 'high')   return 'sev-high';
  if (s === 'medium') return 'sev-medium';
  if (s === 'low')    return 'sev-low';
  return 'pill-neutral';
}
export function SeverityPill({ value }) {
  const cls = sevClass(value);
  return (
    <span className={`pill ${cls}`}>
      <span className="dot"></span>{String(value || '—').toUpperCase()}
    </span>
  );
}
export function StatusPill({ value }) {
  const v = String(value || '').toUpperCase();
  let cls = 'pill-neutral';
  if (v === 'OPEN') cls = 'sev-critic';
  else if (v === 'IN_PROGRESS') cls = 'sev-high';
  else if (v === 'RESOLVED') cls = 'pill-ok';
  else if (v === 'CLOSED') cls = 'pill-neutral';
  else if (v === 'ONLINE' || v === 'OK') cls = 'pill-ok';
  else if (v === 'WARNING') cls = 'pill-warn';
  else if (v === 'CRITIC') cls = 'sev-critic';
  else if (v === 'OFFLINE') cls = 'pill-offline';
  return <span className={`pill ${cls}`}><span className="dot"></span>{v.replace('_',' ')}</span>;
}

// ============ SPARKLINE ============
export function Sparkline({ values, width = 80, height = 24, color = 'var(--accent)', threshold }) {
  if (!values || values.length === 0) return <svg width={width} height={height}></svg>;
  const min = 0;
  const max = Math.max(...values, threshold || 0, 100);
  const stepX = width / (values.length - 1 || 1);
  const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / (max - min)) * height).toFixed(1)}`).join(' ');
  const area = `0,${height} ${pts} ${width},${height}`;
  return (
    <svg width={width} height={height} className="spark">
      <polygon points={area} fill={color} className="chart-area" />
      <polyline points={pts} className="chart-line" stroke={color} />
      {threshold !== undefined && (
        <line x1="0" y1={height - ((threshold - min) / (max - min)) * height}
              x2={width} y2={height - ((threshold - min) / (max - min)) * height}
              stroke={color} className="threshold-line" />
      )}
    </svg>
  );
}

// ============ METRIC BAR ============
export function MetricBar({ value, max = 100, label, mono = false, thresholds = [70, 85, 95] }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  let kind = 'ok';
  if (value > 95) kind = 'critic';
  else if (value > 85) kind = 'high';
  else if (value > 70) kind = 'warn';
  return (
    <div className="col gap-4">
      {label && (
        <div className="row" style={{justifyContent:'space-between'}}>
          <span className="text-xs dim">{label}</span>
          <span className={`text-xs ${mono ? 'mono' : ''} tnum fw-500`}>{value !== null && value !== undefined ? `${value.toFixed(1)}%` : '—'}</span>
        </div>
      )}
      <div className="metric-bar">
        <div className={`metric-bar-fill ${kind}`} style={{width: `${pct}%`}}></div>
        <div className="metric-bar-thresholds">
          {thresholds.map((t, i) => <div key={i} className="metric-bar-thresh" style={{left: `${t}%`}} />)}
        </div>
      </div>
    </div>
  );
}

// ============ LIVE CHART ============
export function LiveChart({ data, lines, height = 200, threshold }) {
  const width = 600;
  const padding = { top: 10, right: 16, bottom: 22, left: 32 };
  const W = width - padding.left - padding.right;
  const H = height - padding.top - padding.bottom;
  if (!data || data.length === 0) return <svg viewBox={`0 0 ${width} ${height}`} style={{width:'100%', height}}></svg>;
  const maxVal = Math.max(100, ...data.flatMap(d => lines.map(l => d[l.key] || 0)));
  const minVal = 0;
  const stepX = W / (data.length - 1 || 1);
  const yFor = (v) => padding.top + H - ((v - minVal) / (maxVal - minVal)) * H;
  const xFor = (i) => padding.left + i * stepX;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{width:'100%', height}} preserveAspectRatio="none">
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
      {threshold !== undefined && (
        <line x1={padding.left} y1={yFor(threshold)} x2={width - padding.right} y2={yFor(threshold)}
              stroke="var(--high)" className="threshold-line" />
      )}
      {lines.map(line => {
        const pts = data.map((d, i) => `${xFor(i).toFixed(1)},${yFor(d[line.key] || 0).toFixed(1)}`).join(' ');
        const area = `${padding.left},${padding.top + H} ${pts} ${width - padding.right},${padding.top + H}`;
        return (
          <g key={line.key}>
            <polygon points={area} fill={line.color} className="chart-area" />
            <polyline points={pts} className="chart-line" stroke={line.color} />
          </g>
        );
      })}
    </svg>
  );
}

// ============ AVATAR ============
export function Avatar({ name, size = 24 }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const colors = ['#ff8a3d', '#4dd0e1', '#5be3a4', '#6aa4ff', '#c084fc', '#ffd23f', '#ff4d5e'];
  const idx = name ? (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % colors.length : 0;
  return (
    <div className="role-avatar" style={{width: size, height: size, fontSize: size * 0.45, background: colors[idx] + '33', color: colors[idx]}}>
      {initial}
    </div>
  );
}

// ============ ICON ============
export function Icon({ name, size = 16 }) {
  const s = size;
  const stroke = "currentColor", sw = 1.6;
  const wrap = (children) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{children}</svg>);
  switch (name) {
    case 'home':    return wrap(<><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></>);
    case 'alert':   return wrap(<><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.5" fill="currentColor"/></>);
    case 'triage':  return wrap(<><path d="M4 6h16M4 12h10M4 18h6"/></>);
    case 'server':  return wrap(<><rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/><circle cx="7" cy="7.5" r="0.5" fill="currentColor"/><circle cx="7" cy="16.5" r="0.5" fill="currentColor"/></>);
    case 'metric':  return wrap(<><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></>);
    case 'bell':    return wrap(<><path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 004 0"/></>);
    case 'users':   return wrap(<><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15 14c2 0 6 1 6 4"/></>);
    case 'problem': return wrap(<><path d="M3 12l4-8h10l4 8-9 9z"/><path d="M12 8v5M12 16v.5"/></>);
    case 'chev':    return wrap(<><path d="M6 9l6 6 6-6"/></>);
    case 'chev-r':  return wrap(<><path d="M9 6l6 6-6 6"/></>);
    case 'check':   return wrap(<><path d="M5 12l5 5L20 7"/></>);
    case 'x':       return wrap(<><path d="M6 6l12 12M18 6l-12 12"/></>);
    case 'plus':    return wrap(<><path d="M12 5v14M5 12h14"/></>);
    case 'phone':   return wrap(<><path d="M5 4h4l2 5-2 1c1 2 3 4 5 5l1-2 5 2v4c0 1-1 2-2 2A15 15 0 013 6c0-1 1-2 2-2z"/></>);
    case 'send':    return wrap(<><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></>);
    case 'refresh': return wrap(<><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/><path d="M3 21v-5h5"/></>);
    case 'filter':  return wrap(<><path d="M3 5h18l-7 9v5l-4-2v-3z"/></>);
    case 'eye':     return wrap(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>);
    case 'clock':   return wrap(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>);
    case 'flame':   return wrap(<><path d="M12 2s4 4 4 8a4 4 0 11-8 0c0-2 1-3 1-3s2 1 2 3c0-3 1-5 1-8z"/></>);
    case 'shield':  return wrap(<><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/></>);
    case 'settings':return wrap(<><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.4.9a7 7 0 00-1.8-1L14 3h-4l-.7 2.5a7 7 0 00-1.8 1l-2.4-.9-2 3.4L5 11a7 7 0 000 2l-2 1.5 2 3.4 2.4-.9a7 7 0 001.8 1L10 21h4l.7-2.5a7 7 0 001.8-1l2.4.9 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/></>);
    case 'logout':  return wrap(<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></>);
    case 'pulse':   return wrap(<><path d="M3 12h4l2-6 4 12 2-6h6"/></>);
    case 'team':    return wrap(<><circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2"/><circle cx="19" cy="10" r="2"/><path d="M3 17c0-2 2-3 4-3M21 17c0-2-2-3-4-3M7 18c0-2 2-4 5-4s5 2 5 4"/></>);
    default: return null;
  }
}

// ============ EMPTY ============
export function Empty({ children, icon = 'check' }) {
  return (
    <div className="empty">
      <div className="col" style={{alignItems:'center', gap: 8}}>
        <div className="dimmer"><Icon name={icon} size={24} /></div>
        <div>{children}</div>
      </div>
    </div>
  );
}
