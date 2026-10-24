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

/** Mínimo de jogos para considerar o campeão. */
const MIN_GAMES = 15;
/**
 * Suavização: soma 50 jogos "fictícios" com 50% de vitórias. Com poucos jogos a taxa fica perto de 50%;
 * só uma amostra grande sustenta um número extremo (ex.: 13 vitórias em 18 jogos vira ~57%, não 72%).
 */
const PRIOR_GAMES = 50;

const smoothed = (s: RoleStats) => (s.wins + PRIOR_GAMES / 2) / (s.games + PRIOR_GAMES);

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
  if (r && r.games >= MIN_GAMES) return smoothed(r);
  if (c.games >= MIN_GAMES) return smoothed(c);
  return null;
}

/** Presença no meta: picks + bans por partida (0-1). */
export function presence(champion: string): number {
  const c = DATA.champions[champion];
  if (!c || !DATA.matches) return 0;
  return Math.min(1, (c.games + c.bans) / DATA.matches);
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
