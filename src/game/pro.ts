// Dados reais das partidas profissionais de 2026 (gerados por `npm run import:pro`).
import proData from '../data/pro.json';
import { clamp } from './random';

interface TeamRecord {
  name: string;
  seriesW: number;
  seriesL: number;
  gamesW: number;
  gamesL: number;
}

interface ProData {
  generatedAt: string | null;
  games: number;
  teams: Record<string, TeamRecord>;
  /** jogador (ID do lolesports) -> campeão -> jogos */
  players: Record<string, Record<string, number>>;
}

const DATA = proData as ProData;

/** Campeões que o jogador mais usou em partidas oficiais, do mais jogado para o menos. */
export function proChampions(playerId: string): string[] {
  const played = DATA.players[playerId];
  if (!played) return [];
  return Object.entries(played)
    .sort((a, b) => b[1] - a[1])
    .map(([champ]) => champ);
}

/**
 * Bônus de força pelo desempenho real do time em 2026 (taxa de vitória nos jogos).
 * Com poucos jogos o bônus é suavizado; sem dados, retorna null.
 */
export function realTeamBonus(leagueSlug: string, code: string): number | null {
  const t = DATA.teams[`${leagueSlug}|${code}`];
  if (!t) return null;
  const games = t.gamesW + t.gamesL;
  if (games < 4) return null;
  const confidence = games / (games + 12);
  return clamp((t.gamesW / games - 0.5) * 16 * confidence, -6, 6);
}

/** Versão dos dados importados (para reaplicar pools em saves quando os dados mudam). */
export function proDataVersion(): string | null {
  return DATA.games > 0 ? DATA.generatedAt : null;
}
