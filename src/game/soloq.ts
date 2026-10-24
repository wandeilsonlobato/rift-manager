// Estatísticas reais de SoloQ de alto elo (geradas por `npm run import:soloq`).
import soloqData from '../data/soloq.json';
import type { Role } from './types';

interface RoleStats {
  games: number;
  wins: number;
}

interface ChampionStats extends RoleStats {
  bans: number;
  roles: Partial<Record<Role, RoleStats>>;
}

interface SoloqData {
  generatedAt: string | null;
  platform: string | null;
  matches: number;
  patches: Record<string, number>;
  champions: Record<string, ChampionStats>;
}

const DATA = soloqData as SoloqData;

/** Mínimo de jogos para confiar na taxa de vitória (amostra pequena engana). */
const MIN_GAMES = 15;

export function hasSoloq(): boolean {
  return DATA.matches > 0;
}

export function soloqInfo() {
  const patch = Object.entries(DATA.patches).sort((a, b) => b[1] - a[1])[0]?.[0];
  return { matches: DATA.matches, platform: DATA.platform?.toUpperCase() ?? '', patch: patch ?? '' };
}

/** Taxa de vitória (0-1) na rota, ou geral se a amostra da rota for pequena. Null sem dados. */
export function winrate(champion: string, role?: Role): number | null {
  const c = DATA.champions[champion];
  if (!c) return null;
  const r = role ? c.roles[role] : undefined;
  if (r && r.games >= MIN_GAMES) return r.wins / r.games;
  if (c.games >= MIN_GAMES) return c.wins / c.games;
  return null;
}

/** Presença no meta: picks + bans por partida (0-1). */
export function presence(champion: string): number {
  const c = DATA.champions[champion];
  if (!c || !DATA.matches) return 0;
  return (c.games + c.bans) / DATA.matches;
}

/** Bônus no draft pela taxa de vitória real: 54% ≈ +1,6; 46% ≈ -1,6 (limite ±2). */
export function soloqBonus(champion: string, role?: Role): number {
  const wr = winrate(champion, role);
  if (wr === null) return 0;
  return Math.max(-2, Math.min(2, (wr - 0.5) * 40));
}

/** Campeões com amostra suficiente, do mais forte para o mais fraco. */
export function rankedChampions(): string[] {
  return Object.keys(DATA.champions)
    .filter((id) => winrate(id) !== null)
    .sort((a, b) => winrate(b)! - winrate(a)!);
}
