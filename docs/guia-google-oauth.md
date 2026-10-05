# Configurar el login con Google (@uets.edu.ec)

El identity-service necesita un **Client ID OAuth 2.0** de Google Cloud. Sin él, la pantalla de login muestra un aviso y solo funciona el acceso de desarrollo (si está habilitado).

## 1. Crear el Client ID

Con una cuenta administradora del Google Workspace de la institución:

1. Entrar a [Google Cloud Console](https://console.cloud.google.com/) y crear (o elegir) un proyecto, ej. `sistema-dece`.
2. **APIs y servicios → Pantalla de consentimiento OAuth**:
   - Tipo de usuario: **Interno**. Esto hace que Google solo permita cuentas del Workspace `uets.edu.ec` — una capa extra, además de las validaciones del servidor.
   - Nombre de la app: `Sistema DECE`; correo de asistencia: el del área de sistemas.
   - Alcances: los básicos (`openid`, `email`, `profile`). No se necesita ningún otro.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - **Orígenes de JavaScript autorizados** (el origen del portal, sin ruta ni barra final):
     - `http://localhost:3100` (desarrollo)
     - `https://dece.uets.edu.ec` (o el dominio real de producción)
   - URIs de redireccionamiento: no hacen falta (se usa el modo *popup*).
4. Copiar el **ID de cliente** (`xxxx.apps.googleusercontent.com`). No se necesita el *secreto de cliente*.

## 2. Configurarlo

- **Desarrollo**: `services/identity-service/.env` → `GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"` y reiniciar el servicio.
- **Producción**: `.env` de la raíz → `GOOGLE_CLIENT_ID=...` y `docker compose -f docker-compose.prod.yml up -d identity-service`.

El portal lee el Client ID en tiempo de ejecución (`GET /api/identity/auth/config`), así que **no** hace falta reconstruir los frontends al cambiarlo.

## 3. Dar el primer acceso

Nadie entra sin estar habilitado. Crear el primer administrador con tu cuenta real:

```bash
# desarrollo
cd services/identity-service
npm run create-admin -- nombre.apellido@uets.edu.ec
```

```bash
# producción
docker compose -f docker-compose.prod.yml run --rm identity-service node dist/scripts/create-admin.js nombre.apellido@uets.edu.ec
```

Desde el portal, ese administrador habilita al resto en **Usuarios y roles**.

## 4. Qué se rechaza y por qué

| Caso | Resultado |
|---|---|
| `alguien@gmail.com` | Rechazado: sin claim `hd` del Workspace y dominio distinto |
| `alguien@alumnos.uets.edu.ec`, `x@uets.edu.ec.otro.com` | Rechazado: el dominio debe ser exactamente `uets.edu.ec` |
| `nombre.apellido.est@uets.edu.ec` | Rechazado: cuenta de estudiante |
| `docente@uets.edu.ec` no habilitado | Rechazado: debe pedir acceso al administrador |
| Cuenta desactivada | Rechazado |
| Mismo correo, otra cuenta de Google (recreada en Workspace) | Rechazado hasta que un admin intervenga |

## 5. Acceso de desarrollo (sin Google)

Con `DEV_LOGIN_ENABLED=true` en `services/identity-service/.env`, el login muestra un formulario para entrar solo con el correo (aplicando las mismas reglas de dominio y registro). Sirve para desarrollo y pruebas automatizadas. **Se ignora siempre con `NODE_ENV=production`**, aunque la variable esté puesta.
