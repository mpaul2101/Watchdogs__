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


-- 2. Alarme = zgomot automat declansat de motor (un eveniment per detectie)
CREATE TABLE IF NOT EXISTS alarms (
    id SERIAL PRIMARY KEY,
    server_id VARCHAR(50) NOT NULL,
    metric_type VARCHAR(20),     -- ex: 'CPU', 'RAM', 'DISK', 'RESPONSE_TIME', 'HTTP_5XX'
    severity VARCHAR(20),        -- 'CRITIC', 'HIGH', 'MEDIUM', 'LOW'
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    incident_id INT              -- FK catre incidents.id
);

ALTER TABLE alarms ADD COLUMN IF NOT EXISTS severity VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_alarms_incident ON alarms (incident_id);


-- 3. Incidente = tickete pentru oameni (deduplicate per server+metrica)
CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    server_id VARCHAR(50),       -- adaugat pentru deduplicare
    metric_type VARCHAR(20),     -- adaugat pentru deduplicare
    title VARCHAR(200),
    severity VARCHAR(20),        -- 'CRITIC', 'HIGH', 'MEDIUM', 'LOW'
    status VARCHAR(20) DEFAULT 'OPEN',
    assigned_team VARCHAR(50),   -- echipa responsabila (ex: 'Infrastructure')
    assigned_to VARCHAR(50),     -- inginer specific in cadrul echipei (optional)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS server_id VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS metric_type VARCHAR(20);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_team VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Cautare rapida pentru deduplicare: "exista deja un OPEN pentru asta?"
CREATE INDEX IF NOT EXISTS idx_incidents_open_lookup
    ON incidents (server_id, metric_type, status);
