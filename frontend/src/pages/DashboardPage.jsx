import Header from "../components/Header";
import MetricsPanel from "../components/MetricsPanel";
import AlertsPanel from "../components/AlertsPanel";

function DashboardPage() {
  return (
    <div className="app-shell">
      <Header />
      <MetricsPanel />
      <AlertsPanel />
    </div>
  );
}

export default DashboardPage;