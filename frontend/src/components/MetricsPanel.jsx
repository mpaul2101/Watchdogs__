import { useEffect, useState } from "react";
import { getMetrics } from "../services/api";

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

  if (loading) {
    return (
      <div>
        <h2>Metrics</h2>
        <p>Loading metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h2>Metrics</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Metrics</h2>

      {metrics.length === 0 ? (
        <p>No metrics found</p>
      ) : (
        <ul>
          {metrics.map((metric) => (
            <li key={metric.id}>
              <strong>Server:</strong> {metric.server_id} |{" "}
              <strong>CPU:</strong> {metric.cpu} |{" "}
              <strong>RAM:</strong> {metric.ram ?? "N/A"} |{" "}
              <strong>Time:</strong> {new Date(metric.timestamp).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MetricsPanel;