// Qurtuba mark: an Andalusian arch framing a graduation cap over an open book.
export function LogoMark({ className = 'h-10 w-10', arch = 'rgb(var(--accent))', cap = 'rgb(var(--accent-strong))', book = 'rgb(var(--gold))' }:
  { className?: string; arch?: string; cap?: string; book?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path fill={arch} fillRule="evenodd" d="M7 62V31C7 19 19 11 32 2c13 9 25 17 25 29v31zM14 62V32c0-9 9-15 18-21 9 6 18 12 18 21v30z" />
      <path fill={cap} d="M32 21l17 7-17 7-17-7z" />
      <path fill={cap} d="M21 32v7c0 3 5 5 11 5s11-2 11-5v-7l-11 5z" />
      <path stroke={book} strokeWidth="1.6" strokeLinecap="round" d="M49 28v9" />
      <circle fill={book} cx="49" cy="38.5" r="1.8" />
      <path fill={book} d="M14 50c6-3 12-3 18 1 6-4 12-4 18-1v5c-6-3-12-3-18 1-6-4-12-4-18-1z" />
    </svg>
  );
}
