'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, isApiError } from '@/lib/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      // Regla de UX (pantalla 05): mismo mensaje sin importar cuál campo falló.
      setError(isApiError(err) ? 'Usuario o contraseña incorrectos' : 'No se pudo conectar con el servidor');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      <div className="hidden flex-col justify-center bg-accent px-16 text-white md:flex">
        <h1 className="mb-4 text-3xl text-white">Tutorías DECE</h1>
        <p className="max-w-sm text-sm text-white/80">
          Sistema de Gestión de Tutorías Académicas — acompañamiento académico organizado en
          bloques de 40 minutos, con disponibilidad docente, materia y nivel siempre validados.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center px-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <h2 className="mb-1 text-2xl">Iniciar sesión</h2>
          <p className="mb-6 text-sm text-ink-soft">Ingresa con tu cuenta institucional.</p>

          {error && (
            <div className="mb-4 rounded-md bg-status-danger-tint px-3 py-2 text-sm text-status-danger">
              {error}
            </div>
          )}

          <div className="mb-4">
            <Input
              label="Correo institucional"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="mb-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-ink">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-line px-3 py-2 pr-16 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-soft hover:text-ink"
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={submitting} className="mt-4 w-full">
            {submitting ? 'Ingresando…' : 'Iniciar sesión'}
          </Button>
        </form>
      </div>
    </div>
  );
}
