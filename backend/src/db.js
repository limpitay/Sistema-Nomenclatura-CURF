const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PG:', err);
});

// Verificar conexión al arrancar
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ No se pudo conectar a PostgreSQL:', err.message);
  } else {
    console.log('✅ PostgreSQL conectado:', res.rows[0].now);
  }
});

// Ajustes de schema para bases creadas con una versión anterior de init.sql
// (init.sql solo corre cuando el volumen de Postgres está vacío). Tienen que
// ser idempotentes: corren en cada arranque.
pool.query('ALTER TABLE users ALTER COLUMN password DROP NOT NULL') // login por dominio: usuarios sin clave local
  .catch(err => console.error('❌ No se pudo actualizar el schema de users:', err.message));

module.exports = pool;