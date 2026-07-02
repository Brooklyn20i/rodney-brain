export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="cf-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1B5E9E" />
          <stop offset="100%" stopColor="#0F3A63" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#cf-logo-bg)" />
      <rect x="16" y="36" width="8" height="16" rx="2" fill="#FFFFFF" fillOpacity="0.55" />
      <rect x="28" y="26" width="8" height="26" rx="2" fill="#FFFFFF" fillOpacity="0.8" />
      <rect x="40" y="14" width="8" height="38" rx="2" fill="#FFFFFF" />
      <path
        d="M14 34 L27 22 L39 28 L50 12"
        stroke="#34D399"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="50" cy="12" r="3.4" fill="#34D399" />
    </svg>
  );
}
