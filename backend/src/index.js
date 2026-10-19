require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const { validarConfig: validarConfigAuth } = require('./ldap');

validarConfigAuth();

const app = express();

// La API siempre corre detrás de proxies: nginx en desarrollo (1 hop) y
// caddy -> nginx en producción (2 hops, TRUST_PROXY_HOPS=2 en el compose prod).
// Sin esto, express-rate-limit y req.ip ven la IP del contenedor del proxy para
// todos los usuarios por igual, lo que rompe el límite de intentos de login
// (comparte el contador entre todos). Poner más hops de los reales permite
// falsificar la IP vía X-Forwarded-For.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

app.use(helmet());

// CORS_ORIGIN: lista de orígenes separados por coma (ej: "http://localhost:5173,http://192.168.1.50:8080")
// Si no está seteada, queda abierto a cualquier origen (comportamiento previo).
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  CORS_ORIGIN no está configurada: la API acepta requests de cualquier origen.');
}
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',').map(o => o.trim()) } : undefined));
app.use(express.json());

// Rutas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/nomenclatures', require('./routes/nomenclatures'));
app.use('/api/users', require('./routes/users'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en http://localhost:${PORT}`);
});

