require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();

// CORS_ORIGIN: lista de orígenes separados por coma (ej: "http://localhost:5173,http://192.168.1.50:8080")
// Si no está seteada, queda abierto a cualquier origen (comportamiento previo).
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',').map(o => o.trim()) } : undefined));
app.use(express.json());

// Rutas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/nomenclatures', require('./routes/nomenclatures'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en http://localhost:${PORT}`);
});

