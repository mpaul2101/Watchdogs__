// Iconițe SVG ca sub-componente, ca să nu poluăm JSX-ul principal
const icons = {
  dashboard: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="2" width="5" height="6"/>
      <rect x="9" y="2" width="5" height="9"/>
      <rect x="2" y="10" width="5" height="4"/>
      <rect x="9" y="13" width="5" height="1"/>
    </svg>
  ),
  incidents: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 2 L14 13 L2 13 Z"/>
      <line x1="8" y1="6" x2="8" y2="10"/>
      <circle cx="8" cy="11.5" r="0.4" fill="currentColor"/>
    </svg>
  ),
  servers: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="2" width="12" height="4"/>
      <rect x="2" y="7" width="12" height="4"/>
      <rect x="2" y="12" width="12" height="2"/>
      <circle cx="4" cy="4" r="0.5" fill="currentColor"/>
      <circle cx="4" cy="9" r="0.5" fill="currentColor"/>
    </svg>
  ),
  alarms: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 11 V8 a5 5 0 0 1 10 0 v3 l1 1 H2 Z"/>
      <path d="M6 13.5 a2 2 0 0 0 4 0"/>
    </svg>
  ),
  teams: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="6" cy="6" r="2"/>
      <circle cx="11" cy="7" r="1.5"/>
      <path d="M2 13 c0-2 2-3 4-3 s4 1 4 3"/>
      <path d="M11 13 c0-1.4 1-2 2.5-2"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="2"/>
      <path d="M8 1 v2 M8 13 v2 M1 8 h2 M13 8 h2 M3 3 l1.5 1.5 M11.5 11.5 L13 13 M3 13 l1.5 -1.5 M11.5 4.5 L13 3"/>
    </svg>
  ),
};

// Sub-componentă pentru un item din sidebar
function SidebarItem({ id, label, icon, count, alarm, isActive, onClick }) {
  return (
    <div
      className={`sidebar-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="si-icon">{icon}</span>
      <span>{label}</span>
      {count != null && (
        <span className={`si-count ${alarm ? 'alarm' : ''}`}>{count}</span>
      )}
    </div>
  );
}

export function Sidebar({ counts, currentPage, onNav }) {
  // Items pentru secțiunea "Operations"
  const operationsItems = [
    { id: 'dash', label: 'Dashboard', icon: icons.dashboard },
    { id: 'inc', label: 'Incidents', icon: icons.incidents, count: counts.open, alarm: counts.crit > 0 },
    { id: 'srv', label: 'Servers', icon: icons.servers, count: counts.servers },
    { id: 'alm', label: 'Alarms', icon: icons.alarms, count: counts.alarms },
  ];
  
  // Items pentru secțiunea "Workspace"
  const workspaceItems = [
    { id: 'team', label: 'Teams', icon: icons.teams },
    { id: 'set', label: 'Settings', icon: icons.settings },
  ];
  
  return (
    <aside className="sidebar">
      <div className="sidebar-section">Operations</div>
      {operationsItems.map(item => (
        <SidebarItem
          key={item.id}
          {...item}
          isActive={currentPage === item.id}
          onClick={() => onNav(item.id)}
        />
      ))}
      
      <div className="sidebar-section">Workspace</div>
      {workspaceItems.map(item => (
        <SidebarItem
          key={item.id}
          {...item}
          isActive={currentPage === item.id}
          onClick={() => onNav(item.id)}
        />
      ))}
      
      <div className="sidebar-footer">
        <div className="build"><span>build</span><span>v1.0.0</span></div>
        <div className="build"><span>region</span><span>eu-west-1</span></div>
      </div>
    </aside>
  );
}