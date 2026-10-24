import { clamp } from './random';
import { staffPayroll } from './staff';
import type { Competition, GameState } from './types';

const MAX_LOG = 40;

export function addEntry(state: GameState, label: string, amount: number) {
  state.teams[state.coach.teamId!].cash += amount;
  state.finances = [{ season: state.season, week: state.week, label, amount }, ...(state.finances ?? [])].slice(0, MAX_LOG);
}

/** Patrocínio semanal: base no teto salarial, cresce com a reputação do coach. */
export function weeklySponsor(state: GameState): number {
  const team = state.teams[state.coach.teamId!];
  return Math.round((team.budget / 4) * (0.88 + state.coach.reputation / 300));
}

export function weeklyCosts(state: GameState): { players: number; staff: number } {
  const team = state.teams[state.coach.teamId!];
  const players = team.playerIds.reduce((sum, id) => sum + state.players[id].salary, 0);
  return { players: Math.round(players / 4), staff: Math.round(staffPayroll(state) / 4) };
}

/** Receitas e despesas da semana do time do coach. */
export function weeklyFinances(state: GameState) {
  const income = weeklySponsor(state);
  const costs = weeklyCosts(state);
  addEntry(state, `Semana ${state.week}: patrocínio`, income);
  addEntry(state, `Semana ${state.week}: salários`, -(costs.players + costs.staff));
  if (state.teams[state.coach.teamId!].cash < 0) {
    state.coach.reputation = clamp(state.coach.reputation - 1, 0, 100);
    state.eventLog = ['Caixa negativo: a diretoria está preocupada com as finanças.', ...(state.eventLog ?? [])].slice(0, 12);
  }
}

// Premiação (em milhares) por colocação: [campeão, vice, 3º-4º, 5º-8º].
const INTL_PRIZES: Record<string, number[]> = {
  firstStand: [250, 120, 60, 30],
  msi: [400, 200, 100, 50],
  ewc: [500, 250, 120, 60],
  worlds: [800, 400, 200, 100],
};

export function prizeFor(state: GameState, comp: Competition, rank: number): number {
  const table = comp.kind === 'international'
    ? INTL_PRIZES[comp.phase]
    : [60, 30, 15, 8].map((v) => Math.round(v * state.leagues[comp.leagueSlug!].prestige));
  if (rank === 1) return table[0];
  if (rank === 2) return table[1];
  if (rank <= 4) return table[2];
  if (rank <= 8) return table[3];
  return 0;
}

/** Paga a premiação das competições que terminaram (só o caixa do coach é acompanhado). */
export function payPrizes(state: GameState) {
  const myTeam = state.coach.teamId!;
  for (const comp of state.competitions) {
    if (!comp.done || comp.paid) continue;
    comp.paid = true;
    const rank = comp.ranking!.indexOf(myTeam) + 1;
    if (!rank) continue;
    const prize = prizeFor(state, comp, rank);
    if (prize) addEntry(state, `Premiação ${comp.name} (${rank}º)`, prize);
  }
}
