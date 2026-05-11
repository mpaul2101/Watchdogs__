import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

function initialsFromName(name) {
  if (!name) return '--';
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function TeamsPage() {
  const { users, currentUser, loading, error } = useAuth();

  const teams = useMemo(() => {
    const grouped = new Map();
    users.forEach((u) => {
      const key = u.team_name || 'Unknown';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(u);
    });

    return Array.from(grouped.entries())
      .map(([teamName, members]) => {
        const onCallCount = members.filter((m) => m.on_call_status).length;
        const sorted = members.slice().sort((a, b) => a.name.localeCompare(b.name));
        return { teamName, members: sorted, onCallCount };
      })
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [users]);

  if (loading) {
    return (
      <div className="panel teams">
        <div className="panel-header">
          <span className="ph-title">Teams</span>
        </div>
        <div className="empty">loading teams...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel teams">
        <div className="panel-header">
          <span className="ph-title">Teams</span>
        </div>
        <div className="empty" style={{ color: 'var(--sev-critical)' }}>
          failed to load teams
        </div>
      </div>
    );
  }

  return (
    <div className="panel teams">
      <div className="panel-header">
        <span className="ph-title">Teams Directory</span>
        <span className="ph-meta">{users.length} users</span>
      </div>

      <div className="teams-grid">
        {teams.map((team) => (
          <div key={team.teamName} className="team-card">
            <div className="team-card-header">
              <div className="team-title">{team.teamName}</div>
              <div className="team-count">{team.onCallCount} on-call</div>
            </div>
            <div className="team-list">
              {team.members.map((member) => (
                <div
                  key={member.id}
                  className={`team-user ${currentUser?.id === member.id ? 'active' : ''}`}
                >
                  <span className="tu-avatar">{initialsFromName(member.name)}</span>
                  <span className="tu-info">
                    <span className="tu-name">{member.name}</span>
                    <span className="tu-role">{member.role}</span>
                  </span>
                  {member.on_call_status && <span className="badge oncall">On-Call</span>}
                </div>
              ))}
            </div>
          </div>
        ))}

        {teams.length === 0 && <div className="empty">no users found</div>}
      </div>
    </div>
  );
}
