import React, { useState } from 'react';
import { useStore, useNow, startBridge } from '../api.js';
import { SeverityPill, Avatar, Icon, Empty, relTime } from '../components/Common.jsx';
import { ReassignModal, NotifyModal } from '../components/Modals.jsx';

export function TriageScreen({ currentUser, openIncident }) {
  const store = useStore();
  useNow(2500);

  const [activeIncident, setActiveIncident] = useState(null);
  const [showReassign, setShowReassign] = useState(false);
  const [showNotify, setShowNotify] = useState(false);

  const all = store.incidents;
  const sevRank = { CRITIC: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
  const sortSev = (a, b) => (sevRank[a.severity] - sevRank[b.severity]) || (new Date(b.created_at) - new Date(a.created_at));

  const untriaged = all.filter(i => i.triage_status === 'Unassigned' && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')).sort(sortSev);
  const bridge = all.filter(i => i.bridge_status === 'Active' && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')).sort(sortSev);
  const assigned = all.filter(i => i.triage_status === 'Assigned' && i.status === 'IN_PROGRESS' && i.bridge_status !== 'Active').sort(sortSev);
  const resolved = all.filter(i => i.status === 'RESOLVED' || i.status === 'CLOSED').sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 8);

  const openAssign = (inc) => { setActiveIncident(inc); setShowReassign(true); };
  const openNotify = (inc) => { setActiveIncident(inc); setShowNotify(true); };

  const critCount = all.filter(i => i.severity === 'CRITIC' && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')).length;
  const isIM = currentUser.role === 'Incident Manager';

  return (
    <div className="page" style={{gridTemplateRows: 'auto 1fr', gap: 12}}>
      <div className="page-header">
        <div className="page-title">Triage queue</div>
        <div className="page-subtitle">{isIM ? 'Incident Manager workspace' : 'View-only · sign in as Incident Manager to manage'}</div>
        <div className="page-actions">
          <span className="pill sev-critic"><span className="dot"></span>{critCount} CRITIC OPEN</span>
          <span className="pill pill-warn"><span className="dot"></span>{untriaged.length} UNTRIAGED</span>
          <span className="pill pill-ok"><span className="dot"></span>{bridge.length} BRIDGES ACTIVE</span>
        </div>
      </div>

      <div className="kanban">
        <KanbanCol title="Untriaged" tint="critic" count={untriaged.length} subtitle="Needs assignment">
          {untriaged.length === 0 && <Empty icon="check">Queue is empty</Empty>}
          {untriaged.map(i => (
            <TriageCard key={i.id} incident={i} onClick={() => openIncident(i.id)}
              actions={<>
                <button className="btn btn-xs btn-primary" disabled={!isIM || (i.bridge_required && i.bridge_status !== 'Active')}
                  onClick={(e) => { e.stopPropagation(); openAssign(i); }}>
                  <Icon name="users" size={11} /> Assign
                </button>
                {i.bridge_required && i.bridge_status !== 'Active' && (
                  <button className="btn btn-xs btn-danger" disabled={!isIM}
                    onClick={(e) => { e.stopPropagation(); startBridge(i.id).catch(err => alert(err.message)); }}>
                    <Icon name="phone" size={11} /> Bridge
                  </button>
                )}
              </>}
            />
          ))}
        </KanbanCol>

        <KanbanCol title="War room" tint="high" count={bridge.length} subtitle="Bridges active">
          {bridge.length === 0 && <Empty icon="phone">No active war rooms</Empty>}
          {bridge.map(i => (
            <TriageCard key={i.id} incident={i} onClick={() => openIncident(i.id)}
              extra={
                <div className="row gap-6" style={{padding: '6px 8px', background: 'var(--ok-bg)', borderRadius: 4, marginTop: 6}}>
                  <span className="live-dot" style={{background: 'var(--ok)'}}></span>
                  <span className="text-xs mono" style={{color: 'var(--ok)'}}>BRIDGE ACTIVE</span>
                  {i.bridge_url && <span className="dim text-xs mono right">{i.bridge_url.slice(-20)}</span>}
                </div>
              }
              actions={<>
                {i.triage_status === 'Unassigned' && (
                  <button className="btn btn-xs btn-primary" disabled={!isIM}
                    onClick={(e) => { e.stopPropagation(); openAssign(i); }}>
                    <Icon name="users" size={11} /> Assign
                  </button>
                )}
                <button className="btn btn-xs" disabled={!isIM}
                  onClick={(e) => { e.stopPropagation(); openNotify(i); }}>
                  <Icon name="send" size={11} /> Notify
                </button>
              </>}
            />
          ))}
        </KanbanCol>

        <KanbanCol title="In progress" tint="info" count={assigned.length} subtitle="With engineers">
          {assigned.length === 0 && <Empty icon="users">No incidents in progress</Empty>}
          {assigned.map(i => {
            const u = store.users.find(x => x.id === i.assigned_person);
            return (
              <TriageCard key={i.id} incident={i} onClick={() => openIncident(i.id)}
                extra={u && (
                  <div className="row gap-6" style={{padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 4, marginTop: 6}}>
                    <Avatar name={u.name} size={18} />
                    <span className="text-xs">{u.name}</span>
                    <span className="dim text-xs">· {i.assigned_team}</span>
                    {u.on_call_status && <span className="pill pill-ok right" style={{padding: '0 6px', fontSize: 9}}>ON-CALL</span>}
                  </div>
                )}
                actions={<>
                  <button className="btn btn-xs" disabled={!isIM} onClick={(e) => { e.stopPropagation(); openAssign(i); }}>Reassign</button>
                  <button className="btn btn-xs" disabled={!isIM} onClick={(e) => { e.stopPropagation(); openNotify(i); }}>
                    <Icon name="send" size={11} /> Update
                  </button>
                </>}
              />
            );
          })}
        </KanbanCol>

        <KanbanCol title="Resolved (recent)" tint="ok" count={resolved.length} subtitle="Last 24h">
          {resolved.length === 0 && <Empty icon="check">No resolutions yet</Empty>}
          {resolved.map(i => (
            <TriageCard key={i.id} incident={i} faded onClick={() => openIncident(i.id)}
              extra={<div className="dim text-xs" style={{marginTop: 6}}>Closed {relTime(i.updated_at)} · {i.assigned_team}</div>}
            />
          ))}
        </KanbanCol>
      </div>

      {showReassign && activeIncident && <ReassignModal incident={activeIncident} currentUser={currentUser} onClose={() => setShowReassign(false)} />}
      {showNotify && activeIncident && <NotifyModal incident={activeIncident} currentUser={currentUser} onClose={() => setShowNotify(false)} />}
    </div>
  );
}

function KanbanCol({ title, count, subtitle, tint, children }) {
  return (
    <div className="kanban-col">
      <div className="kanban-head">
        <span className="title">{title}</span>
        <span className="dim text-xs">{subtitle}</span>
        <span className={`count ${tint}`}>{count}</span>
      </div>
      <div className="kanban-body">{children}</div>
    </div>
  );
}

function TriageCard({ incident, actions, extra, faded, onClick }) {
  return (
    <div className="triage-card" style={{opacity: faded ? 0.65 : 1}} onClick={onClick}>
      <div className="triage-card-head">
        <SeverityPill value={incident.severity} />
        {incident.bridge_required && incident.bridge_status !== 'Active' && (
          <span className="pill pill-warn" style={{padding: '1px 6px', fontSize: 10}}><span className="dot"></span>BRIDGE REQ</span>
        )}
        <span className="dim text-xs mono right">#{incident.id}</span>
      </div>
      <div className="triage-card-title">{incident.title.replace(/^\[[^\]]+\]\s*/, '')}</div>
      <div className="triage-card-meta">
        <span className="mono">{incident.server_id}</span>
        <span>·</span>
        <span className="mono">{incident.metric_type}</span>
        <span>·</span>
        <span>{relTime(incident.created_at)}</span>
      </div>
      {extra}
      {actions && <div className="triage-card-actions">{actions}</div>}
    </div>
  );
}
