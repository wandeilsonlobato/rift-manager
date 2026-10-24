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
  /** confrontos por rota: "A|B" (ordem alfabética), vitórias contadas para A */
  matchups?: Partial<Record<Role, Record<string, RoleStats>>>;
  /** duplas do bot: "ADC|Suporte" */
  duos?: Record<string, RoleStats>;
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

/** Peso da estimativa nos confrontos: com menos de ~30 jogos, vale mais a força de cada campeão. */
const MATCHUP_PRIOR = 30;

/** Chance esperada de A vencer B só pela força de cada um na rota (fórmula log5). */
function expected(a: string, b: string, role: Role): number {
  const pa = winrate(a, role) ?? 0.5;
  const pb = winrate(b, role) ?? 0.5;
  return (pa * (1 - pb)) / (pa * (1 - pb) + pb * (1 - pa));
}

export interface Matchup {
  /** chance do primeiro campeão vencer */
  winrate: number;
  /** jogos reais desse confronto na amostra */
  games: number;
}

/** Confronto de rota: dado real puxado para a estimativa quando há poucos jogos. */
export function matchup(role: Role, a: string, b: string): Matchup {
  const base = expected(a, b, role);
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const s = DATA.matchups?.[role]?.[key];
  if (!s) return { winrate: base, games: 0 };
  const winsA = a < b ? s.wins : s.games - s.wins;
  return { winrate: (winsA + base * MATCHUP_PRIOR) / (s.games + MATCHUP_PRIOR), games: s.games };
}

/** Sinergia da dupla do bot: quanto ela vence acima do esperado pela força de cada um. */
export function duoSynergy(adc: string, support: string): Matchup {
  const base = ((winrate(adc, 'bottom') ?? 0.5) + (winrate(support, 'support') ?? 0.5)) / 2;
  const s = DATA.duos?.[`${adc}|${support}`];
  if (!s) return { winrate: 0, games: 0 };
  return { winrate: (s.wins + base * MATCHUP_PRIOR) / (s.games + MATCHUP_PRIOR) - base, games: s.games };
}

export type Lane = 'top' | 'jungle' | 'mid' | 'bot';

export interface LaneEdge {
  lane: Lane;
  blue: string[];
  red: string[];
  /** chance do lado azul levar a rota */
  winrate: number;
  games: number;
}

/** Confrontos de cada rota entre os dois drafts (bot = ADC + suporte contra ADC + suporte). */
export function laneEdges(blue: Partial<Record<Role, string>>, red: Partial<Record<Role, string>>): LaneEdge[] {
  if (!hasSoloq()) return [];
  const out: LaneEdge[] = [];
  for (const role of ['top', 'jungle', 'mid'] as const) {
    const a = blue[role];
    const b = red[role];
    if (!a || !b) continue;
    const m = matchup(role, a, b);
    out.push({ lane: role, blue: [a], red: [b], winrate: m.winrate, games: m.games });
  }
  const [ba, bs, ra, rs] = [blue.bottom, blue.support, red.bottom, red.support];
  if (ba && bs && ra && rs) {
    const adc = matchup('bottom', ba, ra);
    const sup = matchup('support', bs, rs);
    const synergy = duoSynergy(ba, bs).winrate - duoSynergy(ra, rs).winrate;
    out.push({
      lane: 'bot',
      blue: [ba, bs],
      red: [ra, rs],
      winrate: Math.max(0.05, Math.min(0.95, (adc.winrate + sup.winrate) / 2 + synergy)),
      games: Math.min(adc.games, sup.games),
    });
  }
  return out;
}

/** Vantagem das rotas na partida (lado azul; o vermelho recebe o oposto). Pesa mais no early. */
export function laneBonus(edges: LaneEdge[]): { early: number; mid: number } {
  const total = edges.reduce((sum, e) => sum + (e.winrate - 0.5), 0);
  return { early: Math.max(-3, Math.min(3, total * 14)), mid: Math.max(-1.5, Math.min(1.5, total * 6)) };
}
