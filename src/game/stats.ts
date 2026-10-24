import type { Competition, Game, GameState, SeasonStats } from './types';
import { overall, starters } from './world';

const MAX_HISTORY = 10;

function emptyStats(): SeasonStats {
  return { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, mvps: 0, champions: {} };
}

/** Soma um jogo com detalhes às estatísticas de cada participante. */
export function recordGame(state: GameState, game: Game) {
  if (!game.detail) return;
  state.playerStats ??= {};
  const lines = [...game.detail.blueLines, ...game.detail.redLines];
  for (const line of lines) {
    const team = game.detail.blueLines.includes(line) ? game.blue : game.red;
    const byPlayer = (state.playerStats[line.playerId] ??= {});
    const s = (byPlayer[state.season] ??= emptyStats());
    s.games++;
    if (game.winner === team) s.wins++;
    s.kills += line.kills;
    s.deaths += line.deaths;
    s.assists += line.assists;
    if (game.detail.mvp === line.playerId) s.mvps++;
    s.champions[line.champion] = (s.champions[line.champion] ?? 0) + 1;
  }
}

/** Títulos vão para os titulares do campeão. */
export function recordTitle(state: GameState, comp: Competition) {
  if (!comp.championId) return;
  for (const p of starters(state, comp.championId)) {
    p.titles = [...(p.titles ?? []), { season: state.season, comp: comp.name }];
  }
}

/** Fotografia do fim da temporada: OVR e time de cada jogador. */
export function recordSeasonHistory(state: GameState) {
  for (const p of Object.values(state.players)) {
    if (!p.teamId && !p.history) continue;
    const entry = { season: state.season, ovr: overall(p), team: p.teamId ? state.teams[p.teamId].code : 'Livre' };
    p.history = [...(p.history ?? []), entry].slice(-MAX_HISTORY);
  }
}

export function totalStats(state: GameState, playerId: string): SeasonStats {
  const total = emptyStats();
  for (const s of Object.values(state.playerStats?.[playerId] ?? {})) {
    total.games += s.games;
    total.wins += s.wins;
    total.kills += s.kills;
    total.deaths += s.deaths;
    total.assists += s.assists;
    total.mvps += s.mvps;
    for (const [c, n] of Object.entries(s.champions)) total.champions[c] = (total.champions[c] ?? 0) + n;
  }
  return total;
}

export function kda(s: SeasonStats): string {
  return ((s.kills + s.assists) / Math.max(1, s.deaths)).toFixed(2);
}
