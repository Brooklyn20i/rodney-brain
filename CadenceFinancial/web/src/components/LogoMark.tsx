export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="7" fill="#1A1F2E" />
      <circle
        cx="16"
        cy="16"
        r="9"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="44 13"
        transform="rotate(40 16 16)"
      />
    </svg>
  );
}
