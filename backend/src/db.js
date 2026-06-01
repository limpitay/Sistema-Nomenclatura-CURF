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

module.exports = pool;