import { useState } from 'react';
import { useApiData } from '../hooks/useApiData.js';
import { fetchNotificationLog } from '../services/api.js';
import { timeAgo, formatDateTime } from '../utils/formatters.js';

export function NotificationsList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [listFilter, setListFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  // Poll for latest notifications every 5s
  const { data: logsData, loading, error, refresh } = useApiData(
    () => fetchNotificationLog({ limit: 100 }), 
    { refreshMs: 5000 }
  );
  const logs = logsData || [];

  const filteredLogs = logs.filter(log => {
    // text search matches user name or incident ID
    const searchLower = searchTerm.toLowerCase();
    const matchSearch = 
      (log.user_name && log.user_name.toLowerCase().includes(searchLower)) ||
      (log.incident_id && String(log.incident_id).includes(searchLower)) ||
      (log.rendered_subject && log.rendered_subject.toLowerCase().includes(searchLower));

    // list type filter
    const matchList = listFilter === 'all' || log.list_name === listFilter;

    return matchSearch && matchList;
  });

  const getListColor = (listName) => {
    switch(listName) {
      case 'red': return 'var(--sev-critical)';
      case 'yellow': return 'var(--sev-high)';
      case 'green': return 'var(--sev-medium)';
      case 'on_call_team': return 'var(--accent)';
      case 'team_manager': return 'var(--fg-2)';
      default: return 'var(--fg-3)';
    }
  };

  const getListLabel = (listName) => {
    switch(listName) {
      case 'red': return 'RED LIST';
      case 'yellow': return 'YELLOW LIST';
      case 'green': return 'GREEN LIST';
      case 'on_call_team': return 'ON-CALL';
      case 'team_manager': return 'MANAGER';
      default: return listName.toUpperCase();
    }
  };

  return (
    <div className="notifications-list-container">
      <div className="nl-header">
        <h3>Notification History</h3>
        
        <div className="nl-filters">
          <input
            type="text"
            className="nl-search-input"
            placeholder="Search name, subject, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select 
            className="nl-filter-select"
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
          >
            <option value="all">All Lists</option>
            <option value="red">Red List</option>
            <option value="yellow">Yellow List</option>
            <option value="green">Green List</option>
            <option value="on_call_team">On-Call Team</option>
            <option value="team_manager">Manager</option>
          </select>
          <button className="nl-refresh-btn" onClick={refresh} title="Refresh manually">
            ↻
          </button>
        </div>
      </div>

      <div className="nl-body">
        {loading && logs.length === 0 && <p className="loading-state">Loading history...</p>}
        {error && <p className="error-state">Error: {error}</p>}
        {!loading && logs.length > 0 && filteredLogs.length === 0 && (
          <p className="no-data-state">No notifications match your filters.</p>
        )}

        <div className="nl-items">
          {filteredLogs.map(log => {
            const isExpanded = expandedId === log.id;
            
            return (
              <div 
                key={log.id} 
                className={`nl-card ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : log.id)}
              >
                <div className="nl-card-stripe" style={{ backgroundColor: getListColor(log.list_name) }} />
                
                <div className="nl-card-main">
                  <div className="nl-card-top">
                    <span className="nl-time" title={formatDateTime(log.sent_at)}>{timeAgo(log.sent_at)}</span>
                    <span className="nl-user">{log.user_name} ({log.user_role})</span>
                    <span className="nl-list-badge" style={{ borderColor: getListColor(log.list_name), color: getListColor(log.list_name) }}>
                      {getListLabel(log.list_name)}
                    </span>
                  </div>
                  
                  <div className="nl-card-subject">
                    <strong>#{log.incident_id}</strong> · {log.rendered_subject}
                  </div>
                  
                  {isExpanded && (
                    <div className="nl-card-details">
                      <div className="nl-details-meta">
                        <p><strong>Sent at:</strong> {formatDateTime(log.sent_at)}</p>
                        <p><strong>Method:</strong> {log.delivery_method}</p>
                        <p><strong>Status:</strong> {log.delivery_status}</p>
                      </div>
                      <div className="nl-details-body">
                        {log.rendered_body.split('\n').map((line, i) => (
                          <span key={i}>{line}<br/></span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
