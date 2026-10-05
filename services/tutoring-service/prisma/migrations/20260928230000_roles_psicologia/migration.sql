-- Espeja los roles del identity-service: DECE se reemplaza por PSYCHOLOGY_COORDINATOR y
-- PSYCHOLOGIST. Los usuarios DECE de la proyección local pasan a PSYCHOLOGIST (el rol real
-- se vuelve a sincronizar desde identity en su próximo request autenticado).

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST', 'TEACHER', 'STUDENT');
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole"
  USING (CASE "role"::text WHEN 'DECE' THEN 'PSYCHOLOGIST' ELSE "role"::text END)::"UserRole";
DROP TYPE "UserRole_old";
