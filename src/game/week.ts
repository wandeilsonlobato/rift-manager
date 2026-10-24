import type { Champion } from './ddragon';
import { coachStyle } from './coach';
import { rollEvent } from './events';
import { payPrizes, weeklyFinances } from './finance';
import { newPatch } from './meta';
import { clamp, createRng, gauss, type Rng } from './random';
import { generateStaffMarket, staffLevel } from './staff';
import { draftScore, picksByPlayer, type DraftState } from './draft';
import { competitionOf, currentCompetitions, playSeriesGame, playWeek, seriesThisWeek } from './season';
import { beginOffseason } from './market';
import { decayCollective } from './collective';
import { aiFocus, applyTraining, focusInfo } from './training';
import type { Game, GameState, GrowthEntry, Series, TrainingFocus } from './types';

/** Ligas cujas partidas guardam detalhes: a do coach e a outra divisão da mesma região. */
function detailedLeagues(state: GameState): Set<string> {
  const league = state.leagues[state.teams[state.coach.teamId!].leagueSlug];
  return new Set([league.slug, league.parentSlug, league.academySlug].filter(Boolean) as string[]);
}

/** Treina todos os times, joga as séries da semana e avança o calendário. */
export function advanceWeek(prev: GameState, champions: Champion[] | null): GameState {
  if (prev.phase === 'offseason' || prev.pendingEvent) return prev;
  const state = structuredClone(prev);
  playOneWeek(state, champions);
  return state;
}

/** Avança semanas até o próximo jogo do coach ou até mudar de fase. */
export function advanceToNextMatch(prev: GameState, champions: Champion[] | null): GameState {
  if (prev.phase === 'offseason' || prev.pendingEvent) return prev;
  const state = structuredClone(prev);
  playOneWeek(state, champions);
  const startPhase = state.phase;
  for (let i = 0; i < 30 && state.phase === startPhase && state.phase !== 'offseason'; i++) {
    if (mySeriesThisWeek(state).length || state.pendingEvent) break;
    playOneWeek(state, champions);
  }
  return state;
}

function playOneWeek(state: GameState, champions: Champion[] | null) {
  const rng = createRng(`${state.season}-${state.week}-${Date.now()}`);
  const myTeam = state.coach.teamId!;
  state.staffMarket ??= generateStaffMarket(state, rng);
  updateFormAndChemistry(state, rng);

  // 1. Treino: o do coach é feito na aba Treino; sem treino, sem bônus de foco.
  const focus: Record<string, TrainingFocus> = {};
  const trained = trainedFocus(state);
  for (const team of Object.values(state.teams)) {
    if (team.id === myTeam) {
      focus[team.id] = trained ?? 'rest';
    } else {
      focus[team.id] = aiFocus(rng);
      applyTraining(state, team.id, focus[team.id], 'normal', null, rng);
    }
    decayCollective(state, team.id, focusInfo(focus[team.id]).collective);
  }
  const growth: GrowthEntry[] = trained ? state.trainingResult!.growth : [];

  // 2. Jogos
  const played = playWeek(state, { focus, detailed: detailedLeagues(state), rng });

  // 3. Dinheiro, patch e eventos
  payPrizes(state);
  weeklyFinances(state);
  if (state.phase === 'offseason') beginOffseason(state);
  else {
    if (champions && state.meta?.phase !== state.phase) newPatch(state, champions, rng);
    rollEvent(state, rng);
  }

  state.lastReport = {
    week: state.week,
    seriesIds: played.filter((s) => s.a === myTeam || s.b === myTeam).map((s) => s.id),
    focus: trained,
    growth,
  };
  state.week++;
}

/** Forma oscila semana a semana; química cresce com o elenco junto. */
function updateFormAndChemistry(state: GameState, rng: Rng) {
  const myTeam = state.coach.teamId!;
  const psych = staffLevel(state, 'psychologist');
  for (const team of Object.values(state.teams)) {
    // Tende a ~75 com o tempo; o psicólogo eleva esse patamar.
    const chem = team.chemistry ?? 60;
    const motivator = team.id === myTeam && coachStyle(state) === 'motivator';
    const gain = (75 - chem) * 0.08 + (team.id === myTeam ? psych * 0.5 : 0) + (motivator ? 0.5 : 0);
    team.chemistry = clamp(chem + gain, 0, 100);
    for (const id of team.playerIds) {
      const p = state.players[id];
      if (p.sick) {
        p.sick--;
        p.form = -4;
        continue;
      }
      p.form = Math.round(clamp((p.form ?? 0) * 0.6 + gauss(rng) * 2, -5, 5));
      if (motivator) p.morale = clamp(p.morale + 1, 0, 100);
    }
  }
}

/** Foco treinado pelo coach nesta semana, ou null se ainda não treinou. */
export function trainedFocus(state: GameState): TrainingFocus | null {
  return state.trainedWeek === state.week && state.trainingResult ? state.trainingResult.focus : null;
}

/** Treino da semana do coach: uma sessão por semana, libera de novo depois dos jogos. */
export function trainThisWeek(prev: GameState, champions: Champion[]): GameState {
  if (prev.trainedWeek === prev.week || prev.phase === 'offseason') return prev;
  const state = structuredClone(prev);
  const rng = createRng(`train-${state.season}-${state.week}-${Date.now()}`);
  const { focus, intensity } = state.training;
  // Coach tático evolui mais rápido os treinos coletivos.
  const tacticalBoost = focusInfo(focus).collective && coachStyle(state) === 'tactical' ? 1.2 : 1;
  const boost = (1 + staffLevel(state, 'assistant') * 0.12) * tacticalBoost;
  const youth = coachStyle(state) === 'developer' ? 1.25 : 1;
  const growth = applyTraining(state, state.coach.teamId!, focus, intensity, champions, rng, boost, youth);
  state.trainedWeek = state.week;
  state.trainingResult = { week: state.week, focus, intensity, growth };
  return state;
}

/** Séries do time do coach nesta semana. */
export function mySeriesThisWeek(state: GameState): Series[] {
  const myTeam = state.coach.teamId!;
  return currentCompetitions(state)
    .flatMap((c) => seriesThisWeek(state, c))
    .filter((s) => s.a === myTeam || s.b === myTeam);
}

/** Joga um jogo de uma série do coach com o resultado do draft feito pelo jogador. */
export function playDraftedGame(
  prev: GameState,
  seriesId: string,
  draft: DraftState,
  champions: Champion[],
): { state: GameState; game: Game } {
  const state = structuredClone(prev);
  const s = state.series[seriesId];
  const blue = (s.wins[0] + s.wins[1]) % 2 === 0 ? s.a : s.b;
  const red = blue === s.a ? s.b : s.a;
  const blueScore = draftScore(state, blue, draft.picks.blue, champions);
  const redScore = draftScore(state, red, draft.picks.red, champions);
  const game = playSeriesGame(
    state,
    s,
    {
      focus: { [state.coach.teamId!]: trainedFocus(state) ?? 'rest' },
      detailed: detailedLeagues(state),
      rng: createRng(`${seriesId}-${Date.now()}`),
    },
    {
      draft: {
        picks: [picksByPlayer(state, blue, draft.picks.blue), picksByPlayer(state, red, draft.picks.red)],
        bonus: [blueScore.total, redScore.total],
      },
    },
  );
  return { state, game };
}

export function myCompetition(state: GameState) {
  return competitionOf(state, state.coach.teamId!);
}
