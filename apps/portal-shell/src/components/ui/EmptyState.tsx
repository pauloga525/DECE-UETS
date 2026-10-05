export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <p className="text-sm text-ink-soft">{title}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title, onRetry }: { title: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-status-danger-tint bg-status-danger-tint/40 px-6 py-12 text-center">
      <p className="text-sm text-status-danger">{title}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm font-medium text-accent-ink underline">
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  );
}
