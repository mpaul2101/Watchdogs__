import { useEffect, useState } from "react";
import { getMetrics } from "../services/api";
import MetricCard from "./MetricCard";

function MetricsPanel() {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMetrics() {
      try {
        const data = await getMetrics();
        setMetrics(data);
      } catch (err) {
        setError("Could not load metrics");
      } finally {
        setLoading(false);
      }
    }

    loadMetrics();
  }, []);

  return (
    <div className="panel">
      <h2 className="panel-title">System Metrics</h2>

      {loading && <p className="empty-text">Loading metrics...</p>}
      {error && <p className="empty-text">{error}</p>}

      {!loading && !error && (
        <>
          {metrics.length === 0 ? (
            <p className="empty-text">No metrics found</p>
          ) : (
            <div className="metrics-grid">
              {metrics.map((metric) => (
                <MetricCard key={metric.id} metric={metric} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MetricsPanel;