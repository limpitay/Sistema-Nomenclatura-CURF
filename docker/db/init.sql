-- =============================================================================
-- NOMENCLATURE DATABASE - PostgreSQL Version
-- For use with docker-compose initialization
-- =============================================================================

-- Enable UUID extension (optional but recommended)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. BUILDINGS
CREATE TABLE buildings (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO buildings (code, name, location) VALUES
('JR', 'Jacinto Ríos', 'Jacinto Ríos 554'),
('ON', 'Oncativo', 'Oncativo 1243'),
('CA', 'Audiología', 'Catamarca 1245'),
('SU', 'Suipacha', 'Suipacha 1249'),
('JK', 'Jockey', 'Jockey 1290'),
('LI', 'Odontología UCC', 'Libertad 1250');

-- 2. FLOORS (linked to buildings)
CREATE TABLE floors (
  id SERIAL PRIMARY KEY,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  code VARCHAR(10) NOT NULL,
  number INTEGER NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(building_id, code),
  UNIQUE(building_id, number)
);

-- Building JR (Jacinto Ríos, id 1): Subsuelo -> 8vo piso   -> floor_id 1-10
-- Building ON (Oncativo, id 2): Subsuelo -> 4to piso        -> floor_id 11-16
-- Building AU (Audiología, id 3): solo Planta Baja          -> floor_id 17
-- Building SU (Suipacha, id 4): Planta Baja y 1er piso      -> floor_id 18-19
-- Building JK (Jockey, id 5): solo Piso 1                   -> floor_id 20
-- Building LI (Libertad/Odontología UCC, id 6): solo PB     -> floor_id 21
INSERT INTO floors (building_id, code, number, name) VALUES
(1, 'SS', -1, 'Subsuelo'),
(1, 'PB', 0, 'Planta Baja'),
(1, 'P1', 1, 'Primer Piso'),
(1, 'P2', 2, 'Segundo Piso'),
(1, 'P3', 3, 'Tercer Piso'),
(1, 'P4', 4, 'Cuarto Piso'),
(1, 'P5', 5, 'Quinto Piso'),
(1, 'P6', 6, 'Sexto Piso'),
(1, 'P7', 7, 'Séptimo Piso'),
(1, 'P8', 8, 'Octavo Piso'),
(2, 'SS', -1, 'Subsuelo'),
(2, 'PB', 0, 'Planta Baja'),
(2, 'P1', 1, 'Primer Piso'),
(2, 'P2', 2, 'Segundo Piso'),
(2, 'P3', 3, 'Tercer Piso'),
(2, 'P4', 4, 'Cuarto Piso'),
(3, 'PB', 0, 'Planta Baja'),
(4, 'PB', 0, 'Planta Baja'),
(4, 'P1', 1, 'Primer Piso'),
(5, 'P1', 1, 'Primer Piso'),
(6, 'PB', 0, 'Planta Baja');

-- 3. SECTORS (catálogo global, independiente de edificio/piso)
CREATE TABLE sectors (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO sectors (code, name, description) VALUES
('ADM', 'Administración', 'Oficinas administrativas'),
('DIR', 'Dirección', 'Oficina de dirección'),
('ENF', 'Enfermería', 'Sala de enfermería'),
('LAB', 'Laboratorio', 'Laboratorio clínico'),
('COM', 'Comunicación', 'Departamento de comunicación'),
('RHU', 'Recursos Humanos', 'Área de RRHH'),
('FIN', 'Finanzas', 'Departamento de finanzas'),
('CNT', 'Contabilidad', 'Área de contabilidad'),
('CON', 'Consultorios Externos', 'Consultorios Externos'),
('AUD', 'Auditoría Médica', 'Auditoría Médica'),
('CVN', 'Convenios', 'Convenios'),  
('CMP', 'Compras', 'Compras'),
('MNT', 'Mantenimiento', 'Mantenimiento'),
('BIO', 'Bioingeniería', 'Bioingeniería'),
('INP', 'Internado Pediatría', 'Internado de pediatría'), 
('INA', 'Internado Adultos', 'Internado de adultos'),      
('GUA', 'Guardia Adultos', 'Guardia Adultos'),
('GUP', 'Guardia Pediátrica', 'Guardia Pediátrica'),
('ANE', 'Anestesia', 'Anestesia'),
('OFI', 'Office Varios', 'Office de Enfermería / Médicos'), 
('SIS', 'Sistemas', 'Departamento de sistemas'),
('FIS', 'Fisioterapia', 'Área de fisioterapia'),
('PSI', 'Psicología', 'Área de psicología'),
('NUT', 'Nutrición', 'Área de nutrición'),
('FAR', 'Farmacia', 'Área de farmacia'),
('UTA', 'UTI Adultos', 'Unidad de Terapia Intensiva Adultos'),
('UTP', 'UTI Pediátrica', 'Unidad de Terapia Intensiva Pediátrica'),
('QUI', 'Quirófano', 'Área de quirófano'),
('DXI', 'Diagnóstico por Imágenes', 'Área de imágenes');

-- 4. DEVICE_TYPES
CREATE TABLE device_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(5) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO device_types (code, name) VALUES
('PC', 'Desktop o Mini Pc'),
('NB', 'Notebook'),
('CAM', 'Cámara IP'),
('TT', 'Tótem'),
('LL', 'Llamador'),
('FID', 'Face ID');

-- 5. NOMENCLATURE_STATES
CREATE TABLE nomenclature_states (
  id SERIAL PRIMARY KEY,
  state VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO nomenclature_states (state, description, is_active) VALUES
('generated', 'Newly created, awaiting assignment', TRUE),
('assigned', 'Assigned to a location', TRUE),
('active', 'Currently in use', TRUE),
('withdrawn', 'Removed from location (device down/damaged)', TRUE),
('decommissioned', 'Permanently retired', FALSE),
('reassigned', 'Code recycled for new device/location', TRUE);

-- 6. USERS (Movido arriba de nomenclatures para permitir la FK)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(50) DEFAULT 'technician',
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (nombre, email, password, rol)
VALUES (
  'Luis Limpitay',
  'test@curf.com',
  '$2b$10$EkxnMyy0IB8exaG/yqwuJOs3NWN6S1x0erVuFPRvHaWvZMuZM08Um',
  'admin'),
  ('Diego Vega', 'dvega@curf.com', '$2b$10$f5grr.JXViIsRnhqB2tOPeHeylYVmZSABnuA5x1K0hlmBCZYo8Tc6', 'technician'),
  ('Santiago Fernandez', 'sfernandez@curf.com', '$2b$10$nrobeeO3C48q7UgouadKUebp67eFXggZ2bAaiVXoikFspTvWL2EL.', 'technician'),
  ('Rodrigo Ziade', 'rziade@curf.com', '$2b$10$ZvTrNas1w6fCby5pFA5fhOZlNaqc18omBByOlC/SOse4yQTrJw312', 'technician'),
  ('Marcos Moran', 'mmoran@curf.com', '$2b$10$dKjJFeMsh4c.YiON.UlrlemG36tZCYda7xYbnwTgDvFmMBGALTvzO', 'technician'),
  ('Ignacio Aguada', 'iaguada@curf.com', '$2b$10$XYlhLoJp0k7N6o9dOG9hc.5Asa8WUHJ9aVhH1SuXDxbP10G4vpeuS', 'technician'),
  ('Lautaro Cordoba', 'lcordoba@curf.com', '$2b$10$HJsnXSD/xCxe6PzUuexdL.R3rMI5h1ud7OGPODCQg/JPVUVuXX62S', 'technician'),
  ('Matias Martinez', 'mmartinez@curf.com', '$2b$10$tOFzRZY7IHCu4SvFmmX08.HM4KiZ0VC0PTinrhIHL//X4C/WHudCO', 'technician');

-- 7. NOMENCLATURES
CREATE TABLE nomenclatures (
  id SERIAL PRIMARY KEY,
  generated_code VARCHAR(50) NOT NULL UNIQUE,
  building_id INTEGER NOT NULL REFERENCES buildings(id),
  device_type_id INTEGER NOT NULL REFERENCES device_types(id),
  sector_id INTEGER REFERENCES sectors(id), -- Nullable: TT, LL, CAM no usan Sector
  sequential_number INTEGER NOT NULL,
  state_id INTEGER NOT NULL DEFAULT 1 REFERENCES nomenclature_states(id),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Campo agregado
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_nomenclatures_state ON nomenclatures(state_id);
CREATE INDEX idx_nomenclatures_building ON nomenclatures(building_id);
CREATE INDEX idx_nomenclatures_code ON nomenclatures(generated_code);
CREATE INDEX idx_nomenclatures_device ON nomenclatures(device_type_id);
CREATE INDEX idx_nomenclatures_created_by ON nomenclatures(created_by); -- Index agregado para optimizar búsquedas por creador

-- 8. NOMENCLATURE_HISTORY
CREATE TABLE nomenclature_history (
  id SERIAL PRIMARY KEY,
  nomenclature_id INTEGER NOT NULL REFERENCES nomenclatures(id) ON DELETE CASCADE,
  state_id INTEGER NOT NULL REFERENCES nomenclature_states(id),
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  change_reason VARCHAR(500),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

CREATE INDEX idx_nomenclature_history_nomenclature ON nomenclature_history(nomenclature_id);
CREATE INDEX idx_nomenclature_history_changed_at ON nomenclature_history(changed_at);
CREATE INDEX idx_nomenclature_history_state ON nomenclature_history(state_id);

-- 9. CURRENT_ASSIGNMENTS
CREATE TABLE current_assignments (
  nomenclature_id INTEGER PRIMARY KEY REFERENCES nomenclatures(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_current BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_current_assignments_assigned_to ON current_assignments(assigned_to);

-- 10. REUSE_LOG
CREATE TABLE reuse_log (
  id SERIAL PRIMARY KEY,
  nomenclature_id INTEGER NOT NULL REFERENCES nomenclatures(id) ON DELETE CASCADE,
  reused_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(500)
);

CREATE INDEX idx_reuse_log_nomenclature ON reuse_log(nomenclature_id);
CREATE INDEX idx_reuse_log_reused_at ON reuse_log(reused_at);

-- 11. AUDIT_LOG
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  nomenclature_id INTEGER REFERENCES nomenclatures(id) ON DELETE SET NULL,
  action_type VARCHAR(100),
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  details JSONB
);

CREATE INDEX idx_audit_log_nomenclature ON audit_log(nomenclature_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_action ON audit_log(action_type);

-- 12. EVENTS (for legacy compatibility)
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  hostname_id INTEGER,
  hostname VARCHAR(255),
  accion VARCHAR(100),
  detalle TEXT,
  tecnico_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_hostname ON events(hostname);
CREATE INDEX idx_events_created_at ON events(created_at);