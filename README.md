# Sistema-Nomenclatura-CURF

****************************************************************************************

STACK

React + Vite       → Frontend
Node.js + Express  → API REST
PostgreSQL 16      → Base de datos
Redis 7            → Locks temporales (3 min)
Docker Compose     → Orquestación de todo
Nginx              → Proxy reverso + servir frontend

///////////////////////////////////////////////////////////////////////////////////////////

Tu PC Windows (desarrollo)          Ubuntu Server 24 VM
┌─────────────────────────┐         ┌──────────────────────────┐
│  VS Code                │         │  Docker Engine           │
│  Node.js                │ ──SSH── │  PostgreSQL              │
│  Git                    │         │  Redis                   │
│  Browser para probar    │         │  Nginx                   │
└─────────────────────────┘         └──────────────────────────┘
     escribís el código                  corre todo     

////////////////////////////////////////////////////////////////////////////////////////////

Directorio

curf-nomenclatura/
├── docker-compose.yml          ← producción (server)
├── docker-compose.dev.yml      ← desarrollo (tu PC)
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js
│       ├── db.js               ← pool PostgreSQL
│       ├── redis.js            ← cliente Redis (locks)
│       ├── routes/
│       │   ├── auth.js         ← login / logout / session
│       │   ├── hostnames.js    ← GET / POST / PATCH / lock
│       │   └── users.js        ← CRUD usuarios (admin)
│       └── middleware/
│           ├── auth.js         ← verificar JWT
│           └── lock.js         ← verificar/adquirir lock Redis
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api/                ← fetch wrapper con JWT
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Builder.jsx     ← el formulario actual migrado
│       │   └── History.jsx
│       └── components/
│           └── LockTimer.jsx   ← cuenta regresiva visible
│
└── db/
    └── init.sql                ← schema + datos iniciales

*****************************************************************************************
Flujo Anti-Colision de HOstnames

Usuario A abre formulario
        │
        ▼
selecciona EDIF+PISO+SECT+TIPO
        │
        ▼
  [GET /api/hostnames/next]  ← devuelve próximo número disponible
        │
        ▼
  Preview: JR-P1-ADM-PC04
        │
  ┌─────▼─────┐
  │  LockTimer │  ← aparece al hacer click en "Reservar"
  │  2:59...  │     POST /api/hostnames/lock { hostname }
  └─────┬─────┘     Redis: SET lock:JRP1ADMPC04 userA EX 180
        │
   (mientras tanto)
        │
   Usuario B intenta JRP1ADMPC04
        │
        ▼
  [POST /api/hostnames/lock]
  → 409 { locked_by: "Lucas G.", expires_in: 142 }
  → Frontend muestra "Reservado por Lucas G. (2:22 restantes)"
        │
   Usuario A confirma → POST /api/hostnames/
        │
        ▼
  Redis: DEL lock:JRP1ADMPC04
  PG: INSERT INTO hostnames ...

  *****************************************************************************************

  DB 

  CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol           VARCHAR(20) DEFAULT 'tecnico',
  activo        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hostnames (
  id               SERIAL PRIMARY KEY,
  hostname         VARCHAR(20) UNIQUE NOT NULL,
  hostname_display VARCHAR(30) NOT NULL,
  tipo             VARCHAR(10) NOT NULL,
  edificio         VARCHAR(5)  NOT NULL,
  piso             VARCHAR(5)  NOT NULL,
  sector           VARCHAR(10),
  usuario_windows  VARCHAR(100),
  numero_serie     VARCHAR(100),
  estado           VARCHAR(20) DEFAULT 'activo',
  notas            TEXT,
  tecnico_id       INT REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE events (
  id            SERIAL PRIMARY KEY,
  hostname_id   INT REFERENCES hostnames(id) ON DELETE CASCADE,
  hostname      VARCHAR(20) NOT NULL,
  accion        VARCHAR(50) NOT NULL,
  detalle       TEXT,
  tecnico_id    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hostnames_tipo    ON hostnames(tipo);
CREATE INDEX idx_hostnames_edif    ON hostnames(edificio, piso, sector);
CREATE INDEX idx_events_hostname   ON events(hostname);

********************************************************************************************
