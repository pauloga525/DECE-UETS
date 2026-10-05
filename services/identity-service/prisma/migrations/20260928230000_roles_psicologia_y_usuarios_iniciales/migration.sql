-- Roles de la plataforma DECE: el rol genérico DECE se reemplaza por
-- PSYCHOLOGY_COORDINATOR (coordinador de psicólogos) y PSYCHOLOGIST (psicólogo).
-- Los usuarios DECE existentes pasan a PSYCHOLOGIST. Sus tokens (con role=DECE en los
-- claims) dejan de validar solos, así que deberán volver a iniciar sesión.

ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST', 'TEACHER');
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "Role"
  USING (CASE "role"::text WHEN 'DECE' THEN 'PSYCHOLOGIST' ELSE "role"::text END)::"Role";
DROP TYPE "Role_old";

-- Listado inicial de cuentas entregado por Paulo González (2026-09-28). Se aplica una sola
-- vez (como toda migración); desde ahí, los roles se administran en el portal
-- (Usuarios y roles). Si la cuenta ya existía, se le asigna el rol indicado y se reactiva.
INSERT INTO "users" ("id", "email", "role", "isActive", "tokenVersion", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'pauloga@uets.edu.ec',   'ADMIN',                  true, 0, now(), now()),
  (gen_random_uuid()::text, 'davidua@uets.edu.ec',   'PSYCHOLOGY_COORDINATOR', true, 0, now(), now()),
  (gen_random_uuid()::text, 'anait@uets.edu.ec',     'PSYCHOLOGIST',           true, 0, now(), now()),
  (gen_random_uuid()::text, 'andreaam@uets.edu.ec',  'PSYCHOLOGIST',           true, 0, now(), now()),
  (gen_random_uuid()::text, 'jheisonzl@uets.edu.ec', 'TEACHER',                true, 0, now(), now())
ON CONFLICT ("email") DO UPDATE
  SET "role" = EXCLUDED."role",
      "isActive" = true,
      "tokenVersion" = "users"."tokenVersion" + 1,
      "updatedAt" = now();
