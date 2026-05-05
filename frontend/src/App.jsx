import { useState } from 'react';
import { Header } from './components/Header.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { Heatmap } from './components/Heatmap.jsx';
import { IncidentsList } from './components/IncidentsList.jsx';
import { AlarmRail } from './components/AlarmRail.jsx';
import { IncidentPanel } from './components/IncidentPanel.jsx';
import { useApiData } from './hooks/useApiData.js';
import { fetchAlarms, fetchIncidents, fetchInfrastructureHealth } from './services/api.js';

export function App() {
  const [page, setPage] = useState('dash');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [showAlarms, setShowAlarms] = useState(false);
  
  // Preluăm datele reale din API pentru contoarele din Sidebar/Header
  const { data: alarms } = useApiData(() => fetchAlarms(), { refreshMs: 5000 });
  const { data: incidents } = useApiData(() => fetchIncidents(), { refreshMs: 5000 });
  const { data: health } = useApiData(() => fetchInfrastructureHealth(), { refreshMs: 5000 });
  
  const counts = {
    open: incidents?.filter(i => i.status === 'OPEN').length || 0,
    crit: incidents?.filter(i => i.severity === 'CRITIC').length || 0,
    servers: health?.length || 0,
    alarms: alarms?.length || 0,
  };
  
  const globalState = counts.crit > 0 ? 'err' : counts.open > 3 ? 'warn' : 'ok';
  
  const handleNav = (newPage) => {
    if (newPage === 'alm') {
      setShowAlarms(!showAlarms);
      if (selectedIncident) setSelectedIncident(null); // Close incident if opening alarms
    } else {
      setPage(newPage);
    }
  };

  const handleIncidentSelect = (incident) => {
    setSelectedIncident(incident);
    if (showAlarms) setShowAlarms(false); // Close alarms if opening incident
  };
  
  return (
    <div className="app">
      <Header
        globalState={globalState}
        openCount={counts.open}
        critCount={counts.crit}
      />
      <div className="body">
        <Sidebar
          counts={counts}
          currentPage={page}
          onNav={handleNav}
        />
        
        {page === 'dash' && (
          <main className={`main ${selectedIncident || showAlarms ? 'has-panel' : ''}`}>
            <div className="main-left">
              <Heatmap />
              <IncidentsList onIncidentSelect={handleIncidentSelect} selectedIncidentId={selectedIncident?.id} />
            </div>
            
            {(selectedIncident || showAlarms) && (
              <div className="main-right slide-in">
                {selectedIncident ? (
                  <IncidentPanel 
                    incident={selectedIncident} 
                    onClose={() => setSelectedIncident(null)} 
                  />
                ) : (
                  <AlarmRail onClose={() => setShowAlarms(false)} />
                )}
              </div>
            )}
          </main>
        )}
        
        {page !== 'dash' && (
          <main className="main full">
            <div style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '14px', marginBottom: '8px' }}>
                Page: {page}
              </h2>
              <p style={{ color: 'var(--fg-3)', fontSize: '11px' }}>
                În construcție. Pentru moment, doar dashboard-ul afișează.
              </p>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}