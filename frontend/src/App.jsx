import { useEffect, useState } from 'react';
import { Header } from './components/Header.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { Heatmap } from './components/Heatmap.jsx';
import { IncidentsList } from './components/IncidentsList.jsx';
import { AlarmRail } from './components/AlarmRail.jsx';
import { IncidentPanel } from './components/IncidentPanel.jsx';
import { TeamsPage } from './components/TeamsPage.jsx';
import { useApiData } from './hooks/useApiData.js';
import { fetchAlarms, fetchIncidents, fetchInfrastructureHealth } from './services/api.js';
import { useAuth } from './context/AuthContext.jsx';

const PATH_TO_PAGE = {
  '/': 'dash',
  '/incidents': 'inc',
  '/servers': 'srv',
  '/alarms': 'alm',
  '/teams': 'team',
  '/settings': 'set',
};

const PAGE_TO_PATH = {
  dash: '/',
  inc: '/incidents',
  srv: '/servers',
  alm: '/alarms',
  team: '/teams',
  set: '/settings',
};

export function App() {
  const { currentUser } = useAuth();
  const [page, setPage] = useState('dash');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [showAlarms, setShowAlarms] = useState(false);

  useEffect(() => {
    const syncRoute = () => {
      const nextPage = PATH_TO_PAGE[window.location.pathname] || 'dash';
      setPage(nextPage);
    };
    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  useEffect(() => {
    setSelectedIncident(null);
    setShowAlarms(false);
  }, [currentUser?.id]);
  
  // Preluăm datele reale din API pentru contoarele din Sidebar/Header
  const { data: alarms } = useApiData(() => fetchAlarms(), { refreshMs: 5000 });
  const { data: incidents } = useApiData(() => fetchIncidents(), {
    refreshMs: 5000,
    enabled: !!currentUser,
    deps: [currentUser?.id],
  });
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
      setShowAlarms((prev) => !prev);
      if (selectedIncident) setSelectedIncident(null);
      if (page !== 'dash') {
        if (window.location.pathname !== '/') {
          window.history.pushState({}, '', '/');
        }
        setPage('dash');
      }
    } else {
      setShowAlarms(false);
      if (selectedIncident) setSelectedIncident(null);
      const path = PAGE_TO_PATH[newPage] || '/';
      if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
      }
      setPage(newPage);
    }
  };

  const handleIncidentSelect = (incident) => {
    setSelectedIncident(incident);
    if (showAlarms) setShowAlarms(false); // Close alarms if opening incident
  };

  const handleIncidentUpdate = (updatedIncident) => {
    setSelectedIncident((prev) => {
      if (!prev || prev.id !== updatedIncident?.id) return prev;
      return { ...prev, ...updatedIncident };
    });
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
                    onUpdate={handleIncidentUpdate}
                  />
                ) : (
                  <AlarmRail onClose={() => setShowAlarms(false)} />
                )}
              </div>
            )}
          </main>
        )}
        
        {page === 'team' && (
          <main className="main full">
            <TeamsPage />
          </main>
        )}

        {page !== 'dash' && page !== 'team' && (
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