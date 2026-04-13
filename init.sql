-- 1. Tabelul pentru date brute (Munca colegului)
CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    server_id VARCHAR(50) NOT NULL,
    cpu NUMERIC,
    ram NUMERIC,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabelul pentru Alarme (Zgomotul automat)
CREATE TABLE IF NOT EXISTS alarms (
    id SERIAL PRIMARY KEY,
    server_id VARCHAR(50) NOT NULL,
    metric_type VARCHAR(20),     -- ex: 'CPU', 'RAM'
    message TEXT,                -- ex: 'CPU a trecut de 90%'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    incident_id INT              -- Legătura cu ticketul (Foreign Key)
);

-- 3. Tabelul pentru Incidente / Tickete (Munca pentru oameni)
CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100),
    severity VARCHAR(20),        -- 'CRITIC', 'RIDICAT', 'MEDIU', 'SCAZUT'
    status VARCHAR(20) DEFAULT 'OPEN',
    assigned_to VARCHAR(50),     -- Cine se ocupă de el
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);