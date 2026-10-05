/**
 * Tabla de enrutamiento del gateway: un prefijo público por microservicio.
 *
 *   /api/identity/**  → identity-service  /api/**
 *   /api/tutorias/**  → tutoring-service  /api/**
 *
 * Para incorporar un módulo nuevo del DECE (solicitudes, citas, reportes...) basta con
 * agregar su entrada aquí — ver docs/arquitectura.md, "Cómo agregar un módulo".
 */
module.exports = [
  {
    name: 'identity-service',
    prefix: '/api/identity',
    target: process.env.IDENTITY_SERVICE_URL || 'http://localhost:4001',
    // Endpoints de login: limitar intentos por IP.
    rateLimit: { path: '/auth', windowMs: 60_000, limit: 30 },
  },
  {
    name: 'tutoring-service',
    prefix: '/api/tutorias',
    target: process.env.TUTORING_SERVICE_URL || 'http://localhost:4002',
  },
  {
    name: 'notification-service',
    prefix: '/api/notificaciones',
    target: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4003',
  },
  // Próximos módulos (aún no desarrollados):
  // { name: 'requests-service',     prefix: '/api/solicitudes', target: process.env.REQUESTS_SERVICE_URL },
  // { name: 'appointments-service', prefix: '/api/citas',       target: process.env.APPOINTMENTS_SERVICE_URL },
  // { name: 'reports-service',      prefix: '/api/reportes',    target: process.env.REPORTS_SERVICE_URL },
];
