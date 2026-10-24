import { clamp, createRng, gauss } from './random';
import type { Collective, GameState, Team } from './types';

export const COLLECTIVE_KEYS: (keyof Collective)[] = ['rotations', 'teamfight', 'vision', 'comms', 'prep'];

/** Valor inicial: ligas mais fortes jogam mais coordenadas (com variação por time). */
function initial(state: Pick<GameState, 'leagues'>, team: Team): Collective {
  const rng = createRng(`collective-${team.id}`);
  const base = 36 + state.leagues[team.leagueSlug].prestige * 8;
  const value = () => Math.round(clamp(base + gauss(rng) * 6, 20, 92));
  return { rotations: value(), teamfight: value(), vision: value(), comms: value(), prep: value() };
}

/** Atributos coletivos do time (gerados na hora para saves antigos). */
export function collectiveOf(state: Pick<GameState, 'leagues' | 'teams'>, teamId: string): Collective {
  const team = state.teams[teamId];
  return team.collective ?? initial(state, team);
}

export function changeCollective(state: GameState, teamId: string, key: keyof Collective, delta: number) {
  const current = collectiveOf(state, teamId);
  state.teams[teamId].collective = { ...current, [key]: clamp(current[key] + delta, 15, 99) };
}

/** Sem treino, o entrosamento coletivo se perde devagar. */
export function decayCollective(state: GameState, teamId: string, trained?: keyof Collective) {
  const current = collectiveOf(state, teamId);
  const next = { ...current };
  for (const key of COLLECTIVE_KEYS) if (key !== trained) next[key] = clamp(current[key] - 0.3, 15, 99);
  state.teams[teamId].collective = next;
}

/** Jogador novo ainda não conhece as calls e as rotações do time. */
export function newcomerPenalty(state: GameState, teamId: string) {
  const current = collectiveOf(state, teamId);
  const next = { ...current };
  for (const key of COLLECTIVE_KEYS) next[key] = clamp(current[key] - 3, 15, 99);
  state.teams[teamId].collective = next;
}
