/**
 * Portal DECE — aplicación "host" de los micro frontends (Next.js Multi-Zones).
 *
 * El usuario solo ve este origen. El portal reenvía:
 *   /tutorias/**  → micro frontend de Tutorías (apps/tutorias-mfe, basePath /tutorias)
 *   /api/**       → API Gateway (services/api-gateway), que enruta a cada microservicio
 *
 * Un único origen significa: una sola sesión (localStorage compartido), sin CORS, y
 * cada micro frontend se despliega por separado. Para sumar un módulo nuevo, agregar su
 * zona aquí y registrarlo en src/lib/modules.ts.
 *
 * Las URLs se leen al construir (next build las fija en el manifiesto de rutas).
 */
const TUTORIAS_MFE_URL = process.env.TUTORIAS_MFE_URL || 'http://localhost:3101';
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_GATEWAY_URL}/api/:path*` },
      { source: '/tutorias', destination: `${TUTORIAS_MFE_URL}/tutorias` },
      { source: '/tutorias/:path*', destination: `${TUTORIAS_MFE_URL}/tutorias/:path*` },
    ];
  },
};

module.exports = nextConfig;
