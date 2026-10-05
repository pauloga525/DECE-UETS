/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Empaqueta un server Node autocontenido en .next/standalone — necesario para
  // que el Dockerfile de producción no tenga que copiar node_modules completo.
  output: 'standalone',
  // Micro frontend (Next.js Multi-Zones): toda la app, incluidos sus assets /_next, vive
  // bajo /tutorias. El portal DECE (apps/portal-shell) reenvía /tutorias/** a esta app, así
  // que el usuario siempre navega en un único origen y comparte la sesión del portal.
  basePath: '/tutorias',
};

module.exports = nextConfig;
