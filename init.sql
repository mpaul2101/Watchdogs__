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

-- =====================================================================
-- NOTIFICATION SYSTEM
-- =====================================================================
-- 
-- 3 tabele care lucrează împreună:
--   1. notification_lists       — liste de distribuție (red/yellow/green)
--   2. notification_list_members — cine e în care listă (many-to-many)
--   3. notification_templates    — template-uri de mesaje pentru fiecare severitate
--   4. notification_log          — istoric: ce s-a trimis, cui, când
-- =====================================================================

-- 1. Liste de distribuție
CREATE TABLE IF NOT EXISTS notification_lists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,      -- 'red', 'yellow', 'green'
    color VARCHAR(20) NOT NULL,            -- pentru UI display
    description TEXT,
    severity_trigger VARCHAR(20),          -- ce severity activează această listă
    auto_call BOOLEAN DEFAULT FALSE        -- dacă trebuie să se "creeze call" automat
);

-- 2. Membri în liste (many-to-many: un user poate fi în mai multe liste)
CREATE TABLE IF NOT EXISTS notification_list_members (
    list_id INT REFERENCES notification_lists(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (list_id, user_id)
);

-- 3. Template-uri de mesaje
CREATE TABLE IF NOT EXISTS notification_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    severity VARCHAR(20),
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Log de notificări (ce s-a trimis efectiv)
CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    incident_id INT REFERENCES incidents(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    list_name VARCHAR(50),                 -- 'red', 'yellow', sau 'on_call_team'
    delivery_method VARCHAR(20),           -- 'email_simulated', 'call_simulated'
    rendered_subject TEXT,
    rendered_body TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivery_status VARCHAR(20) DEFAULT 'simulated',
    triggered_by INT REFERENCES users(id) ON DELETE SET NULL  -- cine a apăsat send
);

-- Indexuri pentru lookup rapid
CREATE INDEX IF NOT EXISTS idx_notif_log_incident ON notification_log(incident_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_user ON notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_sent ON notification_log(sent_at DESC);

-- =====================================================================
-- SEED DATA — listele de distribuție
-- =====================================================================

INSERT INTO notification_lists (name, color, description, severity_trigger, auto_call) VALUES
    ('red',    '#ef4444', 'Executive list — CEO, CTO, CMO. Triggered for CRITIC incidents.', 'CRITIC', TRUE),
    ('yellow', '#eab308', 'Senior managers — System Managers. Triggered for HIGH.',         'HIGH',   FALSE),
    ('green',  '#22c55e', 'Team leads — informational only. Triggered for MEDIUM.',         'MEDIUM', FALSE)
ON CONFLICT (name) DO NOTHING;

-- Useri suplimentari pentru demo (presupunem că Persoana 1 a adăugat doar 3)
INSERT INTO users (name, email, team_name, role, on_call_status) VALUES
    ('Andrei',  'andrei@watchdogs.local',  'Executive',      'CTO',            FALSE),
    ('Cristian','cristi@watchdogs.local',  'Backend',        'System Manager', TRUE),
    ('Diana',   'diana@watchdogs.local',   'Database',       'System Manager', FALSE),
    ('Sorin',   'sorin@watchdogs.local',   'Backend',        'Engineer',       FALSE),
    ('Ana',     'ana@watchdogs.local',     'Infrastructure', 'Engineer',       FALSE)
ON CONFLICT (email) DO NOTHING;

-- Asignare automată: toți executivii → lista roșie
INSERT INTO notification_list_members (list_id, user_id)
SELECT 
    (SELECT id FROM notification_lists WHERE name = 'red'),
    u.id
FROM users u 
WHERE u.team_name = 'Executive'
ON CONFLICT DO NOTHING;

-- System managers → lista galbenă
INSERT INTO notification_list_members (list_id, user_id)
SELECT 
    (SELECT id FROM notification_lists WHERE name = 'yellow'),
    u.id
FROM users u 
WHERE u.role = 'System Manager'
ON CONFLICT DO NOTHING;

-- Template-uri default
INSERT INTO notification_templates (name, severity, subject_template, body_template) VALUES
    (
        'critical_alert',
        'CRITIC',
        'CRITICAL: {{metric_type}} on {{server_id}}',
        E'Server: {{server_id}}\nMetric: {{metric_type}}\nSeverity: CRITICAL\nIncident ID: #{{incident_id}}\n\nImmediate action required. War room scheduled.\n\nAssigned team: {{assigned_team}}'
    ),
    (
        'high_alert',
        'HIGH',
        'HIGH: {{metric_type}} on {{server_id}}',
        E'Server: {{server_id}}\nMetric: {{metric_type}}\nIncident ID: #{{incident_id}}\n\nPlease investigate within 30 minutes.\nAssigned team: {{assigned_team}}'
    ),
    (
        'medium_alert',
        'MEDIUM',
        'ℹMEDIUM: {{metric_type}} on {{server_id}}',
        E'Server: {{server_id}}\nMetric: {{metric_type}}\nIncident ID: #{{incident_id}}\n\nFor your awareness. Monitor situation.'
    )
ON CONFLICT DO NOTHING;

--procedura pentru a asigna in functie de "culoare"
CREATE OR REPLACE FUNCTION get_notification_targets(p_incident_id INT)
RETURNS TABLE (
    user_id INT,
    user_name VARCHAR,
    user_email VARCHAR,
    user_role VARCHAR,
    list_name VARCHAR,
    notification_reason VARCHAR,
    priority INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    inc_severity VARCHAR;
    inc_team VARCHAR;
BEGIN
    -- Aflăm severity și echipa asignată
    SELECT severity, assigned_team 
    INTO inc_severity, inc_team
    FROM incidents 
    WHERE id = p_incident_id;
    
    -- Dacă incidentul nu există, returnăm tabel gol
    IF inc_severity IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    
    -- 1. Membri din lista de distribuție pentru severitatea respectivă
    SELECT 
        u.id,
        u.name::VARCHAR,
        u.email::VARCHAR,
        u.role::VARCHAR,
        nl.name::VARCHAR AS list_name,
        ('Member of ' || nl.name || ' distribution list')::VARCHAR AS reason,
        1 AS priority
    FROM notification_lists nl
    JOIN notification_list_members nlm ON nl.id = nlm.list_id
    JOIN users u ON nlm.user_id = u.id
    WHERE nl.severity_trigger = inc_severity
    
    UNION
    
    -- 2. Engineer-ul on-call din echipa asignată
    SELECT 
        u.id,
        u.name::VARCHAR,
        u.email::VARCHAR,
        u.role::VARCHAR,
        'on_call_team'::VARCHAR AS list_name,
        ('On-call engineer for ' || inc_team || ' team')::VARCHAR AS reason,
        2 AS priority
    FROM users u
    WHERE u.team_name = inc_team 
      AND u.on_call_status = TRUE
      AND u.role = 'Engineer'
    
    UNION
    
    -- 3. System Manager al echipei asignate
    SELECT 
        u.id,
        u.name::VARCHAR,
        u.email::VARCHAR,
        u.role::VARCHAR,
        'team_manager'::VARCHAR AS list_name,
        ('System Manager of ' || inc_team || ' team')::VARCHAR AS reason,
        3 AS priority
    FROM users u
    WHERE u.team_name = inc_team 
      AND u.role = 'System Manager'
    
    ORDER BY priority, user_name;
END;
$$;

CREATE OR REPLACE FUNCTION dispatch_notifications(
    p_incident_id INT,
    p_triggered_by INT DEFAULT NULL
)
RETURNS INT  -- câte notificări s-au trimis
LANGUAGE plpgsql
AS $$
DECLARE
    target RECORD;
    template_record RECORD;
    inc_record RECORD;
    sent_count INT := 0;
    rendered_subject TEXT;
    rendered_body TEXT;
BEGIN
    -- Ia detaliile incidentului
    SELECT * INTO inc_record FROM incidents WHERE id = p_incident_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incident % does not exist', p_incident_id;
    END IF;
    
    -- Ia template-ul potrivit pentru severitate
    SELECT * INTO template_record 
    FROM notification_templates 
    WHERE severity = inc_record.severity
    LIMIT 1;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No template for severity %', inc_record.severity;
    END IF;
    
    -- Pentru fiecare target, generează și loghează notificarea
    FOR target IN 
        SELECT * FROM get_notification_targets(p_incident_id)
    LOOP
        -- Render template cu valorile din incident
        rendered_subject := template_record.subject_template;
        rendered_subject := REPLACE(rendered_subject, '{{server_id}}', COALESCE(inc_record.server_id, 'unknown'));
        rendered_subject := REPLACE(rendered_subject, '{{metric_type}}', COALESCE(inc_record.metric_type, 'unknown'));
        rendered_subject := REPLACE(rendered_subject, '{{incident_id}}', inc_record.id::TEXT);
        
        rendered_body := template_record.body_template;
        rendered_body := REPLACE(rendered_body, '{{server_id}}', COALESCE(inc_record.server_id, 'unknown'));
        rendered_body := REPLACE(rendered_body, '{{metric_type}}', COALESCE(inc_record.metric_type, 'unknown'));
        rendered_body := REPLACE(rendered_body, '{{incident_id}}', inc_record.id::TEXT);
        rendered_body := REPLACE(rendered_body, '{{assigned_team}}', COALESCE(inc_record.assigned_team, 'unassigned'));
        
        -- Insert în log
        INSERT INTO notification_log (
            incident_id, user_id, list_name,
            delivery_method, rendered_subject, rendered_body,
            triggered_by
        ) VALUES (
            p_incident_id, target.user_id, target.list_name,
            'email_simulated', rendered_subject, rendered_body,
            p_triggered_by
        );
        
        sent_count := sent_count + 1;
    END LOOP;
    
    RETURN sent_count;
END;
$$;