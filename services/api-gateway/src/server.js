const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const routes = require('./routes');

const PORT = Number(process.env.PORT || 4000);
// Orígenes de navegador permitidos (lista separada por comas). El portal normalmente llama
// al gateway a través de su propio origen (rewrite de Next.js), así que CORS solo aplica a
// clientes que llamen al gateway directamente.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3100')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const app = express();
app.disable('x-powered-by');
// Detrás del portal/proxy inverso: necesario para que el rate limit vea la IP real.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CORS_ORIGINS, credentials: false }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// Los endpoints servicio-a-servicio (/internal/**) nunca se exponen hacia afuera.
const INTERNAL_PATH = /^\/api\/[^/]+\/internal(\/|$)/i;
app.use((req, res, next) => {
  if (INTERNAL_PATH.test(req.path)) {
    return res.status(404).json({ statusCode: 404, message: 'Ruta no encontrada' });
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', routes: routes.map((r) => r.prefix) });
});

for (const route of routes) {
  if (!route.target) continue;

  if (route.rateLimit) {
    app.use(
      route.prefix + route.rateLimit.path,
      rateLimit({
        windowMs: route.rateLimit.windowMs,
        limit: route.rateLimit.limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { statusCode: 429, message: 'Demasiados intentos. Espera un momento.' },
      }),
    );
  }

  app.use(
    route.prefix,
    createProxyMiddleware({
      // Express quita el prefijo montado: /api/tutorias/students → <target>/api/students
      target: `${route.target.replace(/\/$/, '')}/api`,
      changeOrigin: true,
      xfwd: true,
      proxyTimeout: 30_000,
      on: {
        error: (err, _req, res) => {
          // En Node 20+ un ECONNREFUSED llega como AggregateError con message vacío.
          console.error(`[${route.name}] ${err.code || err.message || err.name}`);
          if (res && !res.headersSent && typeof res.status === 'function') {
            res.status(502).json({ statusCode: 502, message: `Servicio no disponible: ${route.name}` });
          }
        },
      },
    }),
  );
}

app.use((_req, res) => res.status(404).json({ statusCode: 404, message: 'Ruta no encontrada' }));

app.listen(PORT, () => {
  console.log(`api-gateway escuchando en :${PORT}`);
  for (const r of routes) console.log(`  ${r.prefix.padEnd(18)} → ${r.target}`);
});
