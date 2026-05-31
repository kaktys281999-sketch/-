// Фирменный знак ēruditiqa — воссоздан в виде SVG.
// Заливка наследуется от currentColor (по умолчанию белый на фиолетовом).
export function Logo({
  className = "",
  title = "ēruditiqa",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label={title}
      fill="currentColor"
    >
      <rect x="38" y="10" width="44" height="15" rx="3.5" />
      <path fillRule="evenodd" d="M16,73 A44,44 0 0 1 104,73 Z M44,73 A16,16 0 0 1 76,73 Z" />
      <path d="M22,88 A45,45 0 0 0 98,88 A66,66 0 0 1 22,88 Z" />
    </svg>
  );
}
