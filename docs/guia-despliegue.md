# Guía de ejecución y despliegue

## Arquitectura en una línea

```
Navegador → [Nginx HTTPS en prod] → portal-shell (127.0.0.1:3001 prod / :3100 dev)
              ├─ /tutorias/** → tutorias-mfe
              └─ /api/**      → api-gateway → identity-service (schema identity)
                                            → tutoring-service (schema public) → PostgreSQL
```

Solo el portal se publica. Los micro frontends y la API se sirven a través de él (mismo origen: una sola sesión, sin CORS). Detalle en [`arquitectura.md`](arquitectura.md).

Los rewrites del portal (`TUTORIAS_MFE_URL`, `API_GATEWAY_URL`) quedan fijados **al construir** la imagen del portal. El Client ID de Google, en cambio, se lee en tiempo de ejecución.

---

## 1. Requisitos previos

| Herramienta | Versión mínima | Para qué |
|---|---|---|
| [Node.js](https://nodejs.org/) | 20.x (22+ recomendado en dev) | Correr apps y servicios en desarrollo |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) / Docker Engine + Compose | reciente | PostgreSQL en desarrollo; todo el sistema en producción |
| Git | cualquiera | Versionar |

En el servidor no hace falta Node.js: todo el build ocurre dentro de las imágenes.

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # cerrá sesión y volvé a entrar
sudo apt-get install -y git
```

---

## 2. Desarrollo local

```bash
docker compose up -d postgres          # solo la base de datos
npm run install:all                    # instala raíz + las 5 apps/servicios
cp services/identity-service/.env.example services/identity-service/.env
cp services/tutoring-service/.env.example services/tutoring-service/.env
cp services/api-gateway/.env.example    services/api-gateway/.env
cp services/notification-service/.env.example services/notification-service/.env   # completar SMTP_PASS e INTERNAL_SERVICE_TOKEN (mismo valor en identity y tutoring)
npm run db:setup                       # migraciones + importa usuarios existentes de tutorías a identidad
# (base vacía: npm run db:migrate && npm run db:seed para datos de ejemplo)
npm run dev                            # levanta los 6 procesos con recarga automática
```

Abrir **http://localhost:3100**.

| Proceso | URL |
|---|---|
| Portal | http://localhost:3100 |
| MFE Tutorías (directo, sin sesión compartida) | http://localhost:3101/tutorias |
| API Gateway | http://localhost:4000/health |
| Identity service (Swagger) | http://localhost:4001/api/docs |
| Tutoring service (Swagger) | http://localhost:4002/api/docs |
| Notification service (Swagger) | http://localhost:4003/api/docs |

**Correos en desarrollo:** fuera de producción (`NODE_ENV` distinto de `production`) **nunca se envían correos**, aunque el `.env` diga `MAIL_MODE=send` o `redirect`: el servicio fuerza el modo `log` y lo avisa al arrancar. Cada correo queda como archivo `.eml` en `services/notification-service/mail-outbox/` (se abre con Outlook/Thunderbird). Para una prueba de envío controlada, a una sola dirección: `npm --prefix services/notification-service run mail:test -- tu.correo@uets.edu.ec`.

**Login en desarrollo**: sin `GOOGLE_CLIENT_ID`, el *acceso de desarrollo* muestra los usuarios activos leídos de la base de datos (`GET /api/identity/auth/dev-users`, deshabilitado en producción); elegí uno para entrar con su rol. Para probar Google de verdad, seguí [`guia-google-oauth.md`](guia-google-oauth.md).

Nuevas migraciones de un servicio: `npm --prefix services/<servicio> run prisma:migrate` (crea y aplica en dev).

Verificar que todo compila para producción:

```bash
npm test                                          # tests de ambos servicios
npm --prefix services/identity-service run build
npm --prefix services/tutoring-service run build
npm --prefix apps/portal-shell run build
npm --prefix apps/tutorias-mfe run build
```

> Los `next build` usan la misma carpeta `.next` que `next dev`: detené `npm run dev` antes de compilar.

---

## 3. Despliegue en el servidor (producción)

### 3.1 Primer despliegue

```bash
git clone <url-del-repo>
cd "desarrollos UETS"
cp .env.prod.example .env
```

Completá `.env`:

- `DB_OWNER_PASSWORD` y el mismo password dentro de `IDENTITY_DATABASE_URL` (`openssl rand -base64 32`).
- `GOOGLE_CLIENT_ID` (ver [`guia-google-oauth.md`](guia-google-oauth.md)); agregá el dominio público a los orígenes autorizados.
- `JWT_PRIVATE_KEY`: `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 | awk '{printf "%s\\n", $0}'` y pegá la salida (una sola línea).
- `PUBLIC_URL`: URL pública del portal.
- `TUTORING_DATABASE_URL`: dejalo con el password por defecto de `tutorias_app` por ahora (se corrige en 3.3).

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d postgres
```

Migraciones de tutorías (crean tablas **y** el rol restringido `tutorias_app`; se corren con el rol dueño):

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -e DATABASE_URL="postgresql://tutorias:<DB_OWNER_PASSWORD>@postgres:5432/tutorias_prod?schema=public" \
  tutoring-service npx prisma migrate deploy
```

El identity-service aplica sus propias migraciones al arrancar.

### 3.2 Levantar todo

```bash
docker compose -f docker-compose.prod.yml up -d
curl -s http://localhost:4000/health                      # gateway (solo desde el servidor)
curl -s -o /dev/null -w "portal: %{http_code}\n" http://localhost:3001/login
```

### 3.3 Asegurar el rol `tutorias_app` (una vez)

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U tutorias -d tutorias_prod \
  -c "ALTER ROLE tutorias_app WITH PASSWORD '<password-fuerte>';"
```

Actualizá `TUTORING_DATABASE_URL` en `.env` y `docker compose -f docker-compose.prod.yml up -d tutoring-service`.

### 3.4 Primer administrador

```bash
docker compose -f docker-compose.prod.yml run --rm identity-service \
  node dist/scripts/create-admin.js nombre.apellido@uets.edu.ec
```

Esa persona entra con Google y habilita al resto en **Usuarios y roles**. Ya no hay contraseñas en el sistema.

### 3.5 Publicar en la red local con nip.io y certificado propio

Dirección del sistema: **`https://dece.192-168-200-31.nip.io`** (servidor `192.168.200.31`, solo red local).

- **No hace falta un DNS propio.** [nip.io](https://nip.io) es un DNS público de comodín: `dece.192-168-200-31.nip.io` resuelve a `192.168.200.31` en cualquier equipo con internet. El prefijo (`dece`) es libre; la parte de la IP no.
- **HTTPS es obligatorio**: el login con Google solo acepta orígenes `https://` (salvo `localhost`). Como el servidor no es accesible desde internet, Let's Encrypt no sirve; se usa una **CA interna** (`DECE-UETS-CA`) que cada equipo instala una vez.
- Solo se publica el portal (`127.0.0.1:3001`); él reenvía `/tutorias/**` y `/api/**`. Nginx solo termina el HTTPS.

**1. Comprobar el servidor**

```bash
docker --version && docker compose version && nginx -v
sudo ss -ltnp | grep -E ':(80|443|3001|4000|5432) '
```

Si 3001, 4000 o 5432 ya los usa otro servicio, cambia `PORTAL_PORT`, `GATEWAY_PORT` o `DB_PORT` en `.env` (y el `proxy_pass` de `deploy/nginx/dece.conf` si cambias `PORTAL_PORT`).

**2. `.env` y stack** — en `.env`: `PUBLIC_URL=https://dece.192-168-200-31.nip.io` y, para la primera prueba, `MAIL_MODE=redirect` + `MAIL_REDIRECT_TO=<tu correo>`. Luego `docker compose -f docker-compose.prod.yml up -d --build` y `curl -I http://127.0.0.1:3001` (debe responder).

**3. Certificado**

```bash
sudo bash deploy/certs/generar-certificados.sh dece.192-168-200-31.nip.io
```

Crea la CA en `/etc/dece-ca/` (la clave nunca sale de ahí) y deja en `/etc/nginx/certs/dece/` el certificado del sitio y `DECE-UETS-CA.crt` para repartir. Volver a correrlo renueva el certificado (válido 825 días) con la misma CA.

**4. Nginx**

```bash
sudo cp deploy/nginx/dece.conf /etc/nginx/sites-available/dece.conf
sudo ln -s /etc/nginx/sites-available/dece.conf /etc/nginx/sites-enabled/dece.conf
sudo nginx -t && sudo systemctl reload nginx
sudo ufw allow 80,443/tcp   # si el servidor usa ufw
```

Los otros sitios del servidor no se tocan: Nginx los distingue por `server_name`.

**5. Google Cloud** — en el Client ID, agrega `https://dece.192-168-200-31.nip.io` a *Orígenes de JavaScript autorizados* (ver [`guia-google-oauth.md`](guia-google-oauth.md)).

**6. Instalar la CA en cada equipo (una sola vez)** — se descarga desde `http://dece.192-168-200-31.nip.io/ca.crt`:

| Equipo | Cómo |
|---|---|
| Windows (Chrome/Edge) | Doble clic en `DECE-UETS-CA.crt` → *Instalar certificado* → *Equipo local* → *Colocar en*: **Entidades de certificación raíz de confianza**. En un dominio de Windows se reparte por GPO. |
| macOS | Abrir el archivo → *Llavero del sistema* → doble clic en el certificado → *Confiar* → *Confiar siempre*. |
| Firefox | *Ajustes → Privacidad y seguridad → Certificados → Ver certificados → Autoridades → Importar* → marcar "Confiar para identificar sitios web". |
| Android | *Ajustes → Seguridad → Cifrado y credenciales → Instalar certificado → Certificado de CA*. |
| iPhone/iPad | Abrir el enlace en Safari → instalar el perfil en *Ajustes* → *General → Información → Ajustes de confianza de certificados* → activar `DECE-UETS-CA`. |

Sin la CA instalada, el navegador muestra "La conexión no es privada" (es lo esperado).

**7. Datos** — la base de producción nace vacía: crea el primer administrador (3.4) y carga alumnos y docentes, o restaura un volcado de la base de desarrollo.

**Si `nslookup dece.192-168-200-31.nip.io` no responde en algún equipo**: el router o el DNS interno bloquea nombres públicos que apuntan a IPs privadas (protección *DNS rebinding*). Pide a TI que permita `nip.io` o que cree ese nombre en el DNS interno; como último recurso, agrega `192.168.200.31 dece.192-168-200-31.nip.io` al archivo `hosts` del equipo.

**Con un dominio institucional** (p. ej. `dece.uets.edu.ec`) el procedimiento es el mismo: cambia `server_name`, `PUBLIC_URL` y el origen en Google, y usa ese nombre al generar el certificado.

### 3.6 Conectarte con DBeaver

**Local**: `localhost:5432`, base `tutorias_dev`, usuario/contraseña `tutorias`/`tutorias`. Los datos de identidad están en el schema `identity`; los de tutorías en `public`.

**Servidor**: Postgres se publica solo en `127.0.0.1:5432`. En DBeaver, conexión PostgreSQL con host `localhost:5432`, base `DB_NAME`, usuario `DB_OWNER_USER`, y en la pestaña **SSH** activá *Use SSH Tunnel* con las credenciales del servidor. O a mano: `ssh -L 5432:localhost:5432 usuario@tu-servidor`.

---

## 4. Actualizar el servidor (día a día)

```bash
git pull
```

| Cambiaste... | Comando |
|---|---|
| `apps/portal-shell/**` | `docker compose -f docker-compose.prod.yml up -d --build portal-shell` |
| `apps/tutorias-mfe/**` | `docker compose -f docker-compose.prod.yml up -d --build tutorias-mfe` |
| `services/identity-service/**` (incluidas migraciones: se aplican al arrancar) | `docker compose -f docker-compose.prod.yml up -d --build identity-service` |
| `services/tutoring-service/**` | `docker compose -f docker-compose.prod.yml up -d --build tutoring-service` |
| `services/tutoring-service/prisma/migrations/**` | Ver 4.1 |
| `services/api-gateway/**` | `docker compose -f docker-compose.prod.yml up -d --build api-gateway` |
| `services/notification-service/**` (migraciones incluidas: se aplican al arrancar) | `docker compose -f docker-compose.prod.yml up -d --build notification-service` |
| Varios | `docker compose -f docker-compose.prod.yml up -d --build` |

### 4.1 Migración nueva de tutorías

```bash
docker compose -f docker-compose.prod.yml up -d --build tutoring-service
docker compose -f docker-compose.prod.yml run --rm \
  -e DATABASE_URL="postgresql://tutorias:<DB_OWNER_PASSWORD>@postgres:5432/tutorias_prod?schema=public" \
  tutoring-service npx prisma migrate deploy
docker compose -f docker-compose.prod.yml restart tutoring-service
```

---

## 5. Referencia rápida

```bash
# Local
docker compose up -d postgres
npm run dev
npm run db:migrate && npm run db:seed
npm test
npm --prefix services/identity-service run create-admin -- correo@uets.edu.ec

# Servidor
docker compose -f docker-compose.prod.yml up -d [--build] [servicio]
docker compose -f docker-compose.prod.yml logs -f [servicio]
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml down            # conserva los datos
```

---

## 6. Problemas comunes

**"El inicio de sesión con Google aún no está configurado"** — falta `GOOGLE_CLIENT_ID` en el identity-service.

**El botón de Google dice "origin not allowed" / no abre el popup** — el origen del portal (esquema + dominio + puerto, sin ruta) no está en *Orígenes de JavaScript autorizados* del Client ID.

**"Tu cuenta institucional no está habilitada"** — la cuenta no fue creada en *Usuarios y roles*. Es intencional (acceso por invitación).

**"Cuenta inconsistente entre servicios"** — un usuario viejo de tutorías con el mismo correo pero otro id. Ejecutar la importación de la sección 7.

**`502 Servicio no disponible: identity-service`** — el gateway no alcanza el servicio; revisar `docker compose ... logs identity-service`.

**`JWT_PRIVATE_KEY es obligatoria en producción`** — definirla en `.env` (sección 3.1). En desarrollo se genera sola en `services/identity-service/.keys/`.

**Tras un logout, otro módulo acepta el token unos segundos** — esperado: la validación se cachea hasta 30 s (`IDENTITY_SESSION_CACHE_TTL_MS`).

**`EADDRINUSE`** — otro proceso usa el puerto (3100, 3101, 4000-4002). `netstat -ano | findstr :4000` (Windows) o `lsof -i :4000`.

**Backups** — el volumen `postgres_data` no protege de un disco dañado. Mínimo:

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U tutorias tutorias_prod > backup-$(date +%F).sql
```

(incluye los schemas `public` e `identity`).

---

## 7. Migrar una instalación existente (monolito con contraseñas → plataforma DECE)

Si el servidor ya corre la versión anterior con datos reales:

1. **Backup** (sección 6).
2. `git pull`, completar las variables nuevas del `.env` (sección 3.1) y `docker compose -f docker-compose.prod.yml build`.
3. Levantar el identity-service (crea el schema `identity`): `docker compose -f docker-compose.prod.yml up -d identity-service`.
4. **Importar los usuarios existentes conservando sus IDs** (los estudiantes y correos fuera de `@uets.edu.ec` se omiten):

   ```bash
   docker compose -f docker-compose.prod.yml run --rm \
     -e TUTORING_DATABASE_URL="postgresql://tutorias:<DB_OWNER_PASSWORD>@postgres:5432/tutorias_prod?schema=public" \
     identity-service node dist/scripts/import-tutoring-users.js
   ```

5. Aplicar la migración de tutorías `identity_service_projection` (elimina `passwordHash` y `tokenVersion` de `users`) con el comando de la sección 4.1.
6. `docker compose -f docker-compose.prod.yml up -d` y retirar los contenedores viejos (`backend`/`frontend`) si siguen corriendo.

Las contraseñas anteriores dejan de existir: cada usuario entra con su cuenta de Google del mismo correo.
