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
      {/* Cadence C construction -- sand ground with a Cadence-blue C, keeping
          Fitness on the house style while still tellable apart in a tab strip. */}
      <rect width="32" height="32" rx="8" fill="#EAE4D6" />
      <path
        d="M 23.06 9.64 A 9.5 9.5 0 1 0 23.06 22.36"
        fill="none"
        stroke="#1B5E9E"
        strokeWidth="4.8"
        strokeLinecap="butt"
      />
      <circle cx="23.06" cy="9.64" r="3.2" fill="#1B5E9E" />
      <circle cx="23.06" cy="22.36" r="3.2" fill="#1B5E9E" />
    </svg>
  );
}
