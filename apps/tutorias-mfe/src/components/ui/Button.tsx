import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-ink disabled:bg-line disabled:text-ink-soft',
  secondary:
    'bg-white text-ink border border-line hover:border-accent hover:text-accent-ink disabled:text-ink-soft',
  ghost: 'text-ink-soft hover:text-ink hover:bg-paper disabled:text-line',
  danger: 'bg-status-danger text-white hover:opacity-90 disabled:bg-line disabled:text-ink-soft',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
});
