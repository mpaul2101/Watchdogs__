function MetricCard({ metric }) {
  return (
    <div className="metric-card">
      <div className="metric-card-header">
        <div className="metric-server">{metric.server_id}</div>
        <div className="metric-live">LIVE</div>
      </div>

      <div className="metric-line">
        <span className="metric-label">CPU:</span>
        {metric.cpu}
      </div>

      <div className="metric-line">
        <span className="metric-label">RAM:</span>
        {metric.ram ?? "N/A"}
      </div>

      <div className="metric-line">
        <span className="metric-label">Time:</span>
        {new Date(metric.timestamp).toLocaleString()}
      </div>
    </div>
  );
}

export default MetricCard;