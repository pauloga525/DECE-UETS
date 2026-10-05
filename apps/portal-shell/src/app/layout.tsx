import type { Metadata } from 'next';
import { Sora, Public_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';

// Mismo sistema de diseño que los micro frontends (tailwind.config.ts compartido por copia).
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
  title: 'Sistema DECE · UETS',
  description: 'Departamento de Consejería Estudiantil — Unidad Educativa UETS',
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
