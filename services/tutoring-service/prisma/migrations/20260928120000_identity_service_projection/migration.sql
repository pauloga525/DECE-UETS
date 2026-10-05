-- El login y las credenciales pasan al identity-service (login con Google @uets.edu.ec).
-- La tabla users de tutorías queda como proyección local (id/email/rol/activo) que se
-- sincroniza sola en cada request autenticado.
--
-- ANTES de aplicar en una base con datos: ejecutar en identity-service
--   npm run import:tutoring-users
-- para copiar los usuarios con sus mismos ids (esa importación lee solo id/email/role/isActive,
-- que esta migración conserva, así que también funciona después).

ALTER TABLE "users" DROP COLUMN "passwordHash";
ALTER TABLE "users" DROP COLUMN "tokenVersion";
