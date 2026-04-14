import MetricsPanel from "../components/MetricsPanel";
import AlertsPanel from "../components/AlertsPanel";

function DashboardPage() {
  return (
    <div>
      <h1>Monitoring Dashboard</h1>
      <MetricsPanel />
      <AlertsPanel />
    </div>
  );
}

export default DashboardPage;