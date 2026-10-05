# Arquitectura del Sistema DECE

El sistema de tutorías pasó de ser una aplicación independiente a ser **el primer módulo** de una plataforma más amplia para el Departamento de Consejería Estudiantil (DECE). Este documento describe cómo está organizada y cómo se agregan los módulos que faltan (solicitudes, citas, expedientes, seguimiento de casos, reportes).

## 1. Vista general

```
                         ┌──────────────────────────── un solo origen (ej. https://dece.uets.edu.ec) ─┐
Navegador ──────────────►│ portal-shell (Next.js)                                                       │
                         │   /login, /, /modulos/:id, /administracion/usuarios                          │
                         │   /tutorias/**  ──rewrite──► tutorias-mfe (Next.js, basePath /tutorias)      │
                         │   /api/**       ──rewrite──► api-gateway (Express)                           │
                         └──────────────────────────────────────────────────────────────────────────────┘
                                                            │
                               ┌────────────────────────────┴───────────────────────┐
                    /api/identity/**                                     /api/tutorias/**
                               ▼                                                    ▼
                   identity-service (NestJS)                           tutoring-service (NestJS)
                   login Google, usuarios, roles,  ◄── JWKS + /auth/session ──  módulo de tutorías
                   emisión de JWT (RS256)                                       (proyección local de usuarios)
                               │                                                    │
                        schema "identity"                                   schema "public"
                               └──────────────── PostgreSQL ────────────────────────┘
```

| Pieza | Carpeta | Puerto dev | Responsabilidad |
|---|---|---|---|
| Portal (shell) | `apps/portal-shell` | 3100 | Login con Google, catálogo de módulos, administración de usuarios, host de los micro frontends |
| MFE Tutorías | `apps/tutorias-mfe` | 3101 | Todas las pantallas del módulo de tutorías, bajo `/tutorias` |
| API Gateway | `services/api-gateway` | 4000 | Punto de entrada único a los microservicios, rate limit de login, CORS |
| Identity service | `services/identity-service` | 4001 | Identidad, roles globales, JWT, bitácora de accesos |
| Tutoring service | `services/tutoring-service` | 4002 | Dominio de tutorías (agenda, disponibilidad, asistencia, reportes, representantes, animadores) |
| Notification service | `services/notification-service` | 4003 | Correos (solo envío, `noreply@uets.edu.ec`), invitaciones de calendario, campana del sistema |

## 2. Autenticación: Google institucional

1. El portal muestra el botón oficial de **Google Identity Services** (con `hd=uets.edu.ec` como pista).
2. Google devuelve un *ID token* firmado; el portal lo envía a `POST /api/identity/auth/google`.
3. El identity-service lo verifica (firma de Google, expiración, `aud` = nuestro Client ID) y aplica las reglas de negocio, **todas en el servidor**:
   - `email_verified` debe ser verdadero;
   - el claim `hd` debe ser `uets.edu.ec` (excluye Gmail y cuentas externas);
   - el correo debe terminar exactamente en `@uets.edu.ec` (excluye subdominios y dominios parecidos);
   - la parte local **no** puede terminar en `.est` (cuentas de estudiantes: `nombre.apellido.est@uets.edu.ec`);
   - la cuenta debe estar **pre-registrada y activa** (un admin la habilita en *Usuarios y roles*);
   - si ya tiene una cuenta de Google vinculada (`sub`), debe coincidir.
4. Si todo pasa, emite un JWT **RS256** (claims `sub`, `email`, `role`, `tv`). Todo rechazo queda en `identity.auth_events`.

La política de correos es configurable (`ALLOWED_EMAIL_DOMAIN`, `BLOCKED_EMAIL_LOCAL_SUFFIXES`) y está cubierta por tests (`institutional-email.spec.ts`, `login.use-cases.spec.ts`).

### Cómo validan el token los demás microservicios

- **Firma local**: descargan la clave pública de `GET /api/identity/.well-known/jwks.json` (solo el identity-service tiene la privada; ningún otro servicio puede fabricar tokens).
- **Revocación**: consultan `GET /auth/session` (introspección) con caché de 30 s (`IDENTITY_SESSION_CACHE_TTL_MS`). Logout, desactivación o cambio de rol incrementan `tokenVersion` y el token deja de servir en ≤ 30 s en todos los módulos.
- **Proyección local**: el tutoring-service mantiene su tabla `users` (id/email/rol) sincronizada en cada request autenticado, porque sus FK (auditoría, inscripciones, cancelaciones) la necesitan. Al entrar un docente, su ficha en `teachers` se vincula sola por correo.

### Sesión compartida entre micro frontends

Todos los MFE se sirven desde el mismo origen que el portal, así que comparten `localStorage`. Contrato (no cambiar sin actualizar todos los MFE):

| Clave | Contenido |
|---|---|
| `dece.accessToken` | JWT emitido por el identity-service |
| `dece.user` | `{ id, email, role, fullName, pictureUrl }` |

Solo el portal escribe la sesión (login). Los MFE la leen; sin sesión redirigen a `/login?next=<ruta actual>` y el portal los devuelve ahí después del login (solo rutas relativas: sin redirecciones abiertas).

### Roles

Cuatro roles globales, definidos en el identity-service y copiados en cada módulo: `ADMIN` (root), `PSYCHOLOGY_COORDINATOR`, `PSYCHOLOGIST`, `TEACHER`. Cada microservicio decide qué permite a cada rol (`@Roles(...)` en NestJS); los micro frontends solo ocultan opciones. Agregar un rol nuevo implica: enum + migración en identity y en cada módulo que lo proyecte, `ROLES` en `user.entity.ts`, y los tipos/etiquetas de los frontends.

### Eventos y notificaciones

Tutorías no envía correos: escribe **eventos de dominio** (`tutoring.scheduled`, `started`, `completed`, `auto_closed`, `report_submitted`, `cancelled`, `rescheduled`, `enrollments_added`) en la tabla `domain_events`, **en la misma transacción** que el cambio (outbox transaccional). Un worker los entrega cada 10 s a `POST notification-service/api/internal/events` con reintentos y espera creciente; si el servicio está caído, los eventos esperan en cola. El notification-service es idempotente (`processed_events`), decide destinatarios con una función pura (`domain/notification-plan.ts`, con tests) y registra cada correo en `email_logs`. Las rutas `/internal/**` se protegen con `INTERNAL_SERVICE_TOKEN` y el gateway las bloquea hacia afuera.

## 3. Arquitectura limpia (por microservicio)

El **identity-service** es la referencia de cómo se construye un servicio nuevo:

```
src/
  domain/            Entidades, value objects, errores y PUERTOS (interfaces). Sin dependencias externas.
    entities/user.entity.ts
    value-objects/institutional-email.ts
    ports/index.ts   UserRepository, AuthEventLog, GoogleIdentityVerifier, TokenService
  application/       Casos de uso: clases planas, sin Nest ni Prisma. Dependen solo de los puertos.
    use-cases/login.use-cases.ts, session.use-cases.ts, user-admin.use-cases.ts
  infrastructure/    ADAPTADORES que implementan los puertos: Prisma, google-auth-library, jose.
  presentation/      HTTP: controladores, DTOs, guards, filtro de errores de dominio → códigos HTTP.
  app.module.ts      Raíz de composición: el único lugar que conecta puertos con adaptadores.
```

Regla de dependencias: `presentation → application → domain ← infrastructure`. El dominio no importa nada de las capas externas; por eso los casos de uso se prueban con dobles de los puertos, sin base de datos ni red.

El **tutoring-service** conserva su organización modular original (módulos NestJS por agregado), ya probada en producción. La autenticación quedó aislada como adaptador (`modules/auth/identity-client.ts`). Se recomienda migrarlo a la estructura de capas de forma incremental, módulo por módulo, cuando se toque cada uno — no como una reescritura de golpe.

## 4. Metodología de desarrollo

- **Un módulo = un bounded context** (DDD): su propio micro frontend, su propio microservicio y su propio schema de base de datos. Nada de consultas cruzadas entre schemas: la comunicación es por HTTP o por los claims del JWT.
- **Entregas incrementales por módulo** (iterativo, estilo Scrum): cada módulo pasa por *Próximamente* en el portal → MVP → iteraciones. El portal ya muestra los módulos planificados con su alcance previsto.
- **Decisiones registradas** en `docs/decisiones.md` (una fila por decisión, con fecha y motivo).
- **Pruebas**: reglas de dominio y casos de uso con tests unitarios (Jest) en cada servicio; `npm test` en la raíz corre todos.
- **Despliegue independiente**: cada app/servicio tiene su `package.json`, su `Dockerfile` y su servicio en `docker-compose.prod.yml`; se reconstruye solo lo que cambió.
- **Convenciones**: código en inglés, textos de interfaz y documentación en español; errores de dominio con un `code` estable que el frontend puede interpretar.

## 5. Cómo agregar un módulo nuevo (ej. Citas)

1. **Microservicio** — copiar la estructura de `services/identity-service` (capas) en `services/appointments-service`, con su propio schema: `DATABASE_URL=...?schema=appointments`. Validar tokens con el mismo adaptador que usa tutorías (`identity-client.ts`: JWKS + introspección).
2. **Gateway** — agregar la ruta en `services/api-gateway/src/routes.js`: `{ prefix: '/api/citas', target: process.env.APPOINTMENTS_SERVICE_URL }`.
3. **Micro frontend** — nueva app Next.js en `apps/citas-mfe` con `basePath: '/citas'`, copiando `src/lib/session.ts` (contrato de sesión) y el `tailwind.config.ts` (sistema de diseño).
4. **Portal** — la ruta `/citas` ya existe como pantalla de próximo desarrollo. Agregar el rewrite `/citas/:path*` en `apps/portal-shell/next.config.js` **dentro de `beforeFiles`** (para que gane sobre esa página del portal) y en `src/lib/modules.ts` cambiar el módulo a `status: 'available'`, `zone: true`.
5. **Compose** — agregar el servicio y el MFE a `docker-compose.prod.yml` y al script `dev` del `package.json` raíz.
6. **Roles** — si el módulo necesita permisos finos, decidirlo en el propio microservicio a partir del rol global del JWT.
