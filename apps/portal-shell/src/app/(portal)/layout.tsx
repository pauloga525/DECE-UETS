'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { isDeceStaff } from '@/lib/modules';
import { PortalHeader } from '@/components/PortalHeader';
import { PortalSidebar } from '@/components/PortalSidebar';
import { Spinner } from '@/components/ui/EmptyState';

/**
 * Sistema DECE completo — solo para el equipo DECE (admin, coordinador, psicólogos).
 * Docentes y animadores trabajan únicamente en Tutorías: se los lleva directo al módulo.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const staff = isDeceStaff(user?.role);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(pathname === '/' ? '/login' : `/login?next=${encodeURIComponent(pathname)}`);
    } else if (!staff) {
      window.location.replace('/tutorias');
    }
  }, [user, loading, staff, router, pathname]);

  if (loading || !user || !staff) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <PortalHeader />
      <div className="flex flex-1 flex-col md:flex-row">
        <PortalSidebar />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
