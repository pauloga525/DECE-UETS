# Sistema DECE — UETS

Plataforma del Departamento de Consejería Estudiantil. El sistema de tutorías académicas es su **primer módulo**; los demás (solicitudes, citas, expedientes, seguimiento de casos, reportes) ya aparecen en el portal como *Próximamente*.

- Arquitectura (micro frontends, microservicios, arquitectura limpia, cómo agregar un módulo): [`docs/arquitectura.md`](docs/arquitectura.md)
- Login con Google `@uets.edu.ec`: [`docs/guia-google-oauth.md`](docs/guia-google-oauth.md)
- Instalar, compilar y desplegar: [`docs/guia-despliegue.md`](docs/guia-despliegue.md)
- Decisiones de alcance: [`docs/decisiones.md`](docs/decisiones.md) · Casos de uso de tutorías: [`docs/casos-de-uso.md`](docs/casos-de-uso.md)

## Estructura

```
apps/
  portal-shell/          Portal DECE (Next.js): login Google, catálogo de módulos, usuarios — host de los MFE
  tutorias-mfe/          Micro frontend de Tutorías (Next.js, basePath /tutorias)
services/
  api-gateway/           Entrada única a los microservicios (/api/identity, /api/tutorias)
  identity-service/      Identidad: login Google, roles, JWT RS256 (NestJS, arquitectura limpia)
  tutoring-service/      Módulo de tutorías (NestJS + Prisma)
  notification-service/  Correos (solo envío, noreply@uets.edu.ec), invitaciones de calendario y campana
docs/                    Arquitectura, guías, decisiones, casos de uso
legacy/                  Código retirado (login por contraseña) — se puede borrar
docker-compose.yml       Solo PostgreSQL, para desarrollo
docker-compose.prod.yml  Todo el sistema, para el servidor
```

## Arranque rápido (desarrollo)

```bash
docker compose up -d postgres
npm run install:all
cp services/identity-service/.env.example services/identity-service/.env
cp services/tutoring-service/.env.example services/tutoring-service/.env
cp services/api-gateway/.env.example services/api-gateway/.env
npm run db:setup     # migraciones + importa los usuarios existentes de tutorías a identidad
npm run dev
```

Base nueva y vacía: en lugar de `db:setup`, `npm run db:migrate && npm run db:seed` (datos de ejemplo).

Abrir **http://localhost:3100** (el portal; los módulos y la API se sirven a través de él).

Sin `GOOGLE_CLIENT_ID` configurado, el login ofrece un **acceso de desarrollo** (`DEV_LOGIN_ENABLED=true`, nunca en producción) que **lista los usuarios activos de la base de datos** para entrar con un clic, con su rol. Usuarios de ejemplo del seed: `admin@uets.edu.ec` (Admin), `dece@uets.edu.ec` (Psicóloga), `carlos@uets.edu.ec` (Docente). Las migraciones cargan además las cuentas reales iniciales (ver roles abajo). Para tu cuenta real: `npm --prefix services/identity-service run create-admin -- tu.correo@uets.edu.ec`.

Documentación Swagger: `http://localhost:4001/api/docs` (identidad), `http://localhost:4002/api/docs` (tutorías) y `http://localhost:4003/api/docs` (notificaciones).

Carga de alumnos reales (Excel limpio de secretaría, hoja "Alumnos"): `npm --prefix services/tutoring-service run import:alumnos -- "ruta\Alumnos_limpio.xlsx"` simula; agrega `--apply` para cargar. Es idempotente (se puede repetir con un Excel actualizado).

Datos de prueba de representantes: `npm --prefix services/tutoring-service run seed:test-guardians` (quitar con `-- --remove`). Verificar las credenciales SMTP sin enviar nada: `npm --prefix services/notification-service run mail:verify`.

> **Base de datos existente con datos:** `npm run db:setup` copia los usuarios de tutorías al identity-service conservando sus IDs **antes** de aplicar la migración de tutorías que elimina las contraseñas. Hacé un respaldo antes (`docker exec tutorias-postgres pg_dump -U tutorias -d tutorias_dev > backups/respaldo.sql`). Producción: guía de despliegue, sección 7.

> **Nota de seguridad (regla 15):** la migración `audit_log_insert_only` crea el rol `tutorias_app` sin `UPDATE`/`DELETE` sobre `audit_logs`. En producción, el tutoring-service se conecta con ese rol.

## Roles

| Rol | Código | Cuentas iniciales |
|---|---|---|
| Administrador / root | `ADMIN` | pauloga@uets.edu.ec |
| Coordinador de psicólogos | `PSYCHOLOGY_COORDINATOR` | davidua@uets.edu.ec |
| Psicólogo(a) | `PSYCHOLOGIST` | anait@uets.edu.ec, andreaam@uets.edu.ec |
| Docente | `TEACHER` | jheisonzl@uets.edu.ec |
| Animador de curso | `ANIMATOR` | — (asignar en Tutorías → Niveles, paralelos y animadores) |

Se asignan y modifican en el portal → **Usuarios y roles** (solo el admin). Siempre debe quedar al menos un admin activo.

## Estado de avance por fase

- [x] **Ajustes de tutorías** (2026-10-05): cupo 10, tutorías con alumnos de varios paralelos del nivel, lugar declarado en *Mi horario*, lista de asistencia con casillas al iniciar y al finalizar (correos asistió/ausente), Registro de tutorías por alumno (por materia + total, Excel). Prueba E2E: `scripts/fase-e-e2e.js`.
- [x] **Docentes reales y animadores** (2026-10-05): 209 docentes, 108 materias, 753 asignaciones con sus paralelos y 117 animadores cargados con `npm --prefix services/tutoring-service run import:docentes -- "C:utaDocentes_limpio.xlsx" --apply`. El docente solo agenda alumnos de sus paralelos; *Mis alumnos* (docente) y *Mi curso (animador)* con pendientes, asistencia y faltas, solo consulta. Prueba E2E: `scripts/fase-f-e2e.js`.

- [x] **Carga de datos reales** (2026-10-02): 4 195 alumnos, 28 niveles (EGB 1.º–10.º y bachillerato por especialidad), 117 cursos con paralelo y 6 731 representantes desde el Excel de secretaría (`scripts/import-alumnos.ts`).

- [x] **Sistema DECE por rol** (2026-09-30): docentes y animadores entran directo a Tutorías; el equipo DECE (admin, coordinador, psicólogos) ve el sistema completo con menú lateral. Módulos Citas, Seguimiento de casos, Solicitudes, Expedientes y Reportes DECE creados con ruta propia y pantalla de próximo desarrollo.

- [x] **Animador, representantes, correos y agenda** (2026-09-30): rol Animador por curso; representantes (datos de prueba, falta importar el Excel real); notification-service con correos desde noreply@uets.edu.ec (sin respuesta), invitación de Google Calendar a docente y representantes, avisos de faltas y cierre al DECE (correo + campana); agenda tipo Google Calendar. En desarrollo los correos se simulan (`MAIL_MODE=log`, archivos en `services/notification-service/mail-outbox/`).
- [x] **Mejoras de tutorías — Fase A** (2026-09-30): docente agenda sus propias tutorías y sube su horario (*Mi horario*), lugar obligatorio, reglas de inicio (horario y una sola en curso), toma de lista, informe de cierre (destrezas/observaciones/tareas), cierre automático a los 40 min, cronómetro con alarma. Pendiente: rol Animador (definir permisos), Fase B (representantes), Fase C (correos + invitaciones de Google Calendar), Fase D (agenda tipo Google Calendar). Plan completo en el historial del proyecto.

- [x] **Plataforma DECE** (2026-09-28) — Portal con micro frontends, API Gateway, identity-service con login Google restringido a `@uets.edu.ec` (sin `.est`), tutorías convertido en módulo/microservicio. Módulos solicitudes, citas, expedientes, casos y reportes: planificados, visibles como *Próximamente*.

- [x] **Fase 0** — Modelo ER/Prisma completo, casos de uso, Docker Compose, CI. Decisiones de la sección 14 resueltas (paralelos obligatorios, sin multinivel, una sola institución).
- [x] **Fase 1** — Auth JWT + RBAC, CRUD académico (períodos/niveles/paralelos/materias), docentes, estudiantes, `TeacherAssignment`.
- [x] **Fase UX (parcial)** — Sistema de diseño implementado en código (paleta, tipografías Sora/Public Sans/IBM Plex Mono, componentes: Button/Input/Select/Badge/Card/Modal/EmptyState), navegación completa (sección 9.2) con RBAC. 21 pantallas conectadas al backend real, incluidas Reportes, Auditoría e Historial del estudiante. Probado en navegador contra la API real con los 3 roles (Admin/DECE/Docente). Falta: pulido visual fino frente a los mockups de alta fidelidad entregados aparte (`tutorias-dece-ux_1.html`).
- [x] **Fase 2** — Motor de agenda: `TeacherAvailabilityRule` colgando de `TeacherAssignment` (el horario es por materia+nivel, no genérico — cambio de lógica del 2026-09-04, ver `docs/decisiones.md`), worker de proyección, flujo de creación de tutoría (5 pasos — el DECE ya no elige materia/nivel), bloqueo pesimista **verificado bajo concurrencia real** (`npm run test:concurrency`).
- [x] **Fase 3** — Máquina de estados (`start`/`complete`/`cancel`/`reschedule`), registro de asistencia, cancelación no destructiva, reprogramación con revalidación completa, lista de espera con promoción automática. Probado extremo a extremo contra Postgres real, incluyendo por UI (login → generar disponibilidad → crear tutoría → iniciar → registrar asistencia → completar).
- [ ] **Fase 4** — Webhooks de dominio + n8n. Sin construir: el core aún no emite eventos de dominio.
- [x] **Fase 5** — Reportes (`GET /reports/summary|by-month|by-subject|by-teacher|export.csv`, filtrables por período/docente/materia/nivel) e historial completo por estudiante (`GET /students/:id/history`), con pantallas propias en el frontend. Además, lectura de auditoría (`GET /audit-logs`, pantalla 25) — no listada en el plan como parte de esta fase, pero completa un endpoint que las fases anteriores solo escribían. Pendiente: exportación a PDF (se implementó CSV, compatible con Excel).
