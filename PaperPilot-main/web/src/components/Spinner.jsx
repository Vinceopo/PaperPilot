/** Inline spinning indicator for buttons and busy states. */
export default function Spinner({ className = "h-3.5 w-3.5" }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}
