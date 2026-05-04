import { useState } from 'react';
import { Header } from './components/Header.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { Heatmap } from './components/Heatmap.jsx';
import { IncidentsList } from './components/IncidentsList.jsx';
import { AlarmRail } from './components/AlarmRail.jsx';
export function App() {
  const [page, setPage] = useState('dash');
  
  // TODO: înlocui cu date reale din API
  const counts = {
    open: 0,
    crit: 0,
    servers: 30,
    alarms: 0,
  };
  
  const globalState = counts.crit > 0 ? 'err' : counts.open > 3 ? 'warn' : 'ok';
  
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
          onNav={setPage}
        />
        
       {page === 'dash' && (
  <main className="main">
    <Heatmap />
    <IncidentsList />
    <AlarmRail />
    <div className="panel">
      <div className="panel-header">
        <span className="ph-title">Alarm Stream</span>
      </div>

           </div>
            <div className="panel">
              <div className="panel-header">
                <span className="ph-title">Alarm Stream</span>
              </div>
            </div>
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