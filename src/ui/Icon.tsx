import { useState, type ReactNode } from 'react';

// Ícones de interface desenhados em SVG (linha fina, herdam a cor do texto).
const PATHS: Record<string, ReactNode> = {
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M8 5l11 7-11 7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  skip: <path d="M5 5l9 7-9 7zM18 5v14" />,
  next: <path d="M9 5l7 7-7 7" />,
  back: <path d="M15 5l-7 7 7 7" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  home: <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.5a3 3 0 0 1 0 5.5M17 14a5 5 0 0 1 3.5 5" />
    </>
  ),
  dumbbell: <path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12" />,
  bracket: <path d="M4 5h5v6H4M4 13h5v6H4M9 8h4v8H9M13 12h7" />,
  coins: (
    <>
      <ellipse cx="12" cy="7" rx="7" ry="3" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </>
  ),
  building: <path d="M5 20V5l7-2 7 2v15M9 20v-4h6v4M9 8h1M14 8h1M9 12h1M14 12h1M3 20h18" />,
  book: <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  star: <path d="M12 4l2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z" />,
  shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
  swords: <path d="M5 4l9 9M4 5l1-1M14 13l-2 2M15 14l3 3M19 4l-9 9M20 5l-1-1M10 13l2 2M9 14l-3 3" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Explicação que aparece ao passar o mouse ou tocar, no lugar de parágrafos de texto na tela. */
export function InfoTip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`info-tip ${open ? 'open' : ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button type="button" className="info-tip-btn" aria-label="Mais informações" onClick={() => setOpen(!open)}>
        <Icon name="info" size={15} />
      </button>
      {open && <span className="info-tip-box">{children}</span>}
    </span>
  );
}
