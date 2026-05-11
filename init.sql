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
    ('Paul',  'paul@watchdogs.local', 'Infrastructure', 'Engineer', FALSE),
    ('Alex',  'alex@watchdogs.local', 'NOC', 'Incident Manager', FALSE)
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


-- 4. Incidente = tickete pentru oameni (deduplicate per server+metrica)
CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    server_id VARCHAR(50),       -- adaugat pentru deduplicare
    metric_type VARCHAR(20),     -- adaugat pentru deduplicare
    title VARCHAR(200),
    severity VARCHAR(20),        -- 'CRITIC', 'HIGH', 'MEDIUM', 'LOW'
    status VARCHAR(20) DEFAULT 'OPEN',
    triage_status VARCHAR(20) DEFAULT 'Unassigned',
    assigned_team VARCHAR(50),   -- echipa responsabila (ex: 'Infrastructure')
    assigned_person INT,         -- FK catre users.id
    assigned_to VARCHAR(50),     -- inginer specific in cadrul echipei (optional)
    bridge_required BOOLEAN DEFAULT FALSE,
    bridge_status VARCHAR(20) DEFAULT 'Not Started',
    bridge_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS server_id VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS metric_type VARCHAR(20);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS triage_status VARCHAR(20) DEFAULT 'Unassigned';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_team VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_person INT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS bridge_required BOOLEAN DEFAULT FALSE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS bridge_status VARCHAR(20) DEFAULT 'Not Started';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS bridge_url TEXT;

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