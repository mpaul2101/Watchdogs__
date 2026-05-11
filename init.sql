-- ============================================================
-- Watchdogs DB schema
-- Tabele: metrics (date brute), alarms (zgomot automat),
--         incidents (tickete pentru oameni)
-- ============================================================

-- 1. Metrici brute trimise de agenti (CPU, RAM, Disk, App/DB)
CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    server_id VARCHAR(50) NOT NULL,
    cpu NUMERIC,
    ram NUMERIC,
    disk NUMERIC,
    response_time_ms NUMERIC,
    http_5xx_rate NUMERIC,
    db_conn_pct NUMERIC,
    auth_failures INT,
    traffic_users INT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Coloane noi pentru DB-uri existente (idempotent)
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS disk NUMERIC;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS response_time_ms NUMERIC;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS http_5xx_rate NUMERIC;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS db_conn_pct NUMERIC;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS auth_failures INT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS traffic_users INT;

-- Index pentru interogarile cu fereastra temporala (server_id + interval timp)
CREATE INDEX IF NOT EXISTS idx_metrics_server_time
    ON metrics (server_id, timestamp DESC);


-- 2. Users (RBAC)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    team_name VARCHAR(50) NOT NULL,
    role VARCHAR(50) NOT NULL,
    on_call_status BOOLEAN NOT NULL DEFAULT FALSE
);

-- Coloane noi pentru DB-uri existente (idempotent)
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS team_name VARCHAR(50);
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS role VARCHAR(50);
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS on_call_status BOOLEAN DEFAULT FALSE;

-- Seed data pentru demo impersonation
INSERT INTO users (name, email, team_name, role, on_call_status)
VALUES
    ('Elena', 'elena@watchdogs.local', 'Executive', 'CEO', FALSE),
    ('Maria', 'maria@watchdogs.local', 'Infrastructure', 'System Manager', TRUE),
    ('Paul',  'paul@watchdogs.local', 'Infrastructure', 'Engineer', FALSE)
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    team_name = EXCLUDED.team_name,
    role = EXCLUDED.role,
    on_call_status = EXCLUDED.on_call_status;


-- 3. Alarme = zgomot automat declansat de motor (un eveniment per detectie)
CREATE TABLE IF NOT EXISTS alarms (
    id SERIAL PRIMARY KEY,
    server_id VARCHAR(50) NOT NULL,
    metric_type VARCHAR(20),     -- ex: 'CPU', 'RAM', 'DISK', 'RESPONSE_TIME', 'HTTP_5XX'
    severity VARCHAR(20),        -- 'CRITIC', 'HIGH', 'MEDIUM', 'LOW'
    message TEXT,
    assigned_person INT,          -- FK catre users.id
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    incident_id INT              -- FK catre incidents.id
);

ALTER TABLE alarms ADD COLUMN IF NOT EXISTS severity VARCHAR(20);
ALTER TABLE alarms ADD COLUMN IF NOT EXISTS assigned_person INT;

CREATE INDEX IF NOT EXISTS idx_alarms_incident ON alarms (incident_id);
CREATE INDEX IF NOT EXISTS idx_alarms_assigned_person ON alarms (assigned_person);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'alarms_assigned_person_fkey'
    ) THEN
        ALTER TABLE alarms
        ADD CONSTRAINT alarms_assigned_person_fkey
        FOREIGN KEY (assigned_person)
        REFERENCES users(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Probleme = tipare recurente detectate din alarme/incidente repetate
CREATE TABLE IF NOT EXISTS problems (
    id SERIAL PRIMARY KEY,
    server_id TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    occurrence_count INT NOT NULL DEFAULT 0,
    first_seen TIMESTAMP NOT NULL,
    last_seen TIMESTAMP NOT NULL,
    probable_cause TEXT,
    suggested_fix TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_problem_per_server_metric UNIQUE (server_id, metric_type)
);

<<<<<<< Updated upstream
=======
CREATE UNIQUE INDEX IF NOT EXISTS idx_problems_unique_server_metric
ON problems (server_id, metric_type);

--problems tine rezumatul, iar aici tinem fiecare moment cand problema reapare.
CREATE TABLE IF NOT EXISTS problem_occurrences (
    id SERIAL PRIMARY KEY,
    problem_id INT REFERENCES problems(id) ON DELETE CASCADE,
    occurred_at TIMESTAMP NOT NULL,
    value NUMERIC NOT NULL,
    threshold NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_problem_occurrences_unique --evitam duplicatele
ON problem_occurrences (problem_id, occurred_at);

CREATE OR REPLACE FUNCTION get_problem_timeline(input_problem_id INT)
RETURNS TABLE (
    occurred_at TIMESTAMP,
    value NUMERIC,
    threshold NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        po.occurred_at,
        po.value,
        po.threshold
    FROM problem_occurrences po
    WHERE po.problem_id = input_problem_id
    ORDER BY po.occurred_at;
END;
$$ LANGUAGE plpgsql;

-- Detecteaza probleme recurente din metrics, 
-- O aparitie se numara doar cand metrica trece de sub prag peste prag.
CREATE OR REPLACE FUNCTION escalate_recurring_incidents()
RETURNS VOID AS $$
BEGIN
    --Creeaza sau actualizeaza problemele recurente in tabela problems
    INSERT INTO problems (
        server_id,
        metric_type,
        title,
        description,
        severity,
        status,
        occurrence_count,
        first_seen,
        last_seen,
        probable_cause,
        suggested_fix,
        updated_at
    )
    SELECT
        recurring.server_id,
        recurring.metric_type,
        'Recurring high ' || UPPER(recurring.metric_type) || ' usage' AS title,
        'The server ' || recurring.server_id || ' repeatedly crossed the ' || recurring.metric_type || ' threshold in the last 24 hours.' AS description,
        recurring.severity,
        'open' AS status,
        recurring.occurrence_count,
        recurring.first_seen,
        recurring.last_seen,
        recurring.probable_cause,
        recurring.suggested_fix,
        CURRENT_TIMESTAMP
    FROM (
        SELECT
            server_id,
            metric_type,
            COUNT(*) AS occurrence_count,
            MIN(timestamp) AS first_seen,
            MAX(timestamp) AS last_seen,
            CASE
                WHEN metric_type = 'cpu' AND MAX(value) >= 95 THEN 'critical'
                WHEN metric_type = 'ram' AND MAX(value) >= 95 THEN 'critical'
                WHEN metric_type = 'disk' AND MAX(value) >= 95 THEN 'critical'
                WHEN metric_type = 'response_time' AND MAX(value) >= 320 THEN 'critical'
                ELSE 'high'
            END AS severity,
            CASE
                WHEN metric_type = 'cpu' THEN 'CPU saturation caused by repeated workload spikes.'
                WHEN metric_type = 'ram' THEN 'Possible memory leak or recurring memory pressure.'
                WHEN metric_type = 'disk' THEN 'Recurring storage pressure or disk usage growth.'
                WHEN metric_type = 'response_time' THEN 'Recurring backend latency or overloaded service.'
                ELSE 'Recurring infrastructure issue.'
            END AS probable_cause,
            CASE
                WHEN metric_type = 'cpu' THEN 'Investigate recurring CPU-heavy processes or scheduled jobs.'
                WHEN metric_type = 'ram' THEN 'Check if memory usage drops after recovery and rises again later.'
                WHEN metric_type = 'disk' THEN 'Check logs, temporary files, and repeated storage growth.'
                WHEN metric_type = 'response_time' THEN 'Check recurring latency patterns, database queries, and dependencies.'
                ELSE 'Investigate repeated infrastructure events.'
            END AS suggested_fix
        FROM (
            SELECT
                server_id,
                metric_type,
                value,
                threshold,
                timestamp,
                is_breach,
                LAG(is_breach) OVER (
                    PARTITION BY server_id, metric_type
                    ORDER BY timestamp
                ) AS previous_is_breach
            FROM (
                SELECT
                    server_id,
                    'cpu' AS metric_type,
                    cpu AS value,
                    90::NUMERIC AS threshold,
                    timestamp,
                    cpu > 90 AS is_breach
                FROM metrics
                WHERE timestamp >= NOW() - INTERVAL '24 hours'

                UNION ALL

                SELECT
                    server_id,
                    'ram' AS metric_type,
                    ram AS value,
                    90::NUMERIC AS threshold,
                    timestamp,
                    ram > 90 AS is_breach
                FROM metrics
                WHERE timestamp >= NOW() - INTERVAL '24 hours'

                UNION ALL

                SELECT
                    server_id,
                    'disk' AS metric_type,
                    disk AS value,
                    85::NUMERIC AS threshold,
                    timestamp,
                    disk > 85 AS is_breach
                FROM metrics
                WHERE timestamp >= NOW() - INTERVAL '24 hours'

                UNION ALL

                SELECT
                    server_id,
                    'response_time' AS metric_type,
                    response_time_ms AS value,
                    250::NUMERIC AS threshold,
                    timestamp,
                    response_time_ms > 250 AS is_breach
                FROM metrics
                WHERE timestamp >= NOW() - INTERVAL '24 hours'
            ) normalized_metrics
        ) marked_metrics
        WHERE is_breach = TRUE
          AND COALESCE(previous_is_breach, FALSE) = FALSE
        GROUP BY server_id, metric_type
        HAVING COUNT(*) >= 2
    ) recurring
    ON CONFLICT (server_id, metric_type)
    DO UPDATE SET
        occurrence_count = EXCLUDED.occurrence_count,
        first_seen = EXCLUDED.first_seen,
        last_seen = EXCLUDED.last_seen,
        severity = EXCLUDED.severity,
        description = EXCLUDED.description,
        probable_cause = EXCLUDED.probable_cause,
        suggested_fix = EXCLUDED.suggested_fix,
        updated_at = CURRENT_TIMESTAMP;


    --Salveaza fiecare aparitie concreta in problem_occurrences
    INSERT INTO problem_occurrences (
        problem_id,
        occurred_at,
        value,
        threshold
    )
    SELECT
        p.id AS problem_id,
        detected.timestamp AS occurred_at,
        detected.value,
        detected.threshold
    FROM problems p
    JOIN (
        SELECT
            server_id,
            metric_type,
            value,
            threshold,
            timestamp,
            is_breach,
            --LAG ne spune daca la masuratoarea anterioara eram deja peste prag
            LAG(is_breach) OVER (
                PARTITION BY server_id, metric_type
                ORDER BY timestamp
            ) AS previous_is_breach
        FROM (
            SELECT
                server_id,
                'cpu' AS metric_type,
                cpu AS value,
                90::NUMERIC AS threshold,
                timestamp,
                cpu > 90 AS is_breach
            FROM metrics
            WHERE timestamp >= NOW() - INTERVAL '24 hours'

            UNION ALL

            SELECT
                server_id,
                'ram' AS metric_type,
                ram AS value,
                90::NUMERIC AS threshold,
                timestamp,
                ram > 90 AS is_breach
            FROM metrics
            WHERE timestamp >= NOW() - INTERVAL '24 hours'

            UNION ALL

            SELECT
                server_id,
                'disk' AS metric_type,
                disk AS value,
                85::NUMERIC AS threshold,
                timestamp,
                disk > 85 AS is_breach
            FROM metrics
            WHERE timestamp >= NOW() - INTERVAL '24 hours'

            UNION ALL

            SELECT
                server_id,
                'response_time' AS metric_type,
                response_time_ms AS value,
                250::NUMERIC AS threshold,
                timestamp,
                response_time_ms > 250 AS is_breach
            FROM metrics
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
        ) normalized_metrics
    ) detected
      ON p.server_id = detected.server_id
     AND p.metric_type = detected.metric_type
    WHERE detected.is_breach = TRUE
      AND COALESCE(detected.previous_is_breach, FALSE) = FALSE
    ON CONFLICT (problem_id, occurred_at) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

>>>>>>> Stashed changes
-- 4. Incidente = tickete pentru oameni (deduplicate per server+metrica)
CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    server_id VARCHAR(50),       -- adaugat pentru deduplicare
    metric_type VARCHAR(20),     -- adaugat pentru deduplicare
    title VARCHAR(200),
    severity VARCHAR(20),        -- 'CRITIC', 'HIGH', 'MEDIUM', 'LOW'
    status VARCHAR(20) DEFAULT 'OPEN',
    assigned_team VARCHAR(50),   -- echipa responsabila (ex: 'Infrastructure')
    assigned_person INT,         -- FK catre users.id
    assigned_to VARCHAR(50),     -- inginer specific in cadrul echipei (optional)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS server_id VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS metric_type VARCHAR(20);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_team VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_person INT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Cautare rapida pentru deduplicare: "exista deja un OPEN pentru asta?"
CREATE INDEX IF NOT EXISTS idx_incidents_open_lookup
    ON incidents (server_id, metric_type, status);

CREATE INDEX IF NOT EXISTS idx_incidents_assigned_person
    ON incidents (assigned_person);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'incidents_assigned_person_fkey'
    ) THEN
        ALTER TABLE incidents
        ADD CONSTRAINT incidents_assigned_person_fkey
        FOREIGN KEY (assigned_person)
        REFERENCES users(id)
        ON DELETE SET NULL;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION get_infrastructure_health()
RETURNS TABLE (
    server_id VARCHAR,
    health_status VARCHAR,
    avg_cpu NUMERIC,
    avg_ram NUMERIC,
    avg_disk NUMERIC,
    max_cpu NUMERIC,
    max_ram NUMERIC,
    open_incidents BIGINT,
    last_seen TIMESTAMP

)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.server_id::VARCHAR,
        CASE
            WHEN MAX(m.cpu) > 90 OR MAX(m.ram) > 90 OR MAX(m.disk) > 90 
                THEN 'CRITIC'::VARCHAR
            WHEN AVG(m.cpu) > 70 OR AVG(m.ram) > 70 OR AVG(m.disk) > 70 
                THEN 'WARNING'::VARCHAR
            ELSE 'OK'::VARCHAR
        END AS health_status,
        ROUND(AVG(m.cpu), 1) AS avg_cpu,
        ROUND(AVG(m.ram), 1) AS avg_ram,
        ROUND(AVG(m.disk), 1) AS avg_disk,
        ROUND(MAX(m.cpu), 1) AS max_cpu,
        ROUND(MAX(m.ram), 1) AS max_ram,
        (
            SELECT COUNT(*)
            FROM incidents i
            WHERE i.server_id = m.server_id AND i.status = 'OPEN'
        ) AS open_incidents,
        MAX(m.timestamp) AS last_seen
    FROM metrics m
    WHERE m.timestamp >= LOCALTIMESTAMP - INTERVAL '5 minutes'
    GROUP BY m.server_id
    ORDER BY 
        CASE
            WHEN MAX(m.cpu) > 90 OR MAX(m.ram) > 90 THEN 1
            WHEN AVG(m.cpu) > 70 OR AVG(m.ram) > 70 THEN 2
            ELSE 3
        END,
        m.server_id;
END;
$$;