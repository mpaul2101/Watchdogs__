import React from 'react';
import { useStore, useNow, getInfrastructureHealth } from '../api.js';
import { SeverityPill, StatusPill, MetricBar, Sparkline, Avatar, Icon, relTime } from '../components/Common.jsx';

export function DashboardScreen({ currentUser, openIncident, setRoute }) {
  const store = useStore();
  useNow(2500);

  const role = currentUser.role;
  const isExec = role === 'CEO' || role === 'CTO';
  const isIM = role === 'Incident Manager';
  const isSM = role === 'System Manager';
  const isEng = role === 'Engineer';

  const allOpen = store.incidents.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS');
  const criticOpen = allOpen.filter(i => i.severity === 'CRITIC');
  const unassigned = allOpen.filter(i => i.triage_status === 'Unassigned');
  const myIncidents = store.incidents.filter(i => i.assigned_person === currentUser.id && (i.status === 'OPEN' || i.status === 'IN_PROGRESS'));
  const myTeamIncidents = store.incidents.filter(i => i.assigned_team === currentUser.team_name && (i.status === 'OPEN' || i.status === 'IN_PROGRESS'));

  const health = getInfrastructureHealth();
  const okServers = health.filter(h => h.health_status === 'OK').length;
  const warnServers = health.filter(h => h.health_status === 'WARNING').length;
  const critServers = health.filter(h => h.health_status === 'CRITIC').length;
  const offlineServers = store.servers.filter(s => s.status === 'offline').length;
  const onlineServers = store.servers.filter(s => s.status === 'online').length;

  let kpis = [];
  if (isExec) {
    kpis = [
      { label: 'Critical incidents', value: criticOpen.length, sub: criticOpen.length === 0 ? 'All clear' : 'Requires exec attention', cls: criticOpen.length > 0 ? 'critic' : 'ok' },
      { label: 'Infrastructure SLA', value: `${store.servers.length > 0 ? Math.round(okServers / store.servers.length * 100) : 0}%`, sub: `${okServers}/${store.servers.length} servers healthy`, cls: 'info' },
      { label: 'Servers online', value: `${onlineServers}/${store.servers.length}`, sub: offlineServers > 0 ? `${offlineServers} offline` : 'All up', cls: offlineServers > 0 ? 'critic' : 'ok' },
      { label: 'War rooms active', value: store.incidents.filter(i => i.bridge_status === 'Active' && i.status !== 'CLOSED' && i.status !== 'RESOLVED').length, sub: 'Bridge calls in progress', cls: 'high' },
    ];
  } else if (isIM) {
    kpis = [
      { label: 'In triage queue', value: unassigned.length, sub: unassigned.length > 0 ? 'Needs assignment' : 'All assigned', cls: unassigned.length > 0 ? 'critic' : 'ok' },
      { label: 'Critical open', value: criticOpen.length, sub: 'P1 incidents', cls: criticOpen.length > 0 ? 'critic' : 'ok' },
      { label: 'Bridges active', value: store.incidents.filter(i => i.bridge_status === 'Active' && i.status !== 'CLOSED' && i.status !== 'RESOLVED').length, sub: 'War rooms', cls: 'high' },
      { label: 'Open total', value: allOpen.length, sub: 'OPEN + IN_PROGRESS', cls: 'info' },
    ];
  } else if (isSM) {
    kpis = [
      { label: `${currentUser.team_name} open`, value: myTeamIncidents.length, sub: 'In your team', cls: myTeamIncidents.length > 0 ? 'high' : 'ok' },
      { label: 'Engineers on-call', value: store.users.filter(u => u.team_name === currentUser.team_name && u.on_call_status).length, sub: `of ${store.users.filter(u => u.team_name === currentUser.team_name).length} in team`, cls: 'info' },
      { label: 'Servers monitored', value: store.servers.length, sub: 'In fleet', cls: 'info' },
      { label: 'Critical in fleet', value: critServers, sub: 'Infrastructure health', cls: critServers > 0 ? 'critic' : 'ok' },
    ];
  } else {
    kpis = [
      { label: 'My incidents', value: myIncidents.length, sub: myIncidents.length > 0 ? 'Assigned to you' : 'Inbox clear', cls: myIncidents.length > 0 ? 'high' : 'ok' },
      { label: 'Team incidents', value: myTeamIncidents.length, sub: `In ${currentUser.team_name}`, cls: 'info' },
      { label: 'On-call status', value: currentUser.on_call_status ? 'ACTIVE' : 'OFF', sub: 'See Teams page', cls: currentUser.on_call_status ? 'ok' : 'neutral' },
      { label: 'Team servers', value: store.servers.length, sub: 'All in fleet', cls: 'info' },
    ];
  }

  const sortedHealth = [...health].sort((a, b) => {
    const order = { CRITIC: 0, WARNING: 1, OK: 2, OFFLINE: 3 };
    return order[a.health_status] - order[b.health_status];
  });

  const recentAlarms = store.alarms.slice(0, 8);

  return (
    <div className="page" style={{gridTemplateColumns: '1fr 1fr 1fr 1fr', gridTemplateRows: 'auto 1fr 1fr', gridTemplateAreas: `
      "kpi1 kpi2 kpi3 kpi4"
      "health health health feed"
      "incidents incidents servers servers"
    `}}>
      {kpis.map((k, i) => (
        <div key={i} className="stat-card" style={{gridArea: `kpi${i+1}`}}>
          <div className="kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="row gap-8" style={{alignItems: 'baseline'}}>
              <div className="kpi-value" style={{color: k.cls === 'critic' ? 'var(--critic)' : k.cls === 'high' ? 'var(--high)' : k.cls === 'ok' ? 'var(--ok)' : 'var(--text)'}}>{k.value}</div>
            </div>
            <div className="kpi-meta">{k.sub}</div>
          </div>
        </div>
      ))}

      <div className="card" style={{gridArea: 'health'}}>
        <div className="card-header">
          <div className="card-title">Infrastructure health</div>
          <div className="card-subtitle">last 5 min · {health.length} servers · auto-refresh</div>
          <div className="card-actions">
            <span className="pill pill-ok"><span className="dot"></span>{okServers} OK</span>
            <span className="pill pill-warn"><span className="dot"></span>{warnServers} warning</span>
            <span className="pill sev-critic"><span className="dot"></span>{critServers} critical</span>
            {offlineServers > 0 && <span className="pill pill-offline"><span className="dot"></span>{offlineServers} offline</span>}
          </div>
        </div>
        <div className="card-body">
          {sortedHealth.length === 0 && <div className="empty">No metrics yet — start an agent to see data</div>}
          {sortedHealth.length > 0 && (
            <div className="heatmap">
              <div className="heat-row" style={{padding: '0 0 6px', borderBottom: '1px solid var(--border)'}}>
                <div className="heat-row-label dim text-xs">SERVER</div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr minmax(60px, 1.3fr) 80px', gap: 8, alignItems: 'center'}} className="dim text-xs">
                  <div>CPU</div>
                  <div>RAM</div>
                  <div>DISK</div>
                  <div>TREND</div>
                  <div>STATUS</div>
                </div>
              </div>
              {sortedHealth.map(h => {
                const hist = store.metricsHistory[h.server_id];
                const trendValues = hist ? hist.slice(-30).map(x => Math.max(x.cpu || 0, x.ram || 0, x.disk || 0)) : [];
                const isOffline = h.health_status === 'OFFLINE';
                const sevColor = isOffline ? 'var(--text-4)' : h.health_status === 'CRITIC' ? 'var(--critic)' : h.health_status === 'WARNING' ? 'var(--medium)' : 'var(--ok)';
                return (
                  <div key={h.server_id} className="heat-row" onClick={() => setRoute('metrics')} style={{cursor: 'pointer', padding: '7px 0', borderBottom: '1px solid var(--border-soft)'}}>
                    <div className="heat-row-label">
                      <span className="mono text-xs" style={{color: 'var(--text)'}}>{h.server_id}</span>
                      <span className="dim text-xs mono" style={{marginLeft: 4}}>{h.region}</span>
                    </div>
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr minmax(60px, 1.3fr) 80px', gap: 8, alignItems: 'center'}}>
                      <MetricBar value={isOffline ? 0 : h.avg_cpu} />
                      <MetricBar value={isOffline ? 0 : h.avg_ram} />
                      <MetricBar value={isOffline ? 0 : h.avg_disk} />
                      <div style={{minWidth: 0}}>
                        {isOffline ? <span className="dim text-xs mono">offline</span> : <Sparkline values={trendValues} width={120} height={20} color={sevColor} />}
                      </div>
                      <div><StatusPill value={h.health_status} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{gridArea: 'feed'}}>
        <div className="card-header">
          <div className="card-title">Live alarm feed</div>
          <div className="card-actions">
            <span className="live-dot"></span>
          </div>
        </div>
        <div className="card-body no-pad">
          {recentAlarms.length === 0 && <div className="empty" style={{padding: 24}}>No alarms yet</div>}
          <div className="feed">
            {recentAlarms.map(a => (
              <div key={a.id} className="feed-item" onClick={() => openIncident(a.incident_id)}>
                <div className={`feed-bullet ${String(a.severity).toLowerCase()}`}></div>
                <div>
                  <div className="feed-msg">{a.message}</div>
                  <div className="feed-sub">{a.metric_type} · {a.server_id} · #{a.incident_id}</div>
                </div>
                <div className="feed-time">{relTime(a.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{gridArea: 'incidents'}}>
        <div className="card-header">
          <div className="card-title">
            {isEng ? 'My queue' : isSM ? `${currentUser.team_name} incidents` : 'Active incidents'}
          </div>
          <div className="card-subtitle">{allOpen.length} open · sorted by severity</div>
          <div className="card-actions">
            <button className="btn btn-sm" onClick={() => setRoute(isEng ? 'my-queue' : 'incidents')}>View all <Icon name="chev-r" size={12} /></button>
          </div>
        </div>
        <div className="card-body no-pad">
          <table className="table">
            <thead><tr>
              <th>SEV</th><th>ID</th><th>TITLE</th><th>SERVER</th><th>TEAM</th><th>ASSIGNED</th><th>OPENED</th>
            </tr></thead>
            <tbody>
              {(isEng ? myIncidents : isSM ? myTeamIncidents : allOpen).slice(0, 8).map(i => {
                const assignee = store.users.find(u => u.id === i.assigned_person);
                return (
                  <tr key={i.id} onClick={() => openIncident(i.id)}>
                    <td><SeverityPill value={i.severity} /></td>
                    <td className="mono dim">#{i.id}</td>
                    <td className="fw-500">{i.title.replace(/^\[[^\]]+\]\s*/, '')}</td>
                    <td className="mono">{i.server_id}</td>
                    <td>{i.assigned_team || <span className="dim">unassigned</span>}</td>
                    <td>{assignee ? <span className="row gap-6"><Avatar name={assignee.name} size={18} /> {assignee.name}</span> : <span className="dim">—</span>}</td>
                    <td className="dim mono text-xs">{relTime(i.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{gridArea: 'servers'}}>
        <div className="card-header">
          <div className="card-title">{isExec ? 'War room status' : 'Top problems'}</div>
          <div className="card-subtitle">{isExec ? 'Bridges & critical incidents' : 'Recurring patterns · last 24h'}</div>
          <div className="card-actions">
            <button className="btn btn-sm" onClick={() => setRoute(isExec ? 'incidents' : 'problems')}>Open <Icon name="chev-r" size={12} /></button>
          </div>
        </div>
        <div className="card-body no-pad">
          {isExec ? (
            <table className="table">
              <thead><tr><th>SEV</th><th>INCIDENT</th><th>BRIDGE</th><th>OPENED</th></tr></thead>
              <tbody>
                {store.incidents.filter(i => i.bridge_required && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')).map(i => (
                  <tr key={i.id} onClick={() => openIncident(i.id)}>
                    <td><SeverityPill value={i.severity} /></td>
                    <td>
                      <div className="fw-500">{i.title.replace(/^\[[^\]]+\]\s*/, '')}</div>
                      <div className="dim text-xs mono">#{i.id} · {i.server_id}</div>
                    </td>
                    <td>
                      {i.bridge_status === 'Active'
                        ? <span className="pill pill-ok"><span className="dot"></span>ACTIVE</span>
                        : <span className="pill pill-warn"><span className="dot"></span>WAITING</span>}
                    </td>
                    <td className="dim mono text-xs">{relTime(i.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="table">
              <thead><tr><th>SEV</th><th>PATTERN</th><th>SERVER</th><th>OCC</th><th>LAST</th></tr></thead>
              <tbody>
                {store.problems.slice(0, 6).map(p => (
                  <tr key={p.id}>
                    <td><SeverityPill value={p.severity === 'critical' ? 'critic' : p.severity} /></td>
                    <td className="fw-500">{p.title}</td>
                    <td className="mono">{p.server_id}</td>
                    <td className="mono tnum">{p.occurrence_count}×</td>
                    <td className="dim mono text-xs">{relTime(p.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
