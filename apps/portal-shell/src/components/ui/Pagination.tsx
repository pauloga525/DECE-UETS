'use client';

import { useEffect, useState } from 'react';
import { Button } from './Button';

export const DEFAULT_PAGE_SIZE = 20;

/**
 * Paginación en el navegador para listas ya cargadas. Vuelve a la primera página cuando cambia
 * la cantidad de elementos (p. ej. al filtrar o buscar) o el `resetKey`; si la página actual
 * queda fuera de rango, se ajusta a la última.
 */
export function usePagination<T>(items: readonly T[], pageSize = DEFAULT_PAGE_SIZE, resetKey?: unknown) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [items.length, resetKey]);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages - 1);
  return {
    pageItems: items.slice(current * pageSize, current * pageSize + pageSize),
    page: current,
    setPage,
    total,
    totalPages,
    pageSize,
  };
}

/** Barra "1–20 de 210 · Anterior / Siguiente". No se muestra si la lista cabe en una página. */
export function Pagination({
  page,
  setPage,
  total,
  totalPages,
  pageSize,
  className = 'mt-3',
}: {
  page: number;
  setPage: (p: number) => void;
  total: number;
  totalPages: number;
  pageSize: number;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className={`${className} flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft`}>
      <span>
        {page * pageSize + 1}–{Math.min(page * pageSize + pageSize, total)} de {total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <span className="font-mono text-xs">
          {page + 1}/{totalPages}
        </span>
        <Button variant="secondary" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}
