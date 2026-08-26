const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
});

redis.on('connect', () => console.log('✅ Redis conectado'));
redis.on('error',   (err) => console.error('❌ Redis error:', err.message));

module.exports = redis;