-- =============================================================================
-- DATOS DE PRUEBA — SOLO DESARROLLO LOCAL
-- No montar este archivo en el compose de producción (docker-compose.prod.yml
-- no lo incluye). Las contraseñas en texto plano no están documentadas aquí;
-- si nadie las recuerda, generá un hash nuevo con create-user.js y actualizalo.
-- =============================================================================

INSERT INTO users (nombre, email, password, rol)
VALUES
  ('Luis Limpitay', 'test@curf.com', '$2b$10$EkxnMyy0IB8exaG/yqwuJOs3NWN6S1x0erVuFPRvHaWvZMuZM08Um', 'admin'),
  ('Diego Vega', 'dvega@curf.com', '$2b$10$f5grr.JXViIsRnhqB2tOPeHeylYVmZSABnuA5x1K0hlmBCZYo8Tc6', 'technician'),
  ('Santiago Fernandez', 'sfernandez@curf.com', '$2b$10$nrobeeO3C48q7UgouadKUebp67eFXggZ2bAaiVXoikFspTvWL2EL.', 'technician'),
  ('Rodrigo Ziade', 'rziade@curf.com', '$2b$10$ZvTrNas1w6fCby5pFA5fhOZlNaqc18omBByOlC/SOse4yQTrJw312', 'technician'),
  ('Marcos Moran', 'mmoran@curf.com', '$2b$10$dKjJFeMsh4c.YiON.UlrlemG36tZCYda7xYbnwTgDvFmMBGALTvzO', 'technician'),
  ('Ignacio Aguada', 'iaguada@curf.com', '$2b$10$XYlhLoJp0k7N6o9dOG9hc.5Asa8WUHJ9aVhH1SuXDxbP10G4vpeuS', 'technician'),
  ('Lautaro Cordoba', 'lcordoba@curf.com', '$2b$10$HJsnXSD/xCxe6PzUuexdL.R3rMI5h1ud7OGPODCQg/JPVUVuXX62S', 'technician'),
  ('Matias Martinez', 'mmartinez@curf.com', '$2b$10$tOFzRZY7IHCu4SvFmmX08.HM4KiZ0VC0PTinrhIHL//X4C/WHudCO', 'technician');
