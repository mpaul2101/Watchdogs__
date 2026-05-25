import React, { useState } from 'react';
import { useStore, useNow, getInfrastructureHealth } from '../api.js';
import { StatusPill, SeverityPill, MetricBar, Sparkline, LiveChart, Empty, Icon, relTime } from '../components/Common.jsx';

export function ServersScreen({ currentUser, openServer, openIncident }) {
  const store = useStore();
  useNow(2500);

  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedServer, setSelectedServer] = useState(null);

  const health = getInfrastructureHealth();
  const healthMap = Object.fromEntries(health.map(h => [h.server_id, h]));
  const regions = Array.from(new Set(store.servers.map(s => s.region)));
  if (!selectedServer && store.servers.length > 0) setSelectedServer(store.servers[0].id);

  let filtered = store.servers;
  if (regionFilter !== 'all') filtered = filtered.filter(s => s.region === regionFilter);
  if (statusFilter !== 'all') {
    if (statusFilter === 'offline') filtered = filtered.filter(s => s.status === 'offline');
    else filtered = filtered.filter(s => { const h = healthMap[s.id]; return h && h.health_status === statusFilter; });
  }

  const grouped = {};
  filtered.forEach(s => {
    if (!grouped[s.region]) grouped[s.region] = [];
    grouped[s.region].push(s);
  });

  const selected = store.servers.find(s => s.id === selectedServer);
  const selectedHealth = healthMap[selectedServer];
  const selectedHist = store.metricsHistory[selectedServer] || [];
  const selectedLast = selectedHist[selectedHist.length - 1] || {};
  const selectedIncidents = store.incidents.filter(i => i.server_id === selectedServer);

  const stats = {
    total: store.servers.length,
    online: store.servers.filter(s => s.status === 'online').length,
    offline: store.servers.filter(s => s.status === 'offline').length,
    critic: health.filter(h => h.health_status === 'CRITIC').length,
    warning: health.filter(h => h.health_status === 'WARNING').length,
    ok: health.filter(h => h.health_status === 'OK').length,
  };

  return (
    <div className="page" style={{gridTemplateColumns: '1.4fr 1fr', gridTemplateRows: 'auto 1fr', gap: 12}}>
      <div className="page-header" style={{gridColumn: '1 / -1'}}>
        <div className="page-title">Servers</div>
        <div className="page-subtitle">{stats.total} servers · {stats.online} online · {stats.offline} offline · live metrics</div>
        <div className="page-actions">
          <div className="chip-row">
            <button className={`chip ${regionFilter === 'all' ? 'active' : ''}`} onClick={() => setRegionFilter('all')}>All regions</button>
            {regions.map(r => (
              <button key={r} className={`chip ${regionFilter === r ? 'active' : ''}`} onClick={() => setRegionFilter(r)}>{r}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{minHeight: 0}}>
        <div className="card-header">
          <div className="card-title">Fleet status</div>
          <div className="chip-row" style={{marginLeft: 'auto'}}>
            <button className={`chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>All</button>
            <button className={`chip ${statusFilter === 'CRITIC' ? 'active' : ''}`} onClick={() => setStatusFilter('CRITIC')}>
              <span className="dot" style={{width:5,height:5,borderRadius:3,background:'var(--critic)'}}></span> Critic <span className="count">{stats.critic}</span>
            </button>
            <button className={`chip ${statusFilter === 'WARNING' ? 'active' : ''}`} onClick={() => setStatusFilter('WARNING')}>
              <span className="dot" style={{width:5,height:5,borderRadius:3,background:'var(--medium)'}}></span> Warn <span className="count">{stats.warning}</span>
            </button>
            <button className={`chip ${statusFilter === 'OK' ? 'active' : ''}`} onClick={() => setStatusFilter('OK')}>
              <span className="dot" style={{width:5,height:5,borderRadius:3,background:'var(--ok)'}}></span> OK <span className="count">{stats.ok}</span>
            </button>
            <button className={`chip ${statusFilter === 'offline' ? 'active' : ''}`} onClick={() => setStatusFilter('offline')}>
              <span className="dot" style={{width:5,height:5,borderRadius:3,background:'var(--text-4)'}}></span> Offline <span className="count">{stats.offline}</span>
            </button>
          </div>
        </div>
        <div className="card-body">
          {Object.keys(grouped).length === 0 && <Empty icon="server">No servers yet — start an agent</Empty>}
          {Object.entries(grouped).map(([region, servers]) => (
            <div key={region} style={{marginBottom: 16}}>
              <div className="row" style={{marginBottom: 8, alignItems: 'baseline'}}>
                <span className="mono dim text-xs" style={{textTransform: 'uppercase', letterSpacing: '0.08em'}}>{region}</span>
                <span className="dim text-xs">· {servers.length} {servers.length === 1 ? 'server' : 'servers'}</span>
              </div>
              <div className="server-grid">
                {servers.map(s => {
                  const h = healthMap[s.id];
                  const hist = store.metricsHistory[s.id] || [];
                  const last = hist[hist.length - 1] || {};
                  const trendValues = hist.slice(-30).map(x => Math.max(x.cpu || 0, x.ram || 0, x.disk || 0));
                  const cardClass = s.status === 'offline' ? 'offline' : h?.health_status === 'CRITIC' ? 'critic' : h?.health_status === 'WARNING' ? 'warn' : 'ok';
                  const inc = store.incidents.filter(i => i.server_id === s.id && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')).length;
                  return (
                    <div key={s.id} className={`server-card ${cardClass}`}
                      style={selectedServer === s.id ? {borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)'} : {}}
                      onClick={() => setSelectedServer(s.id)}>
                      <div className="server-card-head">
                        <div>
                          <div className="server-id">{s.id}</div>
                          <div className="server-region">{s.region}</div>
                        </div>
                        <div className="col" style={{alignItems: 'flex-end', gap: 4}}>
                          <StatusPill value={s.status === 'offline' ? 'OFFLINE' : h?.health_status || 'OK'} />
                          {inc > 0 && <span className="pill sev-critic" style={{padding: '1px 6px', fontSize: 10}}>{inc} OPEN</span>}
                        </div>
                      </div>
                      <Sparkline values={trendValues.length ? trendValues : [0]} width={230} height={28} color={cardClass === 'critic' ? 'var(--critic)' : cardClass === 'warn' ? 'var(--medium)' : 'var(--ok)'} />
                      <div className="server-mini">
                        <div className="server-mini-cell"><div>CPU</div><div className="v tnum">{s.status === 'offline' ? '—' : (last.cpu || 0).toFixed(0) + '%'}</div></div>
                        <div className="server-mini-cell"><div>RAM</div><div className="v tnum">{s.status === 'offline' ? '—' : (last.ram || 0).toFixed(0) + '%'}</div></div>
                        <div className="server-mini-cell"><div>DISK</div><div className="v tnum">{s.status === 'offline' ? '—' : (last.disk || 0).toFixed(0) + '%'}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{minHeight: 0}}>
        {selected ? (
          <ServerDetail server={selected} health={selectedHealth} hist={selectedHist} last={selectedLast} incidents={selectedIncidents} openIncident={openIncident} />
        ) : (
          <Empty>Select a server</Empty>
        )}
      </div>
    </div>
  );
}

function ServerDetail({ server, health, hist, last, incidents, openIncident }) {
  const openInc = incidents.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS');
  const recentInc = incidents.slice(0, 8);
  const chartData = hist.slice(-30).map(h => ({ ts: h.ts, cpu: h.cpu || 0, ram: h.ram || 0, disk: h.disk || 0 }));
  const isOffline = server.status === 'offline';

  return (
    <div className="inc-detail">
      <div className="inc-detail-header">
        <div className="row gap-8" style={{marginBottom: 4}}>
          <span className="inc-detail-id mono">{server.region}</span>
          <span className="dim text-xs">·</span>
          <span className="dim text-xs">last seen {hist.length ? relTime(new Date(hist[hist.length-1].ts).toISOString()) : '—'}</span>
        </div>
        <div className="inc-detail-title mono">{server.id}</div>
        <div className="inc-detail-meta">
          <StatusPill value={isOffline ? 'OFFLINE' : health?.health_status || 'OK'} />
          {openInc.length > 0 && <span className="pill sev-critic"><span className="dot"></span>{openInc.length} OPEN INCIDENT{openInc.length === 1 ? '' : 'S'}</span>}
          {!isOffline && <span className="pill pill-ok"><span className="dot"></span>ONLINE</span>}
        </div>
      </div>

      <div className="inc-detail-body">
        <div className="inc-detail-section">
          <div className="inc-detail-section-title">Live metrics · last 2 min</div>
          {isOffline ? (
            <div className="card" style={{background: 'var(--bg-elev)', padding: 24, textAlign: 'center'}}>
              <div className="dim">Server is offline — no live metrics</div>
            </div>
          ) : (
            <>
              <div className="col gap-12">
                <MetricBar value={last.cpu || 0} label="CPU" />
                <MetricBar value={last.ram || 0} label="RAM" />
                <MetricBar value={last.disk || 0} label="Disk" />
              </div>
              <div style={{background: 'var(--bg-elev)', borderRadius: 8, padding: 8, marginTop: 12}}>
                <div className="row gap-12" style={{marginBottom: 4, fontSize: 11}}>
                  <span className="row gap-4"><span className="dot" style={{width:8,height:8,borderRadius:4,background:'var(--accent)',display:'inline-block'}}></span> CPU</span>
                  <span className="row gap-4"><span className="dot" style={{width:8,height:8,borderRadius:4,background:'var(--info)',display:'inline-block'}}></span> RAM</span>
                  <span className="row gap-4"><span className="dot" style={{width:8,height:8,borderRadius:4,background:'var(--low)',display:'inline-block'}}></span> Disk</span>
                </div>
                <LiveChart
                  data={chartData}
                  lines={[
                    { key: 'cpu', color: 'var(--accent)' },
                    { key: 'ram', color: 'var(--info)' },
                    { key: 'disk', color: 'var(--low)' },
                  ]}
                  height={140}
                />
              </div>
            </>
          )}
        </div>

        {!isOffline && (
          <div className="inc-detail-section">
            <div className="inc-detail-section-title">Application metrics (latest)</div>
            <dl className="kv">
              <dt>Response time</dt><dd className="mono tnum">{last.response_time_ms ? Math.round(last.response_time_ms) + ' ms' : '—'}</dd>
              <dt>HTTP 5xx rate</dt><dd className="mono tnum">{last.http_5xx_rate != null ? last.http_5xx_rate.toFixed(2) + '%' : '—'}</dd>
              <dt>DB conn pool</dt><dd className="mono tnum">{last.db_conn_pct != null ? last.db_conn_pct.toFixed(0) + '%' : '—'}</dd>
              <dt>Auth failures</dt><dd className="mono tnum">{last.auth_failures ?? '—'}</dd>
              <dt>Active users</dt><dd className="mono tnum">{last.traffic_users ?? '—'}</dd>
            </dl>
          </div>
        )}

        <div className="inc-detail-section">
          <div className="inc-detail-section-title">Incidents on this server · {incidents.length}</div>
          <div className="col gap-4">
            {recentInc.map(i => (
              <div key={i.id} className="row gap-8" style={{padding: '6px 8px', background: 'var(--bg-elev)', borderRadius: 6, border: '1px solid var(--border-soft)', cursor: 'pointer'}} onClick={() => openIncident(i.id)}>
                <SeverityPill value={i.severity} />
                <span className="text-xs mono dim">#{i.id}</span>
                <span className="text-xs flex-1" style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{i.title.replace(/^\[[^\]]+\]\s*/, '')}</span>
                <StatusPill value={i.status} />
              </div>
            ))}
            {incidents.length === 0 && <div className="dim text-xs" style={{padding: 8}}>No incidents recorded.</div>}
          </div>
        </div>

        {!isOffline && health && (
          <div className="inc-detail-section">
            <div className="inc-detail-section-title">5-min aggregates</div>
            <dl className="kv">
              <dt>Avg CPU</dt><dd className="mono tnum">{health.avg_cpu}%</dd>
              <dt>Max CPU</dt><dd className="mono tnum">{health.max_cpu}%</dd>
              <dt>Avg RAM</dt><dd className="mono tnum">{health.avg_ram}%</dd>
              <dt>Max RAM</dt><dd className="mono tnum">{health.max_ram}%</dd>
              <dt>Avg Disk</dt><dd className="mono tnum">{health.avg_disk}%</dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
