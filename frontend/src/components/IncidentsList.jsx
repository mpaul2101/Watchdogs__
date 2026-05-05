import { useState } from 'react';
import { useApiData } from '../hooks/useApiData.js';
import { fetchIncidents } from '../services/api.js';
import { IncidentCard } from './IncidentCard.jsx';
import { IncidentsFilters } from './IncidentsFilters.jsx';
import { ReassignModal } from './ReassignModal.jsx';

export function IncidentsList({ onIncidentSelect, selectedIncidentId }) {
  const [filters, setFilters] = useState({
    severity: null,
    status: null,
    team: null,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [reassigningIncident, setReassigningIncident] = useState(null);
  
  const { data: incidents, loading, error, refresh } = useApiData(
    () => fetchIncidents(filters),
    { 
      refreshMs: 5000,
      deps: [filters.severity, filters.status, filters.team]
    }
  );
  
  const filteredIncidents = incidents?.filter(inc => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      inc.title?.toLowerCase().includes(q) ||
      String(inc.id).includes(q) ||
      inc.server_id?.toLowerCase().includes(q)
    );
  }) || [];
  
  if (loading && !incidents) {
    return (
      <div className="panel incidents">
        <div className="panel-header">
          <span className="ph-title">Active Incidents</span>
        </div>
        <div className="empty">loading...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="panel incidents">
        <div className="panel-header">
          <span className="ph-title">Active Incidents</span>
        </div>
        <div className="empty" style={{ color: 'var(--sev-critical)' }}>
          ⚠ failed to load
        </div>
      </div>
    );
  }
  
  const allCount = incidents?.length || 0;
  const criticalCount = incidents?.filter(i => i.severity === 'CRITIC').length || 0;
  const highCount = incidents?.filter(i => i.severity === 'HIGH').length || 0;
  const openCount = incidents?.filter(i => i.status === 'OPEN').length || 0;
  
  return (
    <>
      <div className="panel incidents">
        <div className="panel-header">
          <span className="ph-title">Active Incidents · {allCount}</span>
          <span className="ph-meta">
            <span style={{ color: 'var(--sev-critical)' }}>● {criticalCount} critical</span>
            <span style={{ color: 'var(--sev-high)' }}>● {highCount} high</span>
            <span>{openCount} open</span>
          </span>
        </div>
        
        <IncidentsFilters
          filters={filters}
          setFilters={setFilters}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          totalShown={filteredIncidents.length}
          totalAll={allCount}
        />
        
        <div className="panel-body">
          {filteredIncidents.length === 0 ? (
            <div className="empty">
              no incidents match filters<br />
              <span style={{ opacity: 0.6 }}>// the watchdogs are sleeping_</span>
            </div>
          ) : (
            <div className="incidents-list">
              {filteredIncidents.map(incident => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  isSelected={incident.id === selectedIncidentId}
                  onClick={() => onIncidentSelect && onIncidentSelect(incident)}
                  onReassign={setReassigningIncident}
                  onUpdate={refresh}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      
      {reassigningIncident && (
        <ReassignModal
          incident={reassigningIncident}
          onClose={() => setReassigningIncident(null)}
          onSuccess={refresh}
        />
      )}
    </>
  );
}