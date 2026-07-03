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
      {/* Cadence C construction -- navy ground with an orange C so Fitness is
          tellable apart from Work (navy) and Financial (sand) in a tab strip. */}
      <rect width="32" height="32" rx="8" fill="#1A1F2E" />
      <path
        d="M 23.06 9.64 A 9.5 9.5 0 1 0 23.06 22.36"
        fill="none"
        stroke="#F97316"
        strokeWidth="4.8"
        strokeLinecap="butt"
      />
      <circle cx="23.06" cy="9.64" r="3.2" fill="#F97316" />
      <circle cx="23.06" cy="22.36" r="3.2" fill="#F97316" />
    </svg>
  );
}
