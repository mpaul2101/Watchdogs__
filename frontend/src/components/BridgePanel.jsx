import React, { useEffect } from 'react';
import { useStore, fetchBridgeParticipants, setMyBridgeState, endBridge } from '../api.js';
import { Avatar, Icon } from './Common.jsx';

/* Interactive (simulated) bridge / war-room call panel.
   - Incident Manager starts/stops the bridge (buttons live in the incident footer).
   - Each user controls ONLY their own state: Join/Leave, Mute/Unmute, Available/Busy.
   - Everyone sees other participants' status but cannot touch their controls. */
export function BridgePanel({ incident, currentUser }) {
  const store = useStore();
  const id = incident.id;
  const active = incident.bridge_status === 'Active';

  useEffect(() => {
    if (!active) return;
    fetchBridgeParticipants(id);
    const t = setInterval(() => fetchBridgeParticipants(id), 4000);
    return () => clearInterval(t);
  }, [id, active]);

  if (!active) return null;

  const participants = store.bridgeParticipants[id] || [];
  const me = participants.find(p => p.user_id === currentUser.id) || null;
  const others = participants.filter(p => p.user_id !== currentUser.id);
  const inCall = participants.filter(p => p.joined).length;
  const isIM = currentUser.role === 'Incident Manager';

  const act = (state) => setMyBridgeState(id, state).catch(e => alert(e.message));

  return (
    <div className="inc-detail-section">
      <div className="inc-detail-section-title row" style={{justifyContent: 'space-between'}}>
        <span className="row gap-6">
          <span className="live-dot" style={{background: 'var(--ok)'}}></span>
          War room · bridge active
        </span>
        <span className="dim text-xs mono">{inCall} in call</span>
      </div>

      <div className="col gap-6" style={{background: 'var(--bg-elev)', borderRadius: 8, padding: 8}}>
        {/* My own controls */}
        <div className="row gap-8" style={{padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6, flexWrap: 'wrap'}}>
          <Avatar name={currentUser.name} size={24} />
          <div className="col" style={{gap: 1}}>
            <span className="text-sm fw-500">{currentUser.name} <span className="dim text-xs">· you</span></span>
            <span className="dim text-xs">{currentUser.role}</span>
          </div>
          <div className="row gap-6" style={{marginLeft: 'auto', flexWrap: 'wrap'}}>
            {!me || !me.joined ? (
              <button className="btn btn-xs btn-primary" onClick={() => act({ joined: true })}>
                <Icon name="phone" size={11} /> Join
              </button>
            ) : (
              <>
                <button className="btn btn-xs btn-danger" onClick={() => act({ joined: false })}>
                  <Icon name="phone" size={11} /> Leave
                </button>
                <button className={`btn btn-xs ${me.muted ? 'btn-primary' : ''}`} onClick={() => act({ muted: !me.muted })}>
                  {me.muted ? 'Unmute' : 'Mute'}
                </button>
                <button className={`btn btn-xs ${me.available ? '' : 'btn-primary'}`} onClick={() => act({ available: !me.available })}>
                  {me.available ? 'Set busy' : 'Set available'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Other participants — status only, no controls */}
        {others.map(p => (
          <div key={p.user_id} className="row gap-8" style={{padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-soft)', opacity: p.joined ? 1 : 0.55}}>
            <Avatar name={p.name} size={24} />
            <div className="col" style={{gap: 1}}>
              <span className="text-sm fw-500">{p.name}</span>
              <span className="dim text-xs">{p.role}{p.team_name ? ` · ${p.team_name}` : ''}</span>
            </div>
            <div className="row gap-6" style={{marginLeft: 'auto', flexWrap: 'wrap'}}>
              <ParticipantStatus p={p} />
            </div>
          </div>
        ))}

        {others.length === 0 && (
          <div className="dim text-xs" style={{padding: '6px 10px'}}>No one else has joined yet.</div>
        )}
      </div>

      {isIM && (
        <div className="row" style={{marginTop: 8}}>
          <button className="btn btn-xs btn-danger" onClick={() => endBridge(id).catch(e => alert(e.message))}>
            <Icon name="x" size={11} /> End bridge for everyone
          </button>
        </div>
      )}
    </div>
  );
}

function ParticipantStatus({ p }) {
  if (!p.joined) {
    return <span className="pill pill-neutral"><span className="dot"></span>LEFT</span>;
  }
  return (
    <>
      <span className="pill pill-ok"><span className="dot"></span>IN CALL</span>
      {p.muted
        ? <span className="pill sev-high"><span className="dot"></span>MUTED</span>
        : <span className="pill pill-info"><span className="dot"></span>MIC ON</span>}
      {p.available
        ? <span className="pill pill-ok"><span className="dot"></span>AVAILABLE</span>
        : <span className="pill pill-warn"><span className="dot"></span>BUSY</span>}
    </>
  );
}
