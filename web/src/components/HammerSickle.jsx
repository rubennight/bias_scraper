export default function HammerSickle({ size = 26, className = "nav-hs" }) {
  return (
    <span className={className} aria-label="hammer and sickle">
      <svg
        width={size} height={size} viewBox="0 0 32 32"
        fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="16" cy="16" r="14.2" />
        <path d="M8 24 C 8 14, 14 8, 24 8" />
        <path d="M24 8 C 20 8, 17 9, 14.5 11" />
        <path d="M9 23 L 23 9" />
        <path d="M21 7 L 25 11" />
      </svg>
    </span>
  );
}
