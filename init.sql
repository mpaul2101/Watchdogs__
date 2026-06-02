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
-- Regiunea serverului (pentru ierarhia de topicuri MQTT)
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS region VARCHAR(50);

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
    on_call_status BOOLEAN NOT NULL DEFAULT FALSE,
    password_hash TEXT
);

-- Coloane noi pentru DB-uri existente (idempotent)
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS team_name VARCHAR(50);
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS role VARCHAR(50);
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS on_call_status BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Seed data pentru demo impersonation
INSERT INTO users (name, email, team_name, role, on_call_status, password_hash)
VALUES
    ('Elena', 'elena@watchdogs.local', 'Executive', 'CEO', FALSE, '$2b$12$GNF7rTQ5SCJ4FoGU41i86u/ggRDsrB0gg3vz7iQjClIHwckJmO1gG'),
    ('Maria', 'maria@watchdogs.local', 'Infrastructure', 'System Manager', TRUE, '$2b$12$GNF7rTQ5SCJ4FoGU41i86u/ggRDsrB0gg3vz7iQjClIHwckJmO1gG'),
    ('Paul',  'paul@watchdogs.local', 'Infrastructure', 'Engineer', FALSE, '$2b$12$GNF7rTQ5SCJ4FoGU41i86u/ggRDsrB0gg3vz7iQjClIHwckJmO1gG'),
    ('Alex',  'alex@watchdogs.local', 'NOC', 'Incident Manager', FALSE, '$2b$12$GNF7rTQ5SCJ4FoGU41i86u/ggRDsrB0gg3vz7iQjClIHwckJmO1gG')
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    team_name = EXCLUDED.team_name,
    role = EXCLUDED.role,
    on_call_status = EXCLUDED.on_call_status,
    password_hash = EXCLUDED.password_hash;


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
    SELECT * FROM (
        -- 1. Membri din lista de distribuție pentru severitatea respectivă
        SELECT 
            u.id AS user_id,
            u.name::VARCHAR AS user_name,
            u.email::VARCHAR AS user_email,
            u.role::VARCHAR AS user_role,
            nl.name::VARCHAR AS list_name,
            ('Member of ' || nl.name || ' distribution list')::VARCHAR AS notification_reason,
            1 AS priority
        FROM notification_lists nl
        JOIN notification_list_members nlm ON nl.id = nlm.list_id
        JOIN users u ON nlm.user_id = u.id
        WHERE nl.severity_trigger = inc_severity
        
        UNION
        
        -- 2. Engineer-ul on-call din echipa asignată
        SELECT 
            u.id AS user_id,
            u.name::VARCHAR AS user_name,
            u.email::VARCHAR AS user_email,
            u.role::VARCHAR AS user_role,
            'on_call_team'::VARCHAR AS list_name,
            ('On-call engineer for ' || inc_team || ' team')::VARCHAR AS notification_reason,
            2 AS priority
        FROM users u
        WHERE u.team_name = inc_team 
          AND u.on_call_status = TRUE
          AND u.role = 'Engineer'
        
        UNION
        
        -- 3. System Manager al echipei asignate
        SELECT 
            u.id AS user_id,
            u.name::VARCHAR AS user_name,
            u.email::VARCHAR AS user_email,
            u.role::VARCHAR AS user_role,
            'team_manager'::VARCHAR AS list_name,
            ('System Manager of ' || inc_team || ' team')::VARCHAR AS notification_reason,
            3 AS priority
        FROM users u
        WHERE u.team_name = inc_team 
          AND u.role = 'System Manager'
    ) AS combined
    ORDER BY combined.priority, combined.user_name;
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

-- Starea curenta a fiecarui server (online/offline)
-- O singura linie per server, actualizata la fiecare mesaj de status MQTT
CREATE TABLE IF NOT EXISTS server_status (
    server_id VARCHAR(50) PRIMARY KEY,
    region VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'unknown',  -- 'online' / 'offline'
    last_changed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);