# 🖥️ Sistema Nomenclatura CURF

Sistema centralizado para la gestión y asignación de nomenclaturas (hostnames) de equipos, con control de colisiones en tiempo real mediante locks temporales y validación contra el Active Directory y los NVR de cámaras.

---

## 🧰 Stack tecnológico

| Tecnología | Rol |
|---|---|
| **React + Vite** | Frontend |
| **Node.js + Express** | API REST |
| **PostgreSQL 15** | Base de datos principal |
| **Redis 7** | Locks temporales (3 minutos) |
| **Docker Compose** | Orquestación de servicios |
| **Nginx** | Proxy reverso + servir frontend (+ HTTPS en producción) |

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
├── docker-compose.yml         ← desarrollo local
├── docker-compose.prod.yml    ← producción (ver sección de despliegue)
├── Dockerfile.backend
├── Dockerfile.frontend
├── nginx.conf                 ← nginx de desarrollo (HTTP)
├── nginx.https.conf.template  ← nginx de producción (HTTPS)
├── .env.example
├── scripts/
│   └── certificado.sh         ← genera el certificado autofirmado en certs/
│
├── backend/
│   ├── package.json
│   ├── scripts/
│   │   └── create-user.js     ← alta del primer admin (después se gestionan desde /admin)
│   └── src/
│       ├── index.js
│       ├── db.js                ← pool PostgreSQL
│       ├── redis.js             ← cliente Redis (locks)
│       ├── ldap.js              ← login contra Active Directory (AUTH_MODE=ldap)
│       ├── hikcentral.js        ← número y reserva de hostnames CAM (panel HikCentral)
│       ├── utils/
│       │   ├── nextNumber.js    ← primer número libre de una secuencia
│       │   ├── hostnameAD.js    ← patrones para buscar números ya usados en el AD
│       │   └── username.js      ← normaliza el usuario de dominio a sAMAccountName
│       ├── routes/
│       │   ├── auth.js          ← login / me / config
│       │   ├── users.js         ← ABM de usuarios (panel /admin)
│       │   ├── ad.js            ← Equipos AD y Áreas AD (solo lectura)
│       │   └── nomenclatures.js ← catálogos / GET / POST / PATCH / lock / events
│       └── middleware/
│           ├── auth.js          ← verificar JWT
│           └── admin.js         ← exige rol admin
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx              ← router
│       ├── api/client.js        ← wrapper Axios con JWT
│       ├── context/AuthContext.jsx
│       ├── components/Layout.jsx ← menú lateral (Constructor, Historial, Equipos AD, Áreas AD, Usuarios)
│       ├── utils/hostname.js    ← arma el hostname según el tipo
│       └── pages/
│           ├── Login.jsx
│           ├── Builder.jsx      ← formulario de alta de hostname
│           ├── History.jsx      ← listado + historial de eventos
│           ├── EquiposAD.jsx    ← equipos del AD (solo lectura)
│           ├── AreasAD.jsx      ← equipos del AD por Edificio / Área
│           └── Admin.jsx        ← administración de usuarios (solo admin)
│
└── docker/
    └── db/
        ├── init.sql             ← schema + catálogos (buildings, sectors, device_types...)
        └── seed-dev.sql         ← usuarios de prueba, SOLO para desarrollo local
```

---

## 🏷️ Formatos de hostname

| Tipo | Formato | Ejemplo | Numeración |
|---|---|---|---|
| **PC** / **NB** | Edificio + Piso + Sector + Tipo + Nº | `JRP1ADMPC04` (`JR-P1-ADM-PC-04`) | Por edificio + sector + tipo (el piso no cuenta) |
| Consultorios (sector **CON**) | Edificio + Piso + Sector + Nº | `JRP1CON03` (`JR-P1-CON-03`) | Igual que PC/NB, sin el tipo en el nombre |
| **TT** (Tótem) / **LL** (Llamador) | Tipo + Piso + Edificio + Nº | `TTP1JR07` (`TT-P1-JR-07`) | Correlativo global por tipo |
| **CAM** (Cámara IP) | CAM + Edificio + Piso + Nº | `CAMJRP331` (`CAM-JR-P3-31`) | La decide HikCentral (ver Cámaras más abajo) |
| ~~**FID**~~ (Face ID) | — | — | Deshabilitado (`TIPOS_DESHABILITADOS`) |

El número va con 2 dígitos como mínimo y es el primer hueco libre de la
secuencia (los dados de baja siguen ocupando su número). Para PC/NB/TT/LL
también se saltean los números que ya existen en el AD (todo el dominio),
aunque no se hayan creado desde este sistema.

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
| username | VARCHAR(100) UNIQUE | Usuario de acceso (login) |
| email | VARCHAR(255) UNIQUE, nullable | Email de contacto (opcional) |
| password | VARCHAR(255), nullable | Hash bcrypt. NULL = solo entra con su clave de dominio (`AUTH_MODE=ldap`) |
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
| floor_id | INT FK → floors, nullable | Piso |
| sequential_number | INTEGER | Número secuencial dentro de su grupo |
| state_id | INT FK → nomenclature_states | Estado actual |
| created_by | INT FK → users | Técnico que lo creó |
| usuario_windows | VARCHAR(100), nullable | Solo PC/NB (ver `TIPOS_CON_USUARIO`) |
| numero_serie | VARCHAR(100), nullable | Número de serie del equipo |
| notas | TEXT, nullable | Observaciones cargadas al alta |
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

Frontend en `http://localhost:8080`, API en `http://localhost:3010` (el frontend
le habla por dentro vía nginx; este puerto es solo para pegarle directo a la
API), pgAdmin en `http://localhost:5050`.

---

## 🚢 Despliegue en producción (Ubuntu)

Usar `docker-compose.prod.yml`, no el de desarrollo: no trae pgAdmin, no
publica los puertos de Postgres/Redis al host, exige password de Redis y
levanta la API con `NODE_ENV=production` y sin bind-mounts.

```bash
git clone https://github.com/limpitay/Sistema-Nomenclatura-CURF.git
cd Sistema-Nomenclatura-CURF

cp .env.example .env
# Completar TODOS los valores: DB_USER/DB_PASSWORD/DB_NAME, DATABASE_URL (debe
# coincidir con esos mismos valores), REDIS_PASSWORD, JWT_SECRET (generar uno
# propio, ver comentario en el archivo), PUERTO_HTTPS (ver HTTPS más abajo) y
# CORS_ORIGIN=https://<IP-del-servidor>:<PUERTO_HTTPS>.

bash scripts/certificado.sh   # certificado HTTPS, una sola vez (ver HTTPS más abajo)
docker compose -f docker-compose.prod.yml up --build -d
```

### 🔑 Login

`AUTH_MODE` en el `.env` define con qué contraseña entra cada uno:

- **`local`** (default): usuario y contraseña propios del sistema, que se cargan en `/admin`.
- **`ldap`**: usuario y **contraseña de Windows** del dominio (Active Directory),
  completando también `LDAP_URL` y `LDAP_DOMINIO`. Igual **solo entra quien esté
  dado de alta en `/admin`** con su usuario de dominio (ej. `jperez`, sin el
  `CURF\` ni el `@curf.net`). El rol y el estado activo/inactivo se siguen
  manejando desde `/admin`, y una cuenta deshabilitada o bloqueada en el AD no
  puede entrar. En este modo la contraseña del formulario de `/admin` es
  opcional: es una **clave de emergencia** (local, aparte de la del dominio)
  que sirve para entrar si el controlador de dominio no responde. Conviene que
  al menos un admin la tenga, y dejársela solo a quien la necesite: mientras
  esté cargada, también funciona como contraseña alternativa.
  El contenedor de la API tiene que llegar al DC por la red (puerto 389, o 636
  con `ldaps://`).

Como al principio no hay ningún admin para entrar a `/admin`, el primer usuario
se crea a mano una sola vez:

```bash
# AUTH_MODE=ldap: "-" = sin clave local, entra con su contraseña de Windows
docker compose -f docker-compose.prod.yml exec api npm run create-user -- \
  "Nombre Apellido" jperez - admin

# AUTH_MODE=local (o para darle además una clave de emergencia)
docker compose -f docker-compose.prod.yml exec api npm run create-user -- \
  "Nombre Apellido" jperez "contraseña-segura" admin
```

De ahí en adelante, las altas, ediciones y bajas de usuarios (incluido el
borrado definitivo) se manejan desde el panel `/admin` con esa cuenta.

### 🖥️ Equipos AD

Sección de **solo lectura** (menú "Equipos AD", visible para todos los usuarios)
que lista las cuentas de equipo de `LDAP_EQUIPOS_BASE` (por defecto
`curf.net/CURF/Equipos` con todas sus subcarpetas), con búsqueda, orden por
columna y paginado de 25 o 50 por página. Necesita en el `.env`, además de
`LDAP_URL` y `LDAP_DOMINIO`, una cuenta de lectura del AD
(`LDAP_LECTURA_USUARIO` / `LDAP_LECTURA_PASSWORD`): un usuario común del
dominio alcanza, puede ser el mismo que usa `ad-reorg`. Funciona con cualquier
`AUTH_MODE`.

### 🏢 Áreas AD

Sección de **solo lectura** (menú "Áreas AD") con la misma configuración que
Equipos AD, pero organizada como la consola del AD: un árbol
`Edificio / Área` armado con las OUs de `LDAP_EQUIPOS_BASE`
(`curf.net/CURF/Equipos/Edificio/Área/equipo`), incluidas las áreas sin equipos.
Los edificios (Catamarca, Hindu, Jacinto Rios, Jockey, Oncativo, Suipacha;
lista `EDIFICIOS` en `AreasAD.jsx`) van arriba y resaltados; el resto de las OUs
(PC, NB, Totems, EquiposSinCategorizar…) queda agrupado en "Otras OU".
Al elegir un edificio o un área se listan sus equipos; las OUs más profundas que
el área aparecen como subcarpeta del equipo. El buscador encuentra un equipo en
todas las áreas a la vez.

### 📷 Cámaras (HikCentral)

Las cámaras (`CAM`) usan el formato de HikCentral y los NVR: `CAM` + edificio +
piso + número, ej. `CAMJRP331` (impreso `CAM-JR-P3-31`). El número no lo calcula
este sistema: lo decide el panel HikCentral CURF (`Sistema-API-HIKCENTRAL`), que
ve las cámaras de todos los NVR (Hikvision y Dahua, sección Cámaras) y las reservas, con sus reglas (Catamarca,
Oncativo y Jacinto Ríos comparten numeración; Jockey y Suipacha, cada uno la suya).

- **Número sugerido:** `/next` le pregunta a HikCentral el próximo libre del edificio.
- **Reservar:** `/lock` verifica que siga siendo el próximo libre y toma el lock de Redis como siempre.
- **Registrar:** antes de guardar, se reserva en HikCentral (queda en su lista de
  pendientes con el nombre del técnico hasta que aparece en un NVR). Si mientras
  tanto alguien tomó ese número, HikCentral responde 409 con el próximo libre y
  acá no se guarda nada.
- Si el panel o algún NVR (Hikvision o Dahua) no responde, **no se genera** ninguna
  cámara: sin los NVR no se puede asegurar que el número esté libre.

Necesita en el `.env` `HIKCENTRAL_URL` y `HIKCENTRAL_TOKEN` (el mismo valor que
`NOMENCLATURA_TOKEN` en el `.env` de HikCentral). Si HikCentral tiene
`ALLOWED_IPS`, hay que sumar la IP con la que llega el contenedor de la API
(la del bridge de Docker, `172.x.0.1`).

### 🔐 HTTPS

Mismo esquema que `ad-reorg`: en producción el nginx del contenedor `frontend`
usa `nginx.https.conf.template` (en vez de `nginx.conf`, que queda para
desarrollo), sirve HTTPS con un certificado autofirmado y redirige `http://` →
`https://`.

- **Certificado:** `bash scripts/certificado.sh` lo genera en `certs/` (no se
  sube a git) para el hostname y las IPs del servidor, válido 825 días. Para
  otros nombres: `bash scripts/certificado.sh nomenclatura.curf.net 192.168.14.167`.
  Si hay una CA interna, se puede dejar ahí un certificado de ella con los
  mismos nombres (`nomenclatura.crt` / `nomenclatura.key`).
- **Puertos:** `PUERTO_HTTPS` (443 por defecto) y `PUERTO_HTTP` (80, solo
  redirige). En el servidor de CURF el 443 es de `ad-reorg`, así que se usa
  `PUERTO_HTTPS=8443` → `https://192.168.14.167:8443`, con `CORS_ORIGIN` en
  ese mismo puerto.
- **Aviso "No seguro":** los navegadores lo muestran hasta que se instala
  `certs/nomenclatura.crt` en cada PC (doble click → Instalar certificado →
  Equipo local → "Entidades de certificación raíz de confianza"), o por GPO.

---

## 🔌 Endpoints principales

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | — | Iniciar sesión (máx. 10 intentos / 15 min por IP) |
| GET | `/api/auth/me` | JWT | Datos del usuario autenticado |
| GET | `/api/auth/config` | — | Modo de login (`local` / `ldap`) y dominio, para el front |
| GET | `/api/nomenclatures/catalogs/buildings` | — | Listar edificios |
| GET | `/api/nomenclatures/catalogs/device-types` | — | Listar tipos de dispositivo (sin los de `TIPOS_DESHABILITADOS`, hoy FID, que la API también rechaza) |
| GET | `/api/nomenclatures/catalogs/floors/:buildingId` | — | Pisos de un edificio |
| GET | `/api/nomenclatures/catalogs/sectors` | — | Listar sectores |
| GET | `/api/nomenclatures` | JWT | Listar nomenclaturas (filtros: tipo, edificio, estado, search) |
| POST | `/api/nomenclatures` | JWT | Crear hostname (CAM: antes lo reserva en HikCentral) |
| GET | `/api/nomenclatures/next` | JWT | Próximo número secuencial disponible (PC/NB/TT/LL: también saltea los números ya usados en el AD; CAM: lo da HikCentral) |
| POST | `/api/nomenclatures/lock` | JWT | Reservar hostname (3 min, Redis). Rechaza si existe en la base o, para PC/NB/TT/LL, en el AD (todo el dominio); CAM: si ya no es el próximo libre en HikCentral |
| DELETE | `/api/nomenclatures/lock/:hostname` | JWT | Liberar reserva manualmente |
| PATCH | `/api/nomenclatures/:id` | JWT | Cambiar estado (reasignado / baja) |
| GET | `/api/nomenclatures/:hostname/events` | JWT | Historial de estados de una nomenclatura |
| GET | `/api/ad/equipos` | JWT | Equipos del AD (`LDAP_EQUIPOS_BASE`); `?refrescar=1` saltea la caché de 2 min |
| GET | `/api/ad/areas` | JWT | OUs de `LDAP_EQUIPOS_BASE` + equipos, para la vista por Edificio / Área (misma caché) |
| GET | `/api/health` | — | Health check |

No hay endpoint de logout: el logout es solo del lado del cliente (se borra el
token de `localStorage`), y el JWT expira solo según `JWT_EXPIRES`. La
administración de usuarios (`/api/users`, solo admin) es la que usa el panel `/admin`.

---

## 🧪 Tests y lint

```bash
cd backend  && npm test && npm run lint   # Jest
cd frontend && npm test && npm run lint   # Vitest
```

---

## 👤 Autor

**limpitay** — CURF