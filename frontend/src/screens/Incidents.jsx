import React, { useState, useEffect } from 'react';
import { useStore, useNow, WD, startBridge } from '../api.js';
import { SeverityPill, StatusPill, Avatar, Icon, Empty, LiveChart, relTime, dateShort } from '../components/Common.jsx';
import { ReassignModal, NotifyModal, StatusModal } from '../components/Modals.jsx';

export function IncidentsScreen({ currentUser, selectedId, setSelectedId, myOnly }) {
  const store = useStore();
  useNow(2500);

  const role = currentUser.role;
  const [filters, setFilters] = useState({ severity: 'all', status: 'open', team: 'all', search: '' });
  const [showReassign, setShowReassign] = useState(false);
  const [showNotify, setShowNotify] = useState(false);
  const [showStatus, setShowStatus] = useState(false);

  let visible = store.incidents;
  if (myOnly) visible = visible.filter(i => i.assigned_person === currentUser.id);

  let filtered = visible;
  if (filters.severity !== 'all') filtered = filtered.filter(i => i.severity === filters.severity);
  if (filters.status === 'open') filtered = filtered.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS');
  else if (filters.status !== 'all') filtered = filtered.filter(i => i.status === filters.status);
  if (filters.team !== 'all') filtered = filtered.filter(i => i.assigned_team === filters.team);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(i => i.title.toLowerCase().includes(q) || (i.server_id || '').toLowerCase().includes(q) || String(i.id).includes(q));
  }
  const sevRank = { CRITIC: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
  filtered = [...filtered].sort((a, b) => (sevRank[a.severity] - sevRank[b.severity]) || (new Date(b.created_at) - new Date(a.created_at)));

  const selected = filtered.find(i => i.id === selectedId) || filtered[0] || null;
  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, []);

  const count = (predicate) => visible.filter(predicate).length;

  return (
    <div className="page" style={{gridTemplateColumns: '1.4fr 1fr', gridTemplateRows: 'auto 1fr', gap: 12}}>
      <div className="page-header" style={{gridColumn: '1 / -1'}}>
        <div className="page-title">{myOnly ? 'My queue' : 'Incidents'}</div>
        <div className="page-subtitle">{filtered.length} matching · {role === 'CEO' && 'read-only · all teams'}{role === 'Incident Manager' && 'full RBAC'}{role === 'System Manager' && `scoped to ${currentUser.team_name}`}{role === 'Engineer' && 'assigned to you or open in your team'}</div>
        <div className="page-actions">
          <input className="input" style={{width: 220}} placeholder="Search id, server, title…" value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} />
        </div>
      </div>

      <div className="card" style={{minHeight: 0}}>
        <div className="card-header" style={{flexWrap: 'wrap', gap: 8}}>
          <div className="chip-row">
            <button className={`chip ${filters.severity === 'all' ? 'active' : ''}`} onClick={() => setFilters({...filters, severity: 'all'})}>All <span className="count">{visible.length}</span></button>
            <button className={`chip ${filters.severity === 'CRITIC' ? 'active' : ''}`} onClick={() => setFilters({...filters, severity: 'CRITIC'})}>
              <span className="dot" style={{width:6,height:6,borderRadius:3,background:'var(--critic)'}}></span>
              Critic <span className="count">{count(i => i.severity === 'CRITIC')}</span>
            </button>
            <button className={`chip ${filters.severity === 'HIGH' ? 'active' : ''}`} onClick={() => setFilters({...filters, severity: 'HIGH'})}>
              <span className="dot" style={{width:6,height:6,borderRadius:3,background:'var(--high)'}}></span>
              High <span className="count">{count(i => i.severity === 'HIGH')}</span>
            </button>
            <button className={`chip ${filters.severity === 'MEDIUM' ? 'active' : ''}`} onClick={() => setFilters({...filters, severity: 'MEDIUM'})}>
              <span className="dot" style={{width:6,height:6,borderRadius:3,background:'var(--medium)'}}></span>
              Medium <span className="count">{count(i => i.severity === 'MEDIUM')}</span>
            </button>
            <button className={`chip ${filters.severity === 'LOW' ? 'active' : ''}`} onClick={() => setFilters({...filters, severity: 'LOW'})}>
              <span className="dot" style={{width:6,height:6,borderRadius:3,background:'var(--low)'}}></span>
              Low <span className="count">{count(i => i.severity === 'LOW')}</span>
            </button>
          </div>
          <div className="chip-row" style={{marginLeft: 'auto'}}>
            <button className={`chip ${filters.status === 'open' ? 'active' : ''}`} onClick={() => setFilters({...filters, status: 'open'})}>Open</button>
            <button className={`chip ${filters.status === 'RESOLVED' ? 'active' : ''}`} onClick={() => setFilters({...filters, status: 'RESOLVED'})}>Resolved</button>
            <button className={`chip ${filters.status === 'all' ? 'active' : ''}`} onClick={() => setFilters({...filters, status: 'all'})}>All</button>
          </div>
        </div>
        <div className="card-body no-pad" style={{overflow: 'auto'}}>
          <table className="table">
            <thead><tr>
              <th>SEV</th><th>ID</th><th>TITLE</th><th>SERVER</th><th>TEAM</th><th>ASSIGNED</th><th>STATUS</th><th>OPENED</th>
            </tr></thead>
            <tbody>
              {filtered.map(i => {
                const assignee = store.users.find(u => u.id === i.assigned_person);
                return (
                  <tr key={i.id} className={selected?.id === i.id ? 'selected' : ''} onClick={() => setSelectedId(i.id)}>
                    <td><SeverityPill value={i.severity} /></td>
                    <td className="mono dim">#{i.id}</td>
                    <td className="fw-500" style={{maxWidth: 280}}>
                      <div style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{i.title.replace(/^\[[^\]]+\]\s*/, '')}</div>
                    </td>
                    <td className="mono">{i.server_id}</td>
                    <td>{i.assigned_team || <span className="dim">—</span>}</td>
                    <td>{assignee ? <span className="row gap-6"><Avatar name={assignee.name} size={18} /> <span className="text-xs">{assignee.name}</span></span> : <span className="dim">—</span>}</td>
                    <td><StatusPill value={i.status} /></td>
                    <td className="dim mono text-xs">{relTime(i.created_at)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8}><div className="empty">No matching incidents</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{minHeight: 0}}>
        {selected ? (
          <IncidentDetail
            incident={selected}
            currentUser={currentUser}
            onAssign={() => setShowReassign(true)}
            onNotify={() => setShowNotify(true)}
            onStatus={() => setShowStatus(true)}
          />
        ) : (
          <Empty icon="alert">No incident selected</Empty>
        )}
      </div>

      {showReassign && <ReassignModal incident={selected} currentUser={currentUser} onClose={() => setShowReassign(false)} />}
      {showNotify && <NotifyModal incident={selected} currentUser={currentUser} onClose={() => setShowNotify(false)} />}
      {showStatus && <StatusModal incident={selected} currentUser={currentUser} onClose={() => setShowStatus(false)} />}
    </div>
  );
}

function IncidentDetail({ incident, currentUser, onAssign, onNotify, onStatus }) {
  const store = useStore();
  const assignee = store.users.find(u => u.id === incident.assigned_person);
  const alarms = store.alarms.filter(a => a.incident_id === incident.id);
  const notifs = store.notificationLog.filter(n => n.incident_id === incident.id);

  const hist = store.metricsHistory[incident.server_id];
  const histSlice = hist ? hist.slice(-30) : [];
  const metricKey = incident.metric_type === 'CPU' ? 'cpu' : incident.metric_type === 'RAM' ? 'ram' : incident.metric_type === 'DISK' ? 'disk' : incident.metric_type === 'RESPONSE_TIME' ? 'response_time_ms' : 'cpu';
  const chartData = histSlice.map(h => ({ ts: h.ts, value: h[metricKey] || 0 }));
  const latestVal = chartData.length ? chartData[chartData.length - 1].value : 0;
  const threshold = incident.metric_type === 'CPU' ? 90 : incident.metric_type === 'RAM' ? 90 : incident.metric_type === 'DISK' ? 85 : incident.metric_type === 'RESPONSE_TIME' ? 250 : 90;

  const role = currentUser.role;
  const canEdit = role !== 'CEO';
  const canAssign = role === 'Incident Manager';
  const canNotify = role === 'Incident Manager';
  const canBridge = role === 'Incident Manager';
  const canStatus = role === 'Incident Manager' || (role === 'System Manager' && incident.assigned_team === currentUser.team_name) || (role === 'Engineer' && incident.assigned_person === currentUser.id);

  const events = [
    { time: incident.created_at, kind: 'open', dot: String(incident.severity).toLowerCase(), text: `Incident opened · ${incident.metric_type} threshold breached`, meta: `auto-detected · severity ${incident.severity}` },
    ...alarms.map(a => ({ time: a.created_at, kind: 'alarm', dot: String(a.severity).toLowerCase(), text: a.message, meta: `alarm #${a.id}` })),
  ];
  if (incident.bridge_status === 'Active') events.push({ time: incident.updated_at, kind: 'bridge', dot: 'low', text: 'Bridge call started', meta: incident.bridge_url });
  if (incident.assigned_person) events.push({ time: incident.updated_at, kind: 'assign', dot: 'low', text: `Assigned to ${assignee?.name || '—'} (${incident.assigned_team})`, meta: 'triage' });
  if (incident.status === 'RESOLVED' || incident.status === 'CLOSED') events.push({ time: incident.updated_at, kind: 'resolved', dot: 'ok', text: `Marked ${incident.status}`, meta: 'lifecycle' });
  events.sort((a, b) => new Date(b.time) - new Date(a.time));

  return (
    <div className="inc-detail">
      <div className="inc-detail-header">
        <div className="row gap-8" style={{marginBottom: 4}}>
          <span className="inc-detail-id mono">#{incident.id}</span>
          <span className="dim text-xs">·</span>
          <span className="dim text-xs">opened {relTime(incident.created_at)}</span>
        </div>
        <div className="inc-detail-title">{incident.title.replace(/^\[[^\]]+\]\s*/, '')}</div>
        <div className="inc-detail-meta">
          <SeverityPill value={incident.severity} />
          <StatusPill value={incident.status} />
          {incident.triage_status === 'Unassigned'
            ? <span className="pill pill-warn"><span className="dot"></span>UNTRIAGED</span>
            : <span className="pill pill-info"><span className="dot"></span>TRIAGED</span>}
          {incident.bridge_required && (
            incident.bridge_status === 'Active'
              ? <span className="pill pill-ok"><span className="dot"></span>BRIDGE ACTIVE</span>
              : <span className="pill pill-warn"><span className="dot"></span>BRIDGE REQUIRED</span>
          )}
        </div>
      </div>

      <div className="inc-detail-body">
        <div className="inc-detail-section">
          <div className="inc-detail-section-title row" style={{justifyContent: 'space-between'}}>
            <span>Live {incident.metric_type} · {incident.server_id}</span>
            <span className="mono tnum" style={{fontSize: 14, color: latestVal > threshold ? 'var(--critic)' : 'var(--text)'}}>
              {incident.metric_type === 'RESPONSE_TIME' ? `${Math.round(latestVal)}ms` : `${latestVal.toFixed(1)}%`}
            </span>
          </div>
          <div style={{background: 'var(--bg-elev)', borderRadius: 8, padding: 8}}>
            <LiveChart data={chartData} lines={[{ key: 'value', color: latestVal > threshold ? 'var(--critic)' : 'var(--accent)' }]} threshold={threshold} height={140} />
          </div>
        </div>

        <div className="inc-detail-section">
          <div className="inc-detail-section-title">Context</div>
          <dl className="kv">
            <dt>Server</dt><dd className="mono">{incident.server_id}</dd>
            <dt>Region</dt><dd className="mono">{store.servers.find(s => s.id === incident.server_id)?.region || '—'}</dd>
            <dt>Metric</dt><dd className="mono">{incident.metric_type}</dd>
            <dt>Team</dt><dd>{incident.assigned_team || <span className="dim">unassigned</span>}</dd>
            <dt>Engineer</dt><dd>{assignee ? <span className="row gap-6"><Avatar name={assignee.name} size={18} /> {assignee.name}</span> : <span className="dim">—</span>}</dd>
            <dt>Bridge</dt><dd>{incident.bridge_url ? <a href={incident.bridge_url} target="_blank" rel="noreferrer" className="mono" style={{color: 'var(--accent)'}}>{incident.bridge_url}</a> : <span className="dim">not started</span>}</dd>
            <dt>Updated</dt><dd className="mono text-xs">{dateShort(incident.updated_at)}</dd>
          </dl>
        </div>

        <div className="inc-detail-section">
          <div className="inc-detail-section-title">Timeline · {events.length} events</div>
          <div className="timeline">
            {events.map((e, i) => (
              <div key={i} className="tl-item">
                <div className={`tl-dot ${e.dot}`}></div>
                <div>
                  <div className="row gap-6"><span className="tl-time mono">{dateShort(e.time)}</span><span className="dim text-xs">· {e.kind}</span></div>
                  <div className="tl-text">{e.text}</div>
                  <div className="tl-meta mono">{e.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {notifs.length > 0 && (
          <div className="inc-detail-section">
            <div className="inc-detail-section-title">Notifications sent · {notifs.length}</div>
            <div className="col gap-4">
              {notifs.slice(0, 6).map(n => {
                const u = store.users.find(x => x.id === n.user_id);
                return (
                  <div key={n.id} className="row gap-8" style={{padding: '6px 8px', background: 'var(--bg-elev)', borderRadius: 6, border: '1px solid var(--border-soft)'}}>
                    <Avatar name={u?.name || n.user_name} size={20} />
                    <span className="text-xs fw-500">{u?.name || n.user_name || '—'}</span>
                    <span className={`pill ${n.list_name === 'red' ? 'sev-critic' : n.list_name === 'yellow' ? 'sev-medium' : 'pill-info'}`} style={{padding: '1px 6px', fontSize: 10}}>{n.list_name}</span>
                    <span className="dim text-xs mono" style={{marginLeft: 'auto'}}>{relTime(n.sent_at)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="inc-detail-footer">
        {!canEdit && <span className="pill pill-info"><span className="dot"></span>READ-ONLY</span>}
        {canAssign && incident.triage_status === 'Unassigned' && (
          <button className="btn btn-primary" onClick={onAssign}><Icon name="users" size={12} /> Assign</button>
        )}
        {canAssign && incident.triage_status === 'Assigned' && (
          <button className="btn" onClick={onAssign}>Reassign</button>
        )}
        {canBridge && incident.bridge_required && incident.bridge_status !== 'Active' && (
          <button className="btn btn-danger" onClick={() => startBridge(incident.id).catch(e => alert(e.message))}><Icon name="phone" size={12} /> Start bridge</button>
        )}
        {canNotify && (
          <button className="btn" onClick={onNotify}><Icon name="send" size={12} /> Notify</button>
        )}
        {canStatus && (
          <button className="btn" onClick={onStatus}><Icon name="check" size={12} /> Update status</button>
        )}
      </div>
    </div>
  );
}
