'use client';

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="w-full max-w-md rounded-lg bg-white shadow-subtle"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 id="modal-title" className="text-base font-semibold">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-ink-soft hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
