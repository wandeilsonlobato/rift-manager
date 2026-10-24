import type { Champion } from './ddragon';
import { pick, shuffle, type Rng } from './random';
import type { GameState, MetaStyle, Player } from './types';

export const STYLE_LABEL: Record<MetaStyle, string> = {
  early: 'Early game',
  balanced: 'Equilibrado',
  late: 'Late game',
};

// Peso de cada fase do jogo na força do time, conforme o estilo do patch.
const STYLE_WEIGHTS: Record<MetaStyle, [number, number, number]> = {
  early: [0.42, 0.33, 0.25],
  balanced: [0.3, 0.35, 0.35],
  late: [0.2, 0.35, 0.45],
};

export function metaWeights(state: GameState): [number, number, number] {
  return STYLE_WEIGHTS[state.meta?.style ?? 'balanced'];
}

/** Novo patch a cada fase da temporada: muda quem está forte e o estilo de jogo. */
export function newPatch(state: GameState, champions: Champion[], rng: Rng) {
  const count = state.meta?.name.startsWith(`${state.season - 2000}.`) ? Number(state.meta.name.split('.')[1]) + 1 : 1;
  const shuffled = shuffle(rng, champions.map((c) => c.id));
  state.meta = {
    name: `${state.season - 2000}.${count}`,
    phase: state.phase,
    style: pick(rng, ['early', 'balanced', 'late'] as MetaStyle[]),
    buffed: shuffled.slice(0, 14),
    nerfed: shuffled.slice(14, 24),
  };
}

/** Bônus de meta de um campeão escolhido no draft. */
export function championMeta(state: GameState, champion: string): number {
  if (state.meta?.buffed.includes(champion)) return 1.5;
  if (state.meta?.nerfed.includes(champion)) return -1.5;
  return 0;
}

/** Sem draft: jogadores que dominam campeões fortes do patch rendem mais. */
export function poolMetaBonus(state: GameState, players: Player[]): number {
  if (!state.meta) return 0;
  const buffed = new Set(state.meta.buffed);
  const fit = players.filter((p) => p.champions.some((c) => buffed.has(c))).length;
  return (fit / Math.max(1, players.length)) * 1.5;
}
