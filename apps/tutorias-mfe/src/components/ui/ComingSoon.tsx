export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-6 py-16 text-center">
      <h2 className="text-lg">{title}</h2>
      <p className="max-w-sm text-sm text-ink-soft">
        Esta pantalla corresponde a una fase posterior del plan (Fase 4 o 5) y todavía no tiene
        backend implementado.
      </p>
    </div>
  );
}
