-- Regla 15, sección 4 del plan: audit_logs debe ser imborrable incluso ante un error de
-- aplicación. Prisma/TypeScript no puede garantizar esto por sí solo (el ORM nunca es la
-- última línea de defensa) — se aplica a nivel de motor de base de datos con un rol de
-- ejecución separado del rol que corre las migraciones (dueño de las tablas, con permisos
-- completos por defecto en Postgres).
--
-- Despliegue: el backend en ejecución debe conectarse con `tutorias_app`, no con el rol
-- de migraciones. Ver backend/.env.example (DATABASE_URL) vs. la variable de migración
-- que use el pipeline de CI/CD.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'tutorias_app') THEN
    CREATE ROLE tutorias_app LOGIN PASSWORD 'change-me-in-production';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO tutorias_app;

-- Todas las tablas: CRUD completo salvo audit_logs.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tutorias_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tutorias_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tutorias_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tutorias_app;

-- audit_logs: insert-only. Revoca explícitamente UPDATE/DELETE aunque ALL TABLES ya los
-- otorgó arriba — el orden importa, este REVOKE va después.
REVOKE UPDATE, DELETE ON audit_logs FROM tutorias_app;
GRANT SELECT, INSERT ON audit_logs TO tutorias_app;
