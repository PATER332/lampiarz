// Hand-drawn monoline SVG icon set (24×24 grid). No emoji, no icon fonts.
import type { CSSProperties, ReactNode } from 'react';

export interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

function Svg({ size = 20, className, style, title, children, fill = false }: IconProps & { children: ReactNode; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconHeart = (p: IconProps & { empty?: boolean }) => (
  <Svg {...p} fill={!p.empty}>
    <path
      d="M12 20.5s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.8C19.5 15.9 12 20.5 12 20.5z"
      stroke={p.empty ? 'currentColor' : 'none'}
      strokeWidth={p.empty ? 1.6 : 0}
      fill={p.empty ? 'none' : 'currentColor'}
    />
  </Svg>
);

export const IconOil = (p: IconProps) => (
  <Svg {...p} fill>
    <path d="M12 3.2c2.6 3.6 6 7.4 6 11a6 6 0 0 1-12 0c0-3.6 3.4-7.4 6-11z" />
  </Svg>
);

export const IconEmber = (p: IconProps) => (
  <Svg {...p} fill>
    <path d="M12 2.8c.9 3.1 4.9 5 4.9 9.6A4.9 4.9 0 0 1 12 17.3a4.9 4.9 0 0 1-4.9-4.9c0-2.4 1.4-3.6 2.4-4.8.3 1.6 1 2.5 2 2.8-.4-2.6.1-5.5.5-7.6z" />
    <path d="M6 19.5h12" stroke="currentColor" strokeWidth={1.6} />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
  </Svg>
);

export const IconLamp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21V10M9.5 21h5M8.8 4.5h6.4l-1 5.5H9.8z" />
    <path d="M10.5 4.5 12 2.6l1.5 1.9" />
  </Svg>
);

export const IconBrazier = (p: IconProps & { lit?: boolean }) => (
  <Svg {...p}>
    <path d="M4.5 11h15l-2 5h-11zM9 16l-1.5 4.5M15 16l1.5 4.5M7 20.5h10" />
    {p.lit ? <path d="M12 9.5c-1.8-1.3-1.5-3.2.2-5 .3 1.4 1.6 1.9 1.6 3.2 0 1-.7 1.6-1.8 1.8z" fill="currentColor" /> : null}
  </Svg>
);

export const IconGate = (p: IconProps & { open?: boolean }) => (
  <Svg {...p}>
    <path d="M4 21V9a8 6 0 0 1 16 0v12" />
    {p.open ? <path d="M8 9.5v3M12 7.5v3M16 9.5v3" /> : <path d="M8 9.5V21M12 7.5V21M16 9.5V21M4 15h16" />}
  </Svg>
);

export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5v14M15 5v14" />
  </Svg>
);

export const IconGear = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" />
  </Svg>
);

export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5c2.7-1 5.3-1 8 .8 2.7-1.8 5.3-1.8 8-.8V19c-2.7-1-5.3-1-8 .8-2.7-1.8-5.3-1.8-8-.8z" />
    <path d="M12 6.3v13.5" />
  </Svg>
);

export const IconSkull = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5c-4.4 0-7 3-7 6.8 0 2.2 1 3.6 2.5 4.5V18h9v-3.2c1.5-.9 2.5-2.3 2.5-4.5 0-3.8-2.6-6.8-7-6.8z" />
    <circle cx="9.3" cy="11" r="1.4" fill="currentColor" />
    <circle cx="14.7" cy="11" r="1.4" fill="currentColor" />
    <path d="M10.5 18v2.5M13.5 18v2.5" />
  </Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 17.5h18M6.5 17.5a5.5 5.5 0 0 1 11 0" />
    <path d="M12 6.5V4M5.8 9.6 4 7.8M18.2 9.6 20 7.8M8 21h8" />
  </Svg>
);

export const IconHand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 12.5V6.8a1.4 1.4 0 0 1 2.8 0v4.7M10.8 11V5.4a1.4 1.4 0 0 1 2.8 0V11M13.6 11V6.6a1.4 1.4 0 0 1 2.8 0v6.6c0 4-2.2 7.3-5.6 7.3-2.6 0-3.7-1.4-5-3.6L4.4 13.6a1.3 1.3 0 0 1 2.2-1.4L8 14" />
  </Svg>
);

export const IconHourglass = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5h11M6.5 20.5h11M8 3.5c0 4.5 4 5.5 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5.5-4 8.5s4 4 4 8.5" />
  </Svg>
);

export const IconFlare = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" fill="currentColor" />
    <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M18.7 5.3l-2.8 2.8M8.1 15.9l-2.8 2.8" />
  </Svg>
);

export const IconHammer = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 5.5 18.5 10.5M11 8l5-5 5 5-5 5zM12.5 9.5 4 18a1.4 1.4 0 0 0 2 2l8.5-8.5" />
  </Svg>
);

export const IconFire = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-3.8 3.5-5.6 3.9-9.5 2 1.4 3 3.3 3 5.1 1-.6 1.7-1.7 1.9-3 2.4 2 4.2 4.6 4.2 7.4 0 3.4-2.6 6-6.5 6z" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5 10 17.5 19 7" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconSound = (p: IconProps & { off?: boolean }) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    {p.off ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
  </Svg>
);

export const IconExpand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
);

export const IconStar = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 14.4 9l5.9.5-4.5 3.9 1.4 5.8L12 16.1l-5.2 3.1 1.4-5.8-4.5-3.9L9.6 9z" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);

export const IconArrow = (p: IconProps & { dir: 'up' | 'down' | 'left' | 'right' }) => {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[p.dir];
  return (
    <Svg {...p} style={{ ...p.style, transform: `rotate(${rot}deg)` }}>
      <path d="M12 5v14M6 11l6-6 6 6" />
    </Svg>
  );
};

export const IconDice = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <circle cx="9" cy="9" r="1.1" fill="currentColor" />
    <circle cx="15" cy="15" r="1.1" fill="currentColor" />
    <circle cx="15" cy="9" r="1.1" fill="currentColor" />
    <circle cx="9" cy="15" r="1.1" fill="currentColor" />
  </Svg>
);

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5.5" width="16" height="15" rx="2" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    <circle cx="12" cy="15" r="1.6" fill="currentColor" />
  </Svg>
);

export const IconRestart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" />
  </Svg>
);

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11 12 4.5 20 11M6.5 9.5V20h11V9.5" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.6v.2" />
  </Svg>
);

// ------------------------------------------------------------------ relic glyphs
const RELIC_PATHS: Record<string, ReactNode> = {
  szeroki_knot: (
    <>
      <path d="M12 20V12" />
      <path d="M12 12c-3.5-1.5-4-5-1.5-8.5.3 2 1.5 3 1.5 3s1.2-1 1.5-3C16 7 15.5 10.5 12 12z" />
      <path d="M5 9a9 9 0 0 0 0 6M19 9a9 9 0 0 1 0 6" />
    </>
  ),
  miedziany_zbiornik: (
    <>
      <rect x="6" y="7" width="12" height="13" rx="2" />
      <path d="M9 7V4.5h6V7M6 12h12M10 16h4" />
    </>
  ),
  oszczedny_palnik: (
    <>
      <path d="M8 20h8M12 20v-6M9 14h6l-1-4h-4z" />
      <path d="M12 8c-1.2-.9-1-2.2.1-3.4.2 1 1 1.3 1 2.2 0 .7-.4 1.1-1.1 1.2z" />
    </>
  ),
  iskrownik: (
    <>
      <path d="M13 3 6 13h5l-1 8 7-10h-5z" />
    </>
  ),
  kieszen_zaru: (
    <>
      <path d="M5 8h14l-1.5 10.5a2 2 0 0 1-2 1.5h-7a2 2 0 0 1-2-1.5z" />
      <path d="M8 8c0-2.2 1.8-4 4-4s4 1.8 4 4" />
      <path d="M12 16.5c-1.4 0-2.2-.9-2.2-2 0-1.4 1.6-2 2.2-3.5.6 1.5 2.2 2.1 2.2 3.5 0 1.1-.8 2-2.2 2z" />
    </>
  ),
  rekawice: (
    <>
      <path d="M8 21v-5l-2.5-3.5a1.4 1.4 0 0 1 2.2-1.6L9 12V5.5a1.3 1.3 0 0 1 2.6 0V11V4.5a1.3 1.3 0 0 1 2.6 0V11V6a1.3 1.3 0 0 1 2.6 0v7.5c0 3-1.3 5-3 7.5" />
    </>
  ),
  zelazne_serce: (
    <>
      <path d="M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 7.6a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z" />
      <path d="M9 11.5h6M12 9v5" />
    </>
  ),
  kolce_swiatla: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>
  ),
  krzesiwo: (
    <>
      <path d="M4 15.5 13.5 6l4.5 4.5L8.5 20H4z" />
      <path d="M17 3.5l.8 1.8M20.5 6.5l-1.8.8M19.5 3.5l-1 1" />
    </>
  ),
  dlugi_lont: (
    <>
      <circle cx="8" cy="15" r="5" />
      <path d="M11.5 11.5c2-2 3-2 4.5-1.5s2.5-.5 3-2" />
      <path d="M19.5 5.5l.8-1.6M20.5 7.3l1.7-.5" />
    </>
  ),
  pijawka: (
    <>
      <path d="M5 15c0-5 4-9 9-9 3 0 5 2 5 4.5S17 15 14 15H9" />
      <path d="M9 15c-1.5 0-2.5 1-2.5 2.5S7.5 20 9 20h6" />
      <circle cx="16" cy="9.5" r=".9" fill="currentColor" />
    </>
  ),
  czujne_oko: (
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M12 2.5v2M4.5 4.5 6 6M19.5 4.5 18 6" />
    </>
  ),
  wiatrochron: (
    <>
      <path d="M7 21V9a5 5 0 0 1 10 0v12" />
      <path d="M3 8h3M2.5 12h4M3 16h3" />
      <path d="M12 13c-1-.8-.9-1.9.1-2.9.2.8.8 1.1.8 1.8 0 .6-.3.9-.9 1.1z" />
    </>
  ),
  mapa: (
    <>
      <path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
      <path d="M9 4.5v13M15 6.5v13" />
      <path d="M11 10.5l2 2M13 10.5l-2 2" />
    </>
  ),
  plaszcz_mgly: (
    <>
      <path d="M12 3.5c-2 0-3.5 1.5-3.5 3.5L5 20.5h14L15.5 7c0-2-1.5-3.5-3.5-3.5z" />
      <path d="M8 14c1.5 1 3 1 4 0s2.5-1 4 0" />
    </>
  ),
  serce_latarni: (
    <>
      <path d="M8 4.5h8l-1 3H9zM7 7.5h10v10.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
      <path d="M12 16.5s-2.8-1.7-2.8-3.6a1.5 1.5 0 0 1 2.8-.8 1.5 1.5 0 0 1 2.8.8c0 1.9-2.8 3.6-2.8 3.6z" fill="currentColor" />
    </>
  ),
  popiol_feniksa: (
    <>
      <path d="M12 20c0-4 1-7 4-10-1 3 2 4 4 3-1 4-4 7-8 7zM12 20c0-4-1-7-4-10 1 3-2 4-4 3 1 4 4 7 8 7z" />
      <path d="M12 12c-1-2-.5-4 0-7 .5 3 1 5 0 7z" />
    </>
  ),
  lustro: (
    <>
      <ellipse cx="12" cy="10" rx="5.5" ry="6.5" />
      <path d="M12 16.5V21M9 21h6M9.5 7.5l2 -1.5" />
    </>
  ),
  zloty_knot: (
    <>
      <path d="M12 21v-7" />
      <path d="M12 14c-4-1.8-4.6-5.8-1.7-10 .4 2.3 1.7 3.5 1.7 3.5s1.3-1.2 1.7-3.5c2.9 4.2 2.3 8.2-1.7 10z" fill="currentColor" />
      <path d="M8 21h8" />
    </>
  ),
};

export const RelicIcon = ({ id, ...p }: IconProps & { id: string }) => <Svg {...p}>{RELIC_PATHS[id] ?? <circle cx="12" cy="12" r="6" />}</Svg>;
