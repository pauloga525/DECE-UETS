import type { Metadata } from 'next';
import { Sora, Public_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';

// Sección 9.1 del plan: Sora (encabezados/UI), Public Sans (texto/datos), IBM Plex Mono (cifras/códigos).
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', weight: ['500', '600', '700'] });
const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  weight: ['400', '500', '600'],
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Tutorías · DECE UETS',
  description: 'Módulo de Tutorías Académicas del sistema DECE — UETS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${sora.variable} ${publicSans.variable} ${ibmPlexMono.variable}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
