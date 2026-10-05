import { InputHTMLAttributes, forwardRef } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, className = '', id, ...props },
  ref,
) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`rounded-md border px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent focus:ring-1 focus:ring-accent ${
          error ? 'border-status-danger' : 'border-line'
        } ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-status-danger">{error}</span>}
    </div>
  );
});
