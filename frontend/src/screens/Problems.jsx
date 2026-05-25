import React, { useState, useEffect } from 'react';
import { useStore, useNow, fetchProblemTimeline } from '../api.js';
import { SeverityPill, StatusPill, Empty, Icon, relTime, dateShort } from '../components/Common.jsx';

export function ProblemsScreen({ currentUser, openIncident }) {
  const store = useStore();
  useNow(2500);

  const [selectedId, setSelectedId] = useState(null);
  const [sevFilter, setSevFilter] = useState('all');

  let filtered = store.problems;
  if (sevFilter !== 'all') filtered = filtered.filter(p => p.severity === sevFilter);
  filtered = [...filtered].sort((a, b) => b.occurrence_count - a.occurrence_count);

  const effectiveSelected = selectedId || filtered[0]?.id;
  const selected = filtered.find(p => p.id === effectiveSelected);
  const timeline = selected ? store.problemTimelines[selected.id] || [] : [];

  useEffect(() => {
    if (selected && !store.problemTimelines[selected.id]) {
      fetchProblemTimeline(selected.id);
    }
  }, [selected?.id]);

  return (
    <div className="page" style={{gridTemplateColumns: '380px 1fr', gridTemplateRows: 'auto 1fr', gap: 12}}>
      <div className="page-header" style={{gridColumn: '1 / -1'}}>
        <div className="page-title">Problems</div>
        <div className="page-subtitle">Recurring patterns detected from metric breaches · last 24h</div>
        <div className="page-actions">
          <div className="chip-row">
            <button className={`chip ${sevFilter === 'all' ? 'active' : ''}`} onClick={() => setSevFilter('all')}>All</button>
            <button className={`chip ${sevFilter === 'critical' ? 'active' : ''}`} onClick={() => setSevFilter('critical')}>Critical</button>
            <button className={`chip ${sevFilter === 'high' ? 'active' : ''}`} onClick={() => setSevFilter('high')}>High</button>
          </div>
          <span className="dim text-xs row gap-6"><Icon name="refresh" size={12} /> detection runs on every fetch</span>
        </div>
      </div>

      <div className="card" style={{minHeight: 0}}>
        <div className="card-header">
          <div className="card-title">Detected · {filtered.length}</div>
        </div>
        <div className="card-body" style={{display: 'flex', flexDirection: 'column', gap: 8}}>
          {filtered.length === 0 && <Empty icon="problem">No recurring problems detected (last 24h)</Empty>}
          {filtered.map(p => {
            const tl = store.problemTimelines[p.id] || [];
            const max = Math.max(...tl.map(t => t.value), 1);
            const sev = p.severity === 'critical' ? 'CRITIC' : p.severity.toUpperCase();
            return (
              <div key={p.id} className={`problem-card ${effectiveSelected === p.id ? 'selected' : ''}`} onClick={() => setSelectedId(p.id)}>
                <div className="problem-card-head">
                  <SeverityPill value={sev} />
                  <span className="dim text-xs mono right">#{p.id}</span>
                </div>
                <div className="problem-card-title">{p.title}</div>
                <div className="problem-card-occ">
                  <span className="mono" style={{color: 'var(--text)'}}>{p.server_id}</span>
                  <span>·</span>
                  <span className="mono uppercase">{p.metric_type}</span>
                  <span className="right">{p.occurrence_count}× in 24h</span>
                </div>
                <div className="occ-bar" style={{marginTop: 8}}>
                  {tl.map((occ, i) => (
                    <div key={i} style={{height: `${(occ.value / max) * 14}px`, background: occ.value > occ.threshold * 1.05 ? 'var(--critic)' : 'var(--high)'}} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{minHeight: 0}}>
        {selected ? (
          <ProblemDetail problem={selected} timeline={timeline} store={store} openIncident={openIncident} />
        ) : (
          <Empty>No problem selected</Empty>
        )}
      </div>
    </div>
  );
}

function ProblemDetail({ problem, timeline, store, openIncident }) {
  const sev = problem.severity === 'critical' ? 'CRITIC' : problem.severity.toUpperCase();
  const related = store.incidents.filter(i =>
    i.server_id === problem.server_id &&
    i.metric_type.toLowerCase().replace('_','') === problem.metric_type.toLowerCase().replace('_','')
  );
  const sorted = [...timeline].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
  const threshold = sorted[0]?.threshold || 0;

  return (
    <div className="inc-detail">
      <div className="inc-detail-header">
        <div className="row gap-8" style={{marginBottom: 4}}>
          <span className="inc-detail-id mono">PROBLEM #{problem.id}</span>
          <span className="dim text-xs">·</span>
          <span className="dim text-xs">first seen {relTime(problem.first_seen)} · last seen {relTime(problem.last_seen)}</span>
        </div>
        <div className="inc-detail-title">{problem.title}</div>
        <div className="inc-detail-meta">
          <SeverityPill value={sev} />
          <span className="pill pill-warn"><span className="dot"></span>{problem.occurrence_count}× IN 24H</span>
          <span className="pill pill-neutral"><span className="dot"></span>{problem.status.toUpperCase()}</span>
        </div>
      </div>

      <div className="inc-detail-body">
        <div className="inc-detail-section">
          <div className="inc-detail-section-title">Occurrence timeline · last 24h</div>
          <div style={{background: 'var(--bg-elev)', borderRadius: 8, padding: 10}}>
            {sorted.length > 0 ? <ProblemTimelineChart timeline={sorted} threshold={threshold} /> : <div className="dim text-xs" style={{padding: 8}}>Loading timeline…</div>}
          </div>
        </div>

        <div className="inc-detail-section">
          <div className="inc-detail-section-title">Probable cause</div>
          <div style={{padding: 12, background: 'var(--surface-2)', borderRadius: 6, borderLeft: '3px solid var(--high)', fontSize: 12.5, color: 'var(--text-2)'}}>
            {problem.probable_cause}
          </div>
        </div>

        <div className="inc-detail-section">
          <div className="inc-detail-section-title">Suggested fix</div>
          <div style={{padding: 12, background: 'var(--surface-2)', borderRadius: 6, borderLeft: '3px solid var(--ok)', fontSize: 12.5, color: 'var(--text)'}}>
            {problem.suggested_fix}
          </div>
        </div>

        <div className="inc-detail-section">
          <div className="inc-detail-section-title">Details</div>
          <dl className="kv">
            <dt>Server</dt><dd className="mono">{problem.server_id}</dd>
            <dt>Metric</dt><dd className="mono">{problem.metric_type.toUpperCase()}</dd>
            <dt>Occurrences</dt><dd className="mono tnum">{problem.occurrence_count}× in 24h</dd>
            <dt>First seen</dt><dd className="mono">{dateShort(problem.first_seen)}</dd>
            <dt>Last seen</dt><dd className="mono">{dateShort(problem.last_seen)}</dd>
          </dl>
        </div>

        {related.length > 0 && (
          <div className="inc-detail-section">
            <div className="inc-detail-section-title">Linked incidents · {related.length}</div>
            <div className="col gap-4">
              {related.slice(0, 6).map(i => (
                <div key={i.id} className="row gap-8" style={{padding: '6px 8px', background: 'var(--bg-elev)', borderRadius: 6, border: '1px solid var(--border-soft)', cursor: 'pointer'}} onClick={() => openIncident(i.id)}>
                  <SeverityPill value={i.severity} />
                  <span className="text-xs mono dim">#{i.id}</span>
                  <span className="text-xs flex-1" style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{i.title.replace(/^\[[^\]]+\]\s*/, '')}</span>
                  <StatusPill value={i.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProblemTimelineChart({ timeline, threshold }) {
  const width = 600;
  const height = 160;
  const padding = { top: 10, right: 16, bottom: 30, left: 36 };
  const W = width - padding.left - padding.right;
  const H = height - padding.top - padding.bottom;
  if (!timeline || timeline.length === 0) return null;
  const values = timeline.map(t => t.value);
  const maxVal = Math.max(...values, threshold || 0) * 1.1;
  const minVal = 0;
  const t0 = new Date(timeline[0].occurred_at).getTime();
  const tEnd = new Date(timeline[timeline.length - 1].occurred_at).getTime();
  const span = Math.max(tEnd - t0, 60000);
  const xFor = (iso) => padding.left + ((new Date(iso).getTime() - t0) / span) * W;
  const yFor = (v) => padding.top + H - ((v - minVal) / (maxVal - minVal)) * H;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{width: '100%', height: 160}} preserveAspectRatio="none">
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
      <line x1={padding.left} y1={yFor(threshold)} x2={width - padding.right} y2={yFor(threshold)} stroke="var(--high)" className="threshold-line" />
      <text x={width - padding.right - 4} y={yFor(threshold) - 4} fill="var(--high)" fontSize="10" fontFamily="Geist Mono, monospace" textAnchor="end">threshold {threshold}</text>
      {timeline.map((t, i) => {
        const x = xFor(t.occurred_at);
        const y = yFor(t.value);
        return (
          <g key={i}>
            <line x1={x} y1={padding.top + H} x2={x} y2={y} stroke={t.value > t.threshold * 1.05 ? 'var(--critic)' : 'var(--high)'} strokeWidth="2" opacity="0.6" />
            <circle cx={x} cy={y} r="3" fill={t.value > t.threshold * 1.05 ? 'var(--critic)' : 'var(--high)'} />
          </g>
        );
      })}
    </svg>
  );
}
