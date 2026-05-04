const SEVERITIES = [
  { value: 'CRITIC', label: 'CRITICAL', color: 'var(--sev-critical)' },
  { value: 'HIGH', label: 'HIGH', color: 'var(--sev-high)' },
  { value: 'MEDIUM', label: 'MEDIUM', color: 'var(--sev-medium)' },
  { value: 'LOW', label: 'LOW', color: 'var(--sev-low)' },
];

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

const TEAMS = [
  { value: 'Infrastructure', color: '#3b82f6' },
  { value: 'Backend', color: '#a78bfa' },
  { value: 'Database', color: '#22d3ee' },
  { value: 'Security', color: '#ec4899' },
];

export function IncidentsFilters({ 
  filters, 
  setFilters, 
  searchQuery, 
  setSearchQuery,
  totalShown,
  totalAll
}) {
  // Click pe un chip — toggle
  const toggleFilter = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }));
  };
  
  return (
    <div className="filters">
      {SEVERITIES.map(sev => (
        <button
          key={sev.value}
          className={`filter-chip ${filters.severity === sev.value ? 'active' : ''}`}
          onClick={() => toggleFilter('severity', sev.value)}
        >
          <span className="fc-dot" style={{ background: sev.color }} />
          {sev.label}
        </button>
      ))}
      
      <span className="filter-divider" />
      
      {STATUSES.map(status => (
        <button
          key={status}
          className={`filter-chip ${filters.status === status ? 'active' : ''}`}
          onClick={() => toggleFilter('status', status)}
        >
          {status.replace('_', ' ')}
        </button>
      ))}
      
      <span className="filter-divider" />
      
      {TEAMS.map(team => (
        <button
          key={team.value}
          className={`filter-chip ${filters.team === team.value ? 'active' : ''}`}
          onClick={() => toggleFilter('team', team.value)}
        >
          <span className="fc-dot" style={{ background: team.color }} />
          {team.value}
        </button>
      ))}
      
      <div className="filter-search">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="4.5"/>
          <line x1="10.5" y1="10.5" x2="14" y2="14"/>
        </svg>
        <input
          placeholder="server, ID, title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)', marginLeft: 8 }}>
        {totalShown}/{totalAll}
      </span>
    </div>
  );
}