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
      <rect width="32" height="32" rx="8" fill="#1A1F2E" />
      {/* exact match to the main Cadence app's C mark (Cadence/web/public/icon-512.png) */}
      <path
        d="M 23.06 9.64 A 9.5 9.5 0 1 0 23.06 22.36"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="4.8"
        strokeLinecap="butt"
      />
      <circle cx="23.06" cy="9.64" r="3.2" fill="#FFFFFF" />
      <circle cx="23.06" cy="22.36" r="3.2" fill="#FFFFFF" />
    </svg>
  );
}
