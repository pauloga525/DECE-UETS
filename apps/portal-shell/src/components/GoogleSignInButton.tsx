'use client';

import { useEffect, useRef, useState } from 'react';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  gisPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisPromise = null;
      reject(new Error('No se pudo cargar Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

/**
 * Botón oficial "Iniciar sesión con Google" (Google Identity Services). Entrega un ID token
 * (JWT firmado por Google) que el identity-service verifica en el servidor.
 *
 * `hostedDomain` solo es una pista para que Google muestre las cuentas del Workspace
 * institucional: la restricción real (@uets.edu.ec, sin .est) la aplica el servidor.
 */
export function GoogleSignInButton({
  clientId,
  hostedDomain,
  onCredential,
}: {
  clientId: string;
  hostedDomain: string;
  onCredential: (credential: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !container.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (res) => callback.current(res.credential),
          hd: hostedDomain,
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(container.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 320,
          locale: 'es',
        });
      })
      .catch(() => setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [clientId, hostedDomain]);

  if (loadError) {
    return (
      <p className="text-sm text-status-danger">
        No se pudo cargar el inicio de sesión de Google. Revisa tu conexión y recarga la página.
      </p>
    );
  }
  return <div ref={container} className="flex min-h-[44px] justify-center" />;
}
