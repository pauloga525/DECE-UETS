'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { findModule } from '@/lib/modules';
import { Spinner } from '@/components/ui/EmptyState';

/** Ruta antigua (/modulos/:id): redirige a la ruta propia de cada módulo. */
export default function LegacyModuleRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    const mod = findModule(id === 'casos' ? 'seguimiento' : id);
    if (mod?.zone) window.location.replace(mod.href);
    else router.replace(mod?.href ?? '/');
  }, [id, router]);
  return <Spinner />;
}
