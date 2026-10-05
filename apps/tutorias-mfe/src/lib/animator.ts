'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { useAuth } from './auth';
import type { Parallel, UserRole } from './types';

export type AnimatorCourse = Parallel & { level: NonNullable<Parallel['level']> };

/**
 * Roles que pueden tener curso como animador. Ser animador lo da el paralelo asignado
 * (Parallel.animatorEmail), no el rol: un DOCENTE suele animar un curso además de dictar sus
 * materias, y en el DECE también hay animadores (carga de docentes 2026-10-05).
 */
export const ANIMATOR_CAPABLE: UserRole[] = ['ANIMATOR', 'TEACHER', 'PSYCHOLOGIST', 'PSYCHOLOGY_COORDINATOR', 'ADMIN'];

export function courseLabel(c: AnimatorCourse) {
  return `${c.level.name} "${c.name}"`;
}

// Una sola consulta por carga de página: la comparten el menú y las pantallas del animador.
let cache: Promise<AnimatorCourse[]> | null = null;
function fetchCourses() {
  cache ??= api.get<AnimatorCourse[]>('/animator/courses').catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
}

/** Cursos del animador (vacío si el usuario no anima ningún curso). */
export function useAnimatorCourses() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<AnimatorCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const capable = !!user && ANIMATOR_CAPABLE.includes(user.role);
  useEffect(() => {
    if (!user) return;
    if (!capable) {
      setCourses([]);
      return;
    }
    fetchCourses()
      .then(setCourses)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus cursos'));
  }, [user, capable]);
  return { courses, error };
}
