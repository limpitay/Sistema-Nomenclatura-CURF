# 🖥️ Sistema Nomenclatura CURF

Sistema centralizado para la gestión y asignación de hostnames de equipos, con control de colisiones en tiempo real mediante locks temporales.

---

## 🧰 Stack tecnológico

| Tecnología | Rol |
|---|---|
| **React + Vite** | Frontend |
| **Node.js + Express** | API REST |
| **PostgreSQL 16** | Base de datos principal |
| **Redis 7** | Locks temporales (3 minutos) |
| **Docker Compose** | Orquestación de servicios |
| **Nginx** | Proxy reverso + servir frontend |

---

## 🏗️ Arquitectura de despliegue

```
Tu PC Windows (desarrollo)           Ubuntu Server 24 VM
┌────────────────────────┐           ┌───────────────────────────┐
│  VS Code               │           │  Docker Engine            │
│  Node.js               │ ──SSH──▶  │  PostgreSQL               │
│  Git                   │           │  Redis                    │
│  Browser para probar   │           │  Nginx                    │
└────────────────────────┘           └───────────────────────────┘
     escribís el código                    corre todo
```

---

## 📁 Estructura del proyecto

```
curf-nomenclatura/
├── docker-compose.yml           ← producción (server)
├── docker-compose.dev.yml       ← desarrollo (tu PC)
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js
│       ├── db.js                ← pool PostgreSQL
│       ├── redis.js             ← cliente Redis (locks)
│       ├── routes/
│       │   ├── auth.js          ← login / logout / session
│       │   ├── hostnames.js     ← GET / POST / PATCH / lock
│       │   └── users.js         ← CRUD usuarios (admin)
│       └── middleware/
│           ├── auth.js          ← verificar JWT
│           └── lock.js          ← verificar/adquirir lock Redis
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api/                 ← fetch wrapper con JWT
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Builder.jsx      ← formulario de alta de hostname
│       │   └── History.jsx
│       └── components/
│           └── LockTimer.jsx    ← cuenta regresiva visible
│
└── db/
    └── init.sql                 ← schema + datos iniciales
```

---

## 🔒 Flujo anti-colisión de hostnames

Evita que dos técnicos asignen el mismo hostname al mismo tiempo.

```
Usuario A abre formulario
        │
        ▼
Selecciona EDIF + PISO + SECTOR + TIPO
        │
        ▼
GET /api/hostnames/next  →  Preview: JR-P1-ADM-PC04
        │
        ▼ (click "Reservar")
POST /api/hostnames/lock { hostname }
        │
        ▼
Redis: SET lock:JRP1ADMPC04  userA  EX 180
        │
        ├─── LockTimer arranca: 2:59...
        │
        │   (mientras tanto)
        │
        │   Usuario B intenta el mismo hostname
        │        │
        │        ▼
        │   POST /api/hostnames/lock
        │   → 409 { locked_by: "Lucas G.", expires_in: 142 }
        │   → Frontend: "Reservado por Lucas G. (2:22 restantes)"
        │
        ▼ Usuario A confirma
POST /api/hostnames/
        │
        ▼
Redis: DEL lock:JRP1ADMPC04
PG: INSERT INTO hostnames ...
```

---

## 🗄️ Esquema de base de datos

### `users`
| Campo | Tipo | Descripción |
|---|---|---|
| id | SERIAL PK | Identificador único |
| nombre | VARCHAR(100) | Nombre del técnico |
| email | VARCHAR(150) UNIQUE | Email de acceso |
| password_hash | TEXT | Hash de contraseña |
| rol | VARCHAR(20) | `tecnico` o `admin` |
| activo | BOOLEAN | Estado de la cuenta |
| created_at | TIMESTAMPTZ | Fecha de creación |

### `hostnames`
| Campo | Tipo | Descripción |
|---|---|---|
| id | SERIAL PK | Identificador único |
| hostname | VARCHAR(20) UNIQUE | Ej: `JRP1ADMPC04` |
| hostname_display | VARCHAR(30) | Ej: `JR-P1-ADM-PC04` |
| tipo | VARCHAR(10) | PC, NB, IMP, etc. |
| edificio | VARCHAR(5) | Código de edificio |
| piso | VARCHAR(5) | Código de piso |
| sector | VARCHAR(10) | Sector del edificio |
| usuario_windows | VARCHAR(100) | Usuario asignado |
| numero_serie | VARCHAR(100) | N° de serie del equipo |
| estado | VARCHAR(20) | `activo`, `baja`, etc. |
| notas | TEXT | Observaciones |
| tecnico_id | INT FK → users | Técnico que lo creó |
| created_at | TIMESTAMPTZ | Fecha de alta |
| updated_at | TIMESTAMPTZ | Última modificación |

### `events`
| Campo | Tipo | Descripción |
|---|---|---|
| id | SERIAL PK | Identificador único |
| hostname_id | INT FK → hostnames | Hostname relacionado |
| hostname | VARCHAR(20) | Copia del nombre |
| accion | VARCHAR(50) | Tipo de evento |
| detalle | TEXT | Descripción |
| tecnico_id | INT FK → users | Técnico responsable |
| created_at | TIMESTAMPTZ | Fecha del evento |

---

## 🚀 Inicio rápido

```bash
git clone https://github.com/limpitay/Sistema-Nomenclatura-CURF.git
cd Sistema-Nomenclatura-CURF

# Configurar variables de entorno
cp backend/.env.example backend/.env

# Levantar en modo desarrollo
docker-compose -f docker-compose.dev.yml up --build
```

---

## 🔌 Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Iniciar sesión |
| GET | `/api/auth/session` | Verificar sesión activa |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/hostnames/next` | Próximo número disponible |
| POST | `/api/hostnames/lock` | Reservar hostname (3 min) |
| GET | `/api/hostnames/` | Listar hostnames |
| POST | `/api/hostnames/` | Crear hostname |
| PATCH | `/api/hostnames/:id` | Actualizar hostname |
| GET | `/api/users/` | Listar usuarios (admin) |
| POST | `/api/users/` | Crear usuario (admin) |

---

## 👤 Autor

**limpitay** — CURF