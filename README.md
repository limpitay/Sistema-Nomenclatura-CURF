# 🖥️ Sistema Nomenclatura CURF

Sistema centralizado para la gestión y asignación de nomenclatures de equipos, con control de colisiones en tiempo real mediante locks temporales.

---

## 🧰 Stack tecnológico

| Tecnología | Rol |
|---|---|
| **React + Vite** | Frontend |
| **Node.js + Express** | API REST |
| **PostgreSQL 15** | Base de datos principal |
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
Sistema-Nomenclatura-CURF/
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── nginx.conf
├── .env.example
│
├── backend/
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── db.js                ← pool PostgreSQL
│       ├── redis.js             ← cliente Redis (locks)
│       ├── routes/
│       │   ├── auth.js          ← login / me
│       │   └── nomenclatures.js ← catálogos / GET / POST / PATCH / lock / events
│       └── middleware/
│           └── auth.js          ← verificar JWT
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx              ← router
│       ├── api/client.js        ← wrapper Axios con JWT
│       ├── context/AuthContext.jsx
│       └── pages/
│           ├── Login.jsx
│           ├── Builder.jsx      ← formulario de alta de hostname
│           ├── History.jsx      ← listado + historial de eventos
│           └── Admin.jsx        ← placeholder, sin implementar aún
│
└── docker/
    └── db/
        └── init.sql             ← schema + datos iniciales
```

---

## 🔒 Flujo anti-colisión de nomenclatures

Evita que dos técnicos asignen el mismo hostname al mismo tiempo.

```
Usuario A abre formulario
        │
        ▼
Selecciona EDIF + PISO + SECTOR + TIPO
        │
        ▼
GET /api/nomenclatures/next  →  Preview: JR-P1-ADM-PC04
        │
        ▼ (click "Reservar")
POST /api/nomenclatures/lock { hostname }
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
        │   POST /api/nomenclatures/lock
        │   → 409 { locked_by: "Lucas G.", expires_in: 142 }
        │   → Frontend: "Reservado por Lucas G. (2:22 restantes)"
        │
        ▼ Usuario A confirma
POST /api/nomenclatures/
        │
        ▼
Redis: DEL lock:JRP1ADMPC04
PG: INSERT INTO nomenclatures ...
```

---

## 🗄️ Esquema de base de datos

Catálogos: `buildings`, `floors` (FK a `buildings`), `sectors`, `device_types` y
`nomenclature_states` (los 6 estados posibles: generated, assigned, active,
withdrawn, decommissioned, reassigned — aunque hoy la API solo expone las
transiciones generado/reasignado/baja).

### `users`
| Campo | Tipo | Descripción |
|---|---|---|
| id | SERIAL PK | Identificador único |
| nombre | VARCHAR(255) | Nombre del técnico |
| email | VARCHAR(255) UNIQUE | Email de acceso |
| password | VARCHAR(255) | Hash bcrypt de la contraseña |
| rol | VARCHAR(50) | `technician` (default) o `admin` |
| activo | BOOLEAN | Estado de la cuenta |
| created_at | TIMESTAMP | Fecha de creación |

### `nomenclatures`
| Campo | Tipo | Descripción |
|---|---|---|
| id | SERIAL PK | Identificador único |
| generated_code | VARCHAR(50) UNIQUE | Hostname final, ej: `JRP1ADMPC04` |
| building_id | INT FK → buildings | Edificio |
| device_type_id | INT FK → device_types | Tipo de dispositivo |
| sector_id | INT FK → sectors, nullable | Sector (TT/LL/CAM/FID no lo usan) |
| sequential_number | INTEGER | Número secuencial dentro de su grupo |
| state_id | INT FK → nomenclature_states | Estado actual |
| created_by | INT FK → users | Técnico que lo creó |
| created_at / updated_at | TIMESTAMP | Fechas de alta / última modificación |

### `nomenclature_history`
Historial de negocio (qué se ve en el modal de detalle de `History.jsx`): cada
cambio de estado de una nomenclatura, con motivo, técnico y fecha.

### `audit_log`
Auditoría técnica de bajo nivel (creación, cambios de estado) con detalle en
JSONB — pensada para trazabilidad, no para mostrarse directamente en la UI.

> Nota: `current_assignments`, `reuse_log` y `events` se sacaron del schema
> porque ningún endpoint las usaba. Si en el futuro se necesita reciclar
> números de equipos dados de baja, `reuse_log` es el punto de partida lógico
> para reintroducir (hoy `GET /nomenclatures/next` nunca reutiliza números).

---

## 🚀 Inicio rápido

```bash
git clone https://github.com/limpitay/Sistema-Nomenclatura-CURF.git
cd Sistema-Nomenclatura-CURF

# Configurar variables de entorno
cp .env.example .env
# completar .env con los valores reales (DB, Redis, JWT_SECRET, etc.)

# Levantar todos los servicios
docker-compose up --build
```

Frontend en `http://localhost:8080`, API en `http://localhost:3001`, pgAdmin
en `http://localhost:5050`.

---

## 🔌 Endpoints principales

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | — | Iniciar sesión (máx. 10 intentos / 15 min por IP) |
| GET | `/api/auth/me` | JWT | Datos del usuario autenticado |
| GET | `/api/nomenclatures/catalogs/buildings` | — | Listar edificios |
| GET | `/api/nomenclatures/catalogs/device-types` | — | Listar tipos de dispositivo |
| GET | `/api/nomenclatures/catalogs/floors/:buildingId` | — | Pisos de un edificio |
| GET | `/api/nomenclatures/catalogs/sectors` | — | Listar sectores |
| GET | `/api/nomenclatures` | JWT | Listar nomenclaturas (filtros: tipo, edificio, estado, search) |
| POST | `/api/nomenclatures` | JWT | Crear hostname |
| GET | `/api/nomenclatures/next` | JWT | Próximo número secuencial disponible |
| POST | `/api/nomenclatures/lock` | JWT | Reservar hostname (3 min, Redis) |
| DELETE | `/api/nomenclatures/lock/:hostname` | JWT | Liberar reserva manualmente |
| PATCH | `/api/nomenclatures/:id` | JWT | Cambiar estado (reasignado / baja) |
| GET | `/api/nomenclatures/:hostname/events` | JWT | Historial de estados de una nomenclatura |
| GET | `/api/health` | — | Health check |

No hay endpoint de logout: el logout es solo del lado del cliente (se borra el
token de `localStorage`), y el JWT expira solo según `JWT_EXPIRES`. Tampoco
existe todavía un módulo de administración de usuarios vía API.

---

## 👤 Autor

**limpitay** — CURF