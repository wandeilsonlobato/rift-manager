// Ícones de objetivos e lances da partida: oficiais do jogo (Community Dragon) quando existem,
// e desenhados no mesmo estilo para o resto.
import type { MatchEvent } from '../game/types';

const MINIMAP = 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons';
const HISTORY = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-match-history/global/default';

const DRAGON_ICON: Record<string, string> = {
  infernal: 'dragon_infernal',
  ocean: 'dragon_ocean',
  mountain: 'dragon_mountain',
  cloud: 'dragon_cloud',
  hextech: 'dragon_hextech',
  chemtech: 'dragon_chemtech',
  elder: 'dragon_elder',
};

type Side = 'blue' | 'red';
const SIDE_COLOR: Record<Side, string> = { blue: '#4aa3ff', red: '#e84057' };

/** Ícones do placar (torre, dragão, barão) na cor de cada lado, e ouro/abates. */
export function StatIcon({ kind, side }: { kind: 'tower' | 'dragon' | 'baron' | 'gold' | 'kills'; side?: Side }) {
  const file = kind === 'gold' || kind === 'kills' ? kind : `${kind}-${side === 'red' ? 200 : 100}`;
  return <img className="stat-icon" src={`${HISTORY}/${file}.png`} alt={kind} />;
}

function minimap(name: string) {
  return `${MINIMAP}/${name}.png`;
}

export function EventIcon({ event, size = 28 }: { event: MatchEvent; size?: number }) {
  const side = event.side;
  const img = (src: string) => <img className="event-icon" src={src} alt={event.type} style={{ width: size, height: size }} />;
  switch (event.type) {
    case 'dragon':
    case 'elder':
      return img(minimap(DRAGON_ICON[event.dragon ?? (event.type === 'elder' ? 'elder' : 'infernal')] ?? 'dragon'));
    case 'baron':
      return img(minimap('baron'));
    case 'herald':
      return img(minimap('riftherald'));
    case 'grubs':
      return img(minimap('grub'));
    case 'nexus':
      return img(minimap('nexus'));
    case 'tower':
      return event.text.includes('inibidor') ? img(minimap('inhibitor')) : img(`${HISTORY}/tower-${side === 'red' ? 200 : 100}.png`);
    case 'kill':
      return <Glyph name="sword" side={side} size={size} />;
    case 'teamfight':
      return <Glyph name="swords" side={side} size={size} />;
    case 'pick':
      return <Glyph name="target" side={side} size={size} />;
    case 'invade':
      return <Glyph name="jungle" side={side} size={size} />;
    case 'crab':
      return <Glyph name="crab" side={side} size={size} />;
    default:
      return <Glyph name="sword" side={side} size={size} />;
  }
}

const GLYPHS: Record<string, JSX.Element> = {
  sword: (
    <>
      <path d="M19 4l1 1-9 9-2-2z" />
      <path d="M7 13l4 4M6 18l2-2M9 15l-3 3" />
    </>
  ),
  swords: (
    <>
      <path d="M5 4l9 9M4 5l1-1M14 13l-2 2M15 14l3 3M18 17l1 1-1 1-1-1" />
      <path d="M19 4l-9 9M20 5l-1-1M10 13l2 2M9 14l-3 3M6 17l-1 1 1 1 1-1" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </>
  ),
  jungle: (
    <>
      <path d="M12 3l5 7h-3l4 6H6l4-6H7z" />
      <path d="M12 16v5" />
    </>
  ),
  crab: (
    <>
      <ellipse cx="12" cy="14" rx="5" ry="3.5" />
      <path d="M7 12C4 11 4 7 6 6M17 12c3-1 3-5 1-6M5 6l2 1M19 6l-2 1" />
      <path d="M8 17l-2 2M16 17l2 2M10 17.5l-1 2.5M14 17.5l1 2.5" />
    </>
  ),
};

/** Ícone desenhado em badge circular, na cor do time que fez o lance. */
function Glyph({ name, side, size }: { name: string; side: Side; size: number }) {
  const color = SIDE_COLOR[side];
  return (
    <svg
      className="event-icon glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ background: `${color}22`, borderColor: `${color}88` }}
    >
      {GLYPHS[name]}
    </svg>
  );
}
