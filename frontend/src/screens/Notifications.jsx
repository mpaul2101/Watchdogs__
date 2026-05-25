import React, { useState } from 'react';
import { useStore, useNow, getNotificationTargets } from '../api.js';
import { SeverityPill, Avatar, Empty, Icon, relTime, dateShort } from '../components/Common.jsx';
import { NotifyModal } from '../components/Modals.jsx';

export function NotificationsScreen({ currentUser, openIncident }) {
  const store = useStore();
  useNow(2500);

  const [tab, setTab] = useState('lists');
  const [activeIncident, setActiveIncident] = useState(null);
  const [showNotify, setShowNotify] = useState(false);

  const role = currentUser.role;
  const log = store.notificationLog;  // backend already filters by RBAC

  return (
    <div className="page" style={{gridTemplateRows: 'auto 1fr', gap: 12}}>
      <div className="page-header">
        <div className="page-title">{role === 'CEO' || role === 'CTO' ? 'Alerts I receive' : 'Notifications'}</div>
        <div className="page-subtitle">
          {role === 'CEO' || role === 'CTO' ? 'Red list — executive escalations only'
            : role === 'Incident Manager' ? 'Distribution lists, log of sent alerts, manual dispatch'
            : 'Alerts addressed to you or triggered by you'}
        </div>
        <div className="page-actions">
          <div className="chip-row">
            <button className={`chip ${tab === 'lists' ? 'active' : ''}`} onClick={() => setTab('lists')}>Distribution lists</button>
            <button className={`chip ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>Activity log <span className="count">{log.length}</span></button>
            {role === 'Incident Manager' && (
              <button className={`chip ${tab === 'send' ? 'active' : ''}`} onClick={() => setTab('send')}>Send dispatch</button>
            )}
          </div>
        </div>
      </div>

      {tab === 'lists' && (
        <div className="card" style={{minHeight: 0}}>
          <div className="card-body" style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignContent: 'start'}}>
            {store.notificationLists.length === 0 && <Empty icon="bell">No distribution lists yet</Empty>}
            {store.notificationLists.map(list => (
              <DistributionListCard key={list.id} list={list} currentUser={currentUser} />
            ))}
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div className="card" style={{minHeight: 0}}>
          <div className="card-header">
            <div className="card-title">Notification log · {log.length}</div>
            <div className="card-subtitle">most recent first</div>
          </div>
          <div className="card-body no-pad" style={{overflow: 'auto'}}>
            {log.length === 0 && <Empty icon="bell">No notifications for your scope</Empty>}
            {log.map(n => {
              const u = store.users.find(x => x.id === n.user_id);
              return (
                <div key={n.id} className="notif-log-row" onClick={() => openIncident(n.incident_id)}>
                  <div>
                    <div className="notif-log-time">{relTime(n.sent_at)}</div>
                    <div className="dim text-xs mono" style={{marginTop: 2}}>{dateShort(n.sent_at)}</div>
                  </div>
                  <div>
                    <div className="notif-log-subject">{n.rendered_subject}</div>
                    <div className="notif-log-meta">
                      to <strong style={{color: 'var(--text-2)'}}>{u?.name || n.user_name || '—'}</strong>{n.user_role && ` (${n.user_role})`}
                      {' · '} via {String(n.delivery_method).replace('_', ' ')}
                    </div>
                  </div>
                  <div className="col" style={{alignItems: 'flex-end', gap: 4}}>
                    <span className={`pill ${n.list_name === 'red' ? 'sev-critic' : n.list_name === 'yellow' ? 'sev-medium' : n.list_name === 'green' ? 'pill-ok' : n.list_name === 'on_call_team' ? 'pill-info' : n.list_name === 'direct_assign' ? 'pill-warn' : 'pill-neutral'}`} style={{padding: '1px 6px'}}>
                      <span className="dot"></span>{String(n.list_name).replace('_', ' ')}
                    </span>
                    <span className="dim text-xs mono">#{n.incident_id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'send' && role === 'Incident Manager' && (
        <div className="card" style={{minHeight: 0}}>
          <div className="card-header">
            <div className="card-title">Manual dispatch</div>
            <div className="card-subtitle">pick an active incident to dispatch notifications · preview before sending</div>
          </div>
          <div className="card-body no-pad" style={{overflow: 'auto'}}>
            <table className="table">
              <thead><tr>
                <th>SEV</th><th>ID</th><th>TITLE</th><th>SERVER</th><th>RECIPIENTS</th><th></th>
              </tr></thead>
              <tbody>
                {store.incidents.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS').map(i => {
                  const targets = getNotificationTargets(i.id);
                  return (
                    <tr key={i.id} onClick={() => openIncident(i.id)}>
                      <td><SeverityPill value={i.severity} /></td>
                      <td className="mono dim">#{i.id}</td>
                      <td className="fw-500">{i.title.replace(/^\[[^\]]+\]\s*/, '')}</td>
                      <td className="mono">{i.server_id}</td>
                      <td className="row gap-4">
                        <span className="pill pill-neutral" style={{padding: '1px 6px'}}><span className="dot"></span>{targets.length} cached</span>
                        <span className="dim text-xs">open preview to fetch</span>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); setActiveIncident(i); setShowNotify(true); }}>
                          <Icon name="send" size={11} /> Dispatch
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNotify && activeIncident && <NotifyModal incident={activeIncident} currentUser={currentUser} onClose={() => setShowNotify(false)} />}
    </div>
  );
}

function DistributionListCard({ list, currentUser }) {
  const memberCount = list.member_count ?? 0;
  const canEdit = currentUser.role === 'Incident Manager';

  return (
    <div className={`notif-list-card ${list.name}`}>
      <div className="row gap-8">
        <div className="col" style={{flex: 1}}>
          <div className="notif-list-name">{list.name} list</div>
          <div className="notif-list-trigger">trigger: <span className="mono" style={{color: 'var(--text-2)'}}>{list.severity_trigger}</span></div>
        </div>
        {list.auto_call && <span className="pill pill-warn"><span className="dot"></span>AUTO-CALL</span>}
      </div>
      <div className="dim text-xs">{list.description}</div>
      <div className="divider"></div>
      <div className="col gap-6">
        <div className="row gap-8" style={{justifyContent: 'space-between'}}>
          <div className="field-label">Members</div>
          <span className="mono fw-600 text-md">{memberCount}</span>
        </div>
        <div className="dim text-xs">
          API exposes only the count. Add <span className="mono">GET /api/notifications/lists/{'{id}'}/members</span> to surface each member here.
        </div>
        {canEdit && (
          <button className="btn btn-sm" style={{alignSelf: 'flex-start', marginTop: 4}} disabled
            title="No backend endpoint yet">
            <Icon name="plus" size={11} /> Add member
          </button>
        )}
      </div>
    </div>
  );
}
