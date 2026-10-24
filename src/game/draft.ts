import { championsForRole, type Champion } from './ddragon';
import { coachStyle } from './coach';
import { championMeta } from './meta';
import { pick, type Rng } from './random';
import { staffLevel } from './staff';
import { ROLES, type GameState, type Role } from './types';
import { overall, starters } from './world';

export type Side = 'blue' | 'red';

export interface DraftStep {
  side: Side;
  type: 'ban' | 'pick';
}

// Ordem oficial de draft de torneio.
export const DRAFT_SEQUENCE: DraftStep[] = [
  ...(['blue', 'red', 'blue', 'red', 'blue', 'red'] as Side[]).map((side) => ({ side, type: 'ban' as const })),
  ...(['blue', 'red', 'red', 'blue', 'blue', 'red'] as Side[]).map((side) => ({ side, type: 'pick' as const })),
  ...(['red', 'blue', 'red', 'blue'] as Side[]).map((side) => ({ side, type: 'ban' as const })),
  ...(['red', 'blue', 'blue', 'red'] as Side[]).map((side) => ({ side, type: 'pick' as const })),
];

export interface DraftState {
  bans: Record<Side, string[]>;
  picks: Record<Side, Partial<Record<Role, string>>>;
  step: number;
}

export function emptyDraft(): DraftState {
  return { bans: { blue: [], red: [] }, picks: { blue: {}, red: {} }, step: 0 };
}

export function unavailable(draft: DraftState, fearless: string[]): Set<string> {
  return new Set([
    ...draft.bans.blue,
    ...draft.bans.red,
    ...Object.values(draft.picks.blue),
    ...Object.values(draft.picks.red),
    ...fearless,
  ] as string[]);
}

/** IA bane o campeão de conforto do melhor jogador adversário que ainda estiver livre. */
export function aiBan(state: GameState, enemyTeamId: string, taken: Set<string>, champions: Champion[], rng: Rng): string {
  const enemies = starters(state, enemyTeamId).sort((a, b) => overall(b) - overall(a));
  for (const p of enemies) {
    const options = p.champions.filter((c) => !taken.has(c));
    // Às vezes deixa passar o jogador para variar os bans.
    if (options.length && rng() < 0.8) return pick(rng, options);
  }
  return anyAvailable(champions, taken, rng);
}

/** Qualquer campeão livre; se acabarem (séries longas no Fearless), libera repetidos. */
function anyAvailable(champions: Champion[], taken: Set<string>, rng: Rng): string {
  const free = champions.filter((c) => !taken.has(c.id));
  return pick(rng, free.length ? free : champions).id;
}

/** IA escolhe primeiro a rota com menos opções de conforto, para garanti-la. */
export function aiPick(
  state: GameState,
  teamId: string,
  picks: Partial<Record<Role, string>>,
  taken: Set<string>,
  champions: Champion[],
  rng: Rng,
): { role: Role; champion: string } {
  const lineup = starters(state, teamId);
  const open = lineup.filter((p) => !picks[p.role]);
  const comfort = (role: Role) => lineup.find((p) => p.role === role)!.champions.filter((c) => !taken.has(c));
  const target = open.sort((a, b) => comfort(a.role).length - comfort(b.role).length || overall(b) - overall(a))[0];
  const options = comfort(target.role);
  if (options.length) return { role: target.role, champion: pick(rng, options) };
  const fallback = championsForRole(champions, target.role).filter((c) => !taken.has(c.id));
  return { role: target.role, champion: fallback.length ? pick(rng, fallback).id : anyAvailable(champions, taken, rng) };
}

/** Executa o próximo passo pela IA (banir ou escolher) para o lado indicado. */
export function aiStep(
  state: GameState,
  draft: DraftState,
  teams: Record<Side, string>,
  fearless: string[],
  champions: Champion[],
  rng: Rng,
): DraftState {
  const step = DRAFT_SEQUENCE[draft.step];
  const taken = unavailable(draft, fearless);
  const next: DraftState = structuredClone(draft);
  if (step.type === 'ban') {
    const enemy = teams[step.side === 'blue' ? 'red' : 'blue'];
    next.bans[step.side].push(aiBan(state, enemy, taken, champions, rng));
  } else {
    const { role, champion } = aiPick(state, teams[step.side], draft.picks[step.side], taken, champions, rng);
    next.picks[step.side][role] = champion;
  }
  next.step++;
  return next;
}

export interface DraftScore {
  comfort: number;
  composition: number;
  total: number;
  notes: string[];
}

/** Bônus do draft para a partida: conforto dos jogadores e equilíbrio da composição. */
export function draftScore(
  state: GameState,
  teamId: string,
  picks: Partial<Record<Role, string>>,
  champions: Champion[],
): DraftScore {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const notes: string[] = [];
  let comfort = 0;
  for (const p of starters(state, teamId)) {
    const champ = picks[p.role];
    if (!champ) continue;
    const inPool = p.champions.includes(champ);
    const fits = championsForRole(champions, p.role).some((c) => c.id === champ);
    comfort += (inPool ? 2 : -3) + championMeta(state, champ);
    if (!fits) comfort -= 3;
    if (!inPool) notes.push(`${p.nick} fora do pool`);
    if (!fits) notes.push(`${byId.get(champ)?.name ?? champ} fora da rota`);
  }
  comfort /= ROLES.length;

  const tags = Object.values(picks).map((c) => byId.get(c!)?.tags[0]);
  let composition = 0;
  if (tags.some((t) => t === 'Tank' || t === 'Fighter')) composition += 0.5;
  else notes.push('Sem linha de frente');
  if (tags.includes('Mage') || tags.includes('Assassin')) composition += 0.5;
  else notes.push('Pouco dano mágico');
  if (tags.includes('Marksman')) composition += 0.5;
  else notes.push('Sem atirador');

  const mine = teamId === state.coach.teamId;
  const analyst = mine ? staffLevel(state, 'analyst') * 0.3 : 0;
  const tactical = mine && coachStyle(state) === 'tactical' ? 0.8 : 0;
  if (analyst) notes.push(`Analista: +${analyst.toFixed(1)}`);
  if (tactical) notes.push(`Coach tático: +${tactical}`);
  return { comfort, composition, total: comfort + composition + analyst + tactical, notes };
}

/** Mapeia as escolhas por rota para escolhas por jogador. */
export function picksByPlayer(state: GameState, teamId: string, picks: Partial<Record<Role, string>>): Record<string, string> {
  return Object.fromEntries(starters(state, teamId).map((p) => [p.id, picks[p.role]!]));
}

export function draftComplete(draft: DraftState): boolean {
  return draft.step >= DRAFT_SEQUENCE.length;
}
