import React from 'react';
import { useStore, useNow, toggleOnCall } from '../api.js';
import { SeverityPill, Avatar, Icon } from '../components/Common.jsx';

export function TeamsScreen({ currentUser }) {
  const store = useStore();
  useNow(2500);

  const teamGroups = {};
  store.users.forEach(u => {
    if (!teamGroups[u.team_name]) teamGroups[u.team_name] = [];
    teamGroups[u.team_name].push(u);
  });

  const routing = [
    { metric: 'CPU',            team: 'Infrastructure' },
    { metric: 'RAM',            team: 'Infrastructure' },
    { metric: 'DISK',           team: 'Infrastructure' },
    { metric: 'NODE_DOWN',      team: 'Infrastructure' },
    { metric: 'RESPONSE_TIME',  team: 'Backend' },
    { metric: 'HTTP_5XX',       team: 'Backend' },
    { metric: 'DB_CONN_POOL',   team: 'Database' },
    { metric: 'AUTH_FAILURES',  team: 'Security' },
  ];

  return (
    <div className="page" style={{gridTemplateColumns: '1.6fr 1fr', gridTemplateRows: 'auto 1fr', gap: 12}}>
      <div className="page-header" style={{gridColumn: '1 / -1'}}>
        <div className="page-title">Teams &amp; on-call</div>
        <div className="page-subtitle">{store.users.length} users across {Object.keys(teamGroups).length} teams · {store.users.filter(u => u.on_call_status).length} on-call right now</div>
        <div className="page-actions">
          <span className="dim text-xs">click your own badge to toggle on-call</span>
        </div>
      </div>

      <div className="card" style={{minHeight: 0}}>
        <div className="card-header">
          <div className="card-title">Team rosters</div>
        </div>
        <div className="card-body" style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, alignContent: 'start'}}>
          {Object.entries(teamGroups).map(([team, members]) => {
            const onCall = members.filter(m => m.on_call_status);
            const openInc = store.incidents.filter(i => i.assigned_team === team && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')).length;
            return (
              <div key={team} className="team-card">
                <div className="team-card-head">
                  <div className="team-name">{team}</div>
                  <div className="row gap-6" style={{marginLeft: 'auto'}}>
                    {openInc > 0 && <span className="pill sev-critic"><span className="dot"></span>{openInc} OPEN</span>}
                    <span className="pill pill-ok"><span className="dot"></span>{onCall.length} ON-CALL</span>
                  </div>
                </div>
                <div className="team-meta">
                  <span>{members.length} members</span>
                  <span>·</span>
                  <span>{members.filter(m => m.role === 'Engineer').length} engineers</span>
                  <span>·</span>
                  <span>{members.filter(m => m.role === 'System Manager').length} managers</span>
                </div>
                <div className="team-members">
                  {[...members].sort((a, b) => {
                    const order = { 'CEO': 0, 'CTO': 1, 'Incident Manager': 2, 'System Manager': 3, 'Engineer': 4 };
                    return order[a.role] - order[b.role];
                  }).map(m => (
                    <div key={m.id} className="team-member">
                      <Avatar name={m.name} size={24} />
                      <span className="name">{m.name}</span>
                      {currentUser.id === m.id && <span className="dim text-xs">(you)</span>}
                      <span className="role-tag">{m.role}</span>
                      {(() => {
                        const isMe = currentUser.id === m.id;
                        return (
                          <button
                            className={`pill ${m.on_call_status ? 'pill-ok' : 'pill-neutral'}`}
                            style={{padding: '1px 8px', fontSize: 10, marginLeft: 8, border: 'none', cursor: isMe ? 'pointer' : 'default', opacity: isMe ? 1 : 0.7}}
                            disabled={!isMe}
                            onClick={isMe ? () => toggleOnCall(m.id, !m.on_call_status).catch(e => alert(e.message)) : undefined}
                            title={isMe ? 'Click to toggle your on-call status' : 'You can only change your own on-call status'}
                          >
                            <span className="dot"></span>{m.on_call_status ? 'ON-CALL' : 'OFF'}
                          </button>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {Object.keys(teamGroups).length === 0 && <div className="empty">No users loaded yet</div>}
        </div>
      </div>

      <div className="card" style={{minHeight: 0}}>
        <div className="card-header">
          <div className="card-title">Severity → routing</div>
          <div className="card-subtitle">where alarms go automatically</div>
        </div>
        <div className="card-body">
          <div className="col gap-8">
            <div className="dim text-xs">When an alarm fires, the incident is auto-routed to the team responsible for that metric type.</div>
            <div className="col gap-4" style={{marginTop: 12}}>
              {routing.map(r => (
                <div key={r.metric} className="row gap-12" style={{padding: '8px 10px', background: 'var(--bg-elev)', borderRadius: 6, border: '1px solid var(--border-soft)'}}>
                  <span className="mono text-sm" style={{width: 130}}>{r.metric}</span>
                  <span className="dim"><Icon name="chev-r" size={14} /></span>
                  <span className="fw-500 text-sm">{r.team}</span>
                  <span className="dim text-xs right">{store.users.filter(u => u.team_name === r.team).length} ppl</span>
                </div>
              ))}
            </div>

            <div className="divider" style={{margin: '16px 0 8px'}}></div>
            <div className="field-label">Severity → bridge requirement</div>
            <div className="col gap-4">
              {[
                {sev: 'CRITIC', bridge: 'Required'},
                {sev: 'HIGH', bridge: 'Required'},
                {sev: 'MEDIUM', bridge: 'Optional'},
                {sev: 'LOW', bridge: 'Optional'},
              ].map(r => (
                <div key={r.sev} className="row gap-12" style={{padding: '6px 10px', background: 'var(--bg-elev)', borderRadius: 6, border: '1px solid var(--border-soft)'}}>
                  <SeverityPill value={r.sev} />
                  <span className="dim"><Icon name="chev-r" size={14} /></span>
                  <span className={`pill ${r.bridge === 'Required' ? 'pill-warn' : 'pill-neutral'}`}><span className="dot"></span>BRIDGE {r.bridge.toUpperCase()}</span>
                </div>
              ))}
            </div>

            <div className="divider" style={{margin: '16px 0 8px'}}></div>
            <div className="field-label">Severity → notification list</div>
            <div className="col gap-4">
              {store.notificationLists.map(l => (
                <div key={l.id} className="row gap-12" style={{padding: '6px 10px', background: 'var(--bg-elev)', borderRadius: 6, border: '1px solid var(--border-soft)'}}>
                  <SeverityPill value={l.severity_trigger} />
                  <span className="dim"><Icon name="chev-r" size={14} /></span>
                  <span className={`pill ${l.name === 'red' ? 'sev-critic' : l.name === 'yellow' ? 'sev-medium' : 'pill-ok'}`}>
                    <span className="dot"></span>{l.name.toUpperCase()} LIST
                  </span>
                  <span className="dim text-xs right">{l.member_count || 0} members{l.auto_call && ' · auto-call'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
