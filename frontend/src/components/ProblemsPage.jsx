import { useEffect, useMemo, useState } from 'react';
import { useApiData } from '../hooks/useApiData.js';
import { fetchProblems, fetchProblemTimeline } from '../services/api.js';

function formatDate(value) {
  if (!value) return 'n/a';

  return new Date(value).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function severityClass(severity) {
  return `sev-${String(severity || 'low').toLowerCase()}`;
}

function ProblemCard({ problem, selected, onClick }) {
  return (
    <button
      className={`problem-card ${selected ? 'selected' : ''}`}
      onClick={() => onClick(problem)}
    >
      <div className="problem-card-top">
        <span className={`severity-dot ${severityClass(problem.severity)}`} />
        <span className="problem-title">{problem.title}</span>
        <span className={`problem-severity ${severityClass(problem.severity)}`}>
          {problem.severity}
        </span>
      </div>

      <div className="problem-meta">
        <span>{problem.server_id}</span>
        <span>{problem.metric_type}</span>
        <span>{problem.status}</span>
      </div>

      <div className="problem-card-bottom">
        <span>{problem.occurrence_count} occurrences</span>
        <span>last: {formatDate(problem.last_seen)}</span>
      </div>
    </button>
  );
}

function Timeline({ timeline }) {
  if (!timeline?.length) {
    return (
      <div className="timeline-empty">
        no timeline entries yet
      </div>
    );
  }

  return (
    <div className="timeline-list">
      {timeline.map((item, index) => (
        <div className="timeline-item" key={`${item.occurred_at}-${index}`}>
          <div className="timeline-marker" />
          <div className="timeline-content">
            <div className="timeline-time">{formatDate(item.occurred_at)}</div>
            <div className="timeline-values">
              value <strong>{item.value}</strong> / threshold <strong>{item.threshold}</strong>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProblemDetails({ problem }) {
  const {
    data,
    loading,
    error,
  } = useApiData(
    () => fetchProblemTimeline(problem?.id),
    {
      refreshMs: 5000,
      enabled: Boolean(problem?.id),
      deps: [problem?.id],
    }
  );

const timeline = data || [];

  if (!problem) {
    return (
      <aside className="problem-detail-panel">
        <div className="empty-detail">
          <div className="empty-detail-title">Select a problem</div>
          <div className="empty-detail-text">
            Click a problem from the list to inspect its root cause and timeline.
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="problem-detail-panel">
      <div className="detail-header">
        <div>
          <div className="detail-kicker">Problem details</div>
          <h2>{problem.title}</h2>
        </div>
        <span className={`problem-severity ${severityClass(problem.severity)}`}>
          {problem.severity}
        </span>
      </div>

      <div className="detail-grid">
        <div>
          <span>server</span>
          <strong>{problem.server_id}</strong>
        </div>
        <div>
          <span>metric</span>
          <strong>{problem.metric_type}</strong>
        </div>
        <div>
          <span>status</span>
          <strong>{problem.status}</strong>
        </div>
        <div>
          <span>occurrences</span>
          <strong>{problem.occurrence_count}</strong>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-label">window</div>
        <p>
          first seen: <strong>{formatDate(problem.first_seen)}</strong>
          <br />
          last seen: <strong>{formatDate(problem.last_seen)}</strong>
        </p>
      </div>

      <div className="detail-section">
        <div className="detail-label">probable cause</div>
        <p>{problem.probable_cause || 'No probable cause available.'}</p>
      </div>

      <div className="detail-section">
        <div className="detail-label">suggested fix</div>
        <p>{problem.suggested_fix || 'No suggested fix available.'}</p>
      </div>

      <div className="detail-section">
        <div className="detail-label">timeline</div>
        {loading && <div className="timeline-empty">loading timeline...</div>}
        {error && <div className="timeline-empty">failed to load timeline</div>}
        {!loading && !error && <Timeline timeline={timeline} />}
      </div>
    </aside>
  );
}

export function ProblemsPage() {
  const [selectedProblemId, setSelectedProblemId] = useState(null);

  const {
    data,
    loading,
    error,
  } = useApiData(() => fetchProblems(), { refreshMs: 5000 });

const problems = data || [];

  useEffect(() => {
    if (!selectedProblemId && problems.length > 0) {
      setSelectedProblemId(problems[0].id);
    }
  }, [problems, selectedProblemId]);

  const selectedProblem = useMemo(
    () => problems.find((problem) => problem.id === selectedProblemId) || null,
    [problems, selectedProblemId]
  );

  return (
    <div className="problems-page">
      <section className="problems-list-panel">
        <div className="problems-toolbar">
          <div>
            <div className="page-kicker">Problems</div>
            <h1>Recurring infrastructure problems</h1>
          </div>
          <div className="problems-count">{problems.length} active</div>
        </div>

        {loading && <div className="problems-state">loading problems...</div>}
        {error && <div className="problems-state error">failed to load problems</div>}

        {!loading && !error && problems.length === 0 && (
          <div className="problems-state">no recurring problems detected</div>
        )}

        <div className="problems-list">
          {problems.map((problem) => (
            <ProblemCard
              key={problem.id}
              problem={problem}
              selected={problem.id === selectedProblemId}
              onClick={(item) => setSelectedProblemId(item.id)}
            />
          ))}
        </div>
      </section>

      <ProblemDetails problem={selectedProblem} />
    </div>
  );
}