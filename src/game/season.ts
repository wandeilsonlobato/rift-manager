import { simulateGame, type GameOptions } from './match';
import { clamp, type Rng } from './random';
import type { Competition, Game, GameState, PhaseId, Series, Stage, StageKind, TrainingFocus } from './types';
import { coachStyle } from './coach';
import { staffLevel } from './staff';
import { recordGame, recordTitle } from './stats';
import { starters } from './world';

export const PHASES: { id: PhaseId; label: string }[] = [
  { id: 'split1', label: 'Split 1 · Copas' },
  { id: 'firstStand', label: 'First Stand' },
  { id: 'split2', label: 'Split 2' },
  { id: 'msi', label: 'MSI' },
  { id: 'ewc', label: 'Esports World Cup' },
  { id: 'split3', label: 'Split 3' },
  { id: 'worlds', label: 'Worlds' },
  { id: 'offseason', label: 'Mercado' },
];

export function phaseLabel(id: PhaseId): string {
  return PHASES.find((p) => p.id === id)!.label;
}

/** Ligas que mandam times para os torneios internacionais. */
const MAJORS = ['lck', 'lpl', 'lec', 'lcs', 'lcp', 'cblol-brazil'];

// Nome oficial de cada etapa da temporada por liga; as demais usam "<Liga> Split N".
const SPLIT_NAMES: Record<string, [string, string, string]> = {
  'cblol-brazil': ['Copa CBLOL', 'CBLOL Split 1', 'CBLOL Split 2'],
  lck: ['LCK Cup', 'LCK Road to MSI', 'LCK Season'],
  lpl: ['LPL Split 1', 'LPL Split 2', 'LPL Split 3'],
  lec: ['LEC Versus', 'LEC Spring', 'LEC Summer'],
  lcs: ['LCS Lock-In', 'LCS Spring', 'LCS Summer'],
  lcp: ['LCP Split 1', 'LCP Split 2', 'LCP Split 3'],
  'lec-academy': ['EMEA Masters Winter', 'EMEA Masters Spring', 'EMEA Masters Summer'],
};

export function splitName(state: GameState, slug: string, split: number): string {
  return SPLIT_NAMES[slug]?.[split - 1] ?? `${state.leagues[slug].name} Split ${split}`;
}


const INTL_IMAGES: Partial<Record<PhaseId, string>> = {
  firstStand: 'http://static.lolesports.com/leagues/1740042025201_RG_LOL_FIRST_STAND_LOGO_VOLT_ALPHA.png',
  msi: 'http://static.lolesports.com/leagues/1592594634248_MSIDarkBG.png',
  worlds: 'http://static.lolesports.com/leagues/1592594612171_WorldsDarkBG.png',
};

const SPLIT_NUMBER: Partial<Record<PhaseId, number>> = { split1: 1, split2: 2, split3: 3 };

const isRoundRobin = (kind: StageKind) => kind === 'rr1' || kind === 'rr2';

export function currentCompetitions(state: GameState): Competition[] {
  return state.competitions.filter((c) => c.phase === state.phase);
}

export function competitionOf(state: GameState, teamId: string, phase = state.phase): Competition | undefined {
  return state.competitions.find(
    (c) => c.phase === phase && c.stages.some((s) => s.teamIds.includes(teamId)),
  );
}

// ---------------------------------------------------------------- criação

function stage(kind: StageKind, name: string, bestOf: number, teamIds: string[] = [], fromPrevious = 0): Stage {
  return { kind, name, teamIds, fromPrevious, bestOf, rounds: [], played: 0 };
}

function newSeries(state: GameState, comp: Competition, stageIdx: number, round: number, label: string, a: string, b: string, bestOf: number): string {
  const id = `${comp.id}:${stageIdx}:${round}:${a}`;
  state.series[id] = { id, compId: comp.id, stage: stageIdx, round, label, a, b, bestOf, wins: [0, 0], kills: [0, 0], gameIds: [] };
  return id;
}

/** Método do círculo: cada time enfrenta todos os outros uma vez por turno. */
function roundRobin(teamIds: string[], double: boolean): [string, string][][] {
  const teams: (string | null)[] = [...teamIds];
  if (teams.length % 2) teams.push(null);
  const n = teams.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i];
      const b = teams[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    teams.splice(1, 0, teams.pop()!);
  }
  return double ? [...rounds, ...rounds.map((ps) => ps.map(([a, b]) => [b, a] as [string, string]))] : rounds;
}

function startStage(state: GameState, comp: Competition, idx: number, entrants: string[]) {
  const st = comp.stages[idx];
  st.teamIds = entrants;
  if (isRoundRobin(st.kind)) {
    st.rounds = roundRobin(entrants, st.kind === 'rr2').map((pairs, r) =>
      pairs.map(([a, b]) => newSeries(state, comp, idx, r, `Rodada ${r + 1}`, a, b, st.bestOf)),
    );
  }
}

function leagueComp(state: GameState, slug: string, phase: PhaseId): Competition {
  const league = state.leagues[slug];
  const split = SPLIT_NUMBER[phase]!;
  const name = splitName(state, slug, split);
  const playoffTeams = Math.min(6, league.teamIds.length);
  return {
    id: `${state.season}-${phase}-${slug}`,
    name,
    phase,
    kind: 'league',
    leagueSlug: slug,
    image: league.image,
    // Copa: turno único; splits 2 e 3: turno e returno. Playoffs em MD5.
    stages: [
      stage(split === 1 ? 'rr1' : 'rr2', 'Fase regular', 1, league.teamIds),
      stage('playoffs', 'Playoffs', 5, [], playoffTeams),
    ],
    stageIndex: 0,
    done: false,
  };
}

export function leagueRanking(state: GameState, phase: PhaseId, slug: string): string[] {
  return state.competitions.find((c) => c.id === `${state.season}-${phase}-${slug}`)?.ranking ?? [];
}

/**
 * Monta a lista de classificados a partir de [liga, posição]. Se faltar alguma liga,
 * completa com os próximos colocados das ligas mais fortes.
 */
function qualify(state: GameState, phase: PhaseId, slots: [string, number][]): string[] {
  const picked: string[] = [];
  for (const [slug, pos] of slots) {
    const team = leagueRanking(state, phase, slug)[pos - 1];
    if (team && !picked.includes(team)) picked.push(team);
  }
  for (let pos = 1; picked.length < slots.length && pos <= 10; pos++) {
    for (const slug of MAJORS) {
      const team = leagueRanking(state, phase, slug)[pos - 1];
      if (team && !picked.includes(team) && picked.length < slots.length) picked.push(team);
    }
  }
  return picked;
}

function intlComp(state: GameState, phase: PhaseId, name: string, stages: Stage[]): Competition {
  return {
    id: `${state.season}-${phase}`,
    name,
    phase,
    kind: 'international',
    image: INTL_IMAGES[phase] ?? '',
    stages,
    stageIndex: 0,
    done: false,
  };
}

function createPhase(state: GameState, phase: PhaseId): Competition[] {
  switch (phase) {
    case 'split1':
    case 'split2':
    case 'split3':
      return Object.keys(state.leagues).map((slug) => leagueComp(state, slug, phase));
    case 'firstStand': {
      const teams = qualify(state, 'split1', [
        ['lck', 1], ['lpl', 1], ['lec', 1], ['lck', 2], ['lpl', 2], ['lcs', 1], ['lcp', 1], ['cblol-brazil', 1],
      ]);
      return [intlComp(state, phase, 'First Stand', [stage('knockout', 'Mata-mata', 5, teams)])];
    }
    case 'msi': {
      const direct = qualify(state, 'split2', [['lck', 1], ['lpl', 1], ['lec', 1], ['lck', 2], ['lpl', 2], ['lcs', 1]]);
      const playin = qualify(state, 'split2', [['lcp', 1], ['cblol-brazil', 1], ['lec', 2], ['lcs', 2]]).filter(
        (t) => !direct.includes(t),
      );
      if (playin.length < 4) {
        const teams = [...direct, ...playin].slice(0, 8);
        return [intlComp(state, phase, 'Mid-Season Invitational', [stage('knockout', 'Mata-mata', 5, teams)])];
      }
      return [
        intlComp(state, phase, 'Mid-Season Invitational', [
          stage('playin', 'Play-in', 5, playin),
          stage('knockout', 'Mata-mata', 5, direct, 2),
        ]),
      ];
    }
    case 'ewc': {
      // Os 8 melhores do MSI disputam a Esports World Cup.
      const msi = state.competitions.find((c) => c.id === `${state.season}-msi`);
      const teams = (msi?.ranking ?? []).slice(0, 8);
      return [intlComp(state, phase, 'Esports World Cup', [stage('knockout', 'Mata-mata', 3, teams)])];
    }
    case 'worlds': {
      const teams = qualify(state, 'split3', [
        ['lck', 1], ['lpl', 1], ['lec', 1], ['lcs', 1], ['lcp', 1], ['cblol-brazil', 1],
        ['lck', 2], ['lpl', 2], ['lec', 2], ['lcs', 2], ['lcp', 2],
        ['lck', 3], ['lpl', 3], ['lec', 3], ['lck', 4], ['lpl', 4],
      ]);
      return [
        intlComp(state, phase, 'Worlds', [
          stage('swiss', 'Fase suíça', 1, teams),
          stage('knockout', 'Mata-mata', 5, [], 8),
        ]),
      ];
    }
    case 'offseason':
      return [];
  }
}

/** Atualiza os nomes das competições de um save antigo (e os títulos já registrados). */
export function renameCompetitions(state: GameState): GameState {
  const renamed = new Map<string, string>();
  const competitions = state.competitions.map((c) => {
    const split = SPLIT_NUMBER[c.phase];
    if (c.kind !== 'league' || !split || !c.leagueSlug) return c;
    const name = splitName(state, c.leagueSlug, split);
    if (name === c.name) return c;
    renamed.set(c.name, name);
    return { ...c, name };
  });
  if (!renamed.size) return state;
  const titles = state.titles.map((t) =>
    t.season === state.season && renamed.has(t.compName) ? { ...t, compName: renamed.get(t.compName)! } : t,
  );
  return { ...state, competitions, titles };
}

/** Abre uma fase da temporada: cria as competições e as primeiras rodadas. */
export function enterPhase(state: GameState, phase: PhaseId) {
  state.phase = phase;
  const comps = createPhase(state, phase);
  state.competitions.push(...comps);
  for (const comp of comps) {
    startStage(state, comp, 0, comp.stages[0].teamIds);
    prepare(state, comp);
  }
}

// ---------------------------------------------------------------- formatos

const seriesOf = (state: GameState, ids: string[]) => ids.map((id) => state.series[id]);
const loser = (s: Series) => (s.winner === s.a ? s.b : s.a);

function knockoutLabel(seriesCount: number): string {
  return seriesCount === 1 ? 'Final' : seriesCount === 2 ? 'Semifinal' : seriesCount === 4 ? 'Quartas de final' : 'Oitavas de final';
}

export interface StandingRow {
  teamId: string;
  wins: number;
  losses: number;
  killsFor: number;
  killsAgainst: number;
  streak: string;
}

/** Tabela de uma fase de pontos corridos (ou registro V-D da fase suíça). */
export function stageStandings(state: GameState, st: Stage): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    st.teamIds.map((id) => [id, { teamId: id, wins: 0, losses: 0, killsFor: 0, killsAgainst: 0, streak: '' }]),
  );
  for (const s of seriesOf(state, st.rounds.flat())) {
    if (!s.winner) continue;
    for (const [id, kf, ka] of [
      [s.a, s.kills[0], s.kills[1]],
      [s.b, s.kills[1], s.kills[0]],
    ] as const) {
      const row = rows.get(id)!;
      const won = s.winner === id;
      if (won) row.wins++;
      else row.losses++;
      row.killsFor += kf;
      row.killsAgainst += ka;
      row.streak = (row.streak + (won ? 'V' : 'D')).slice(-5);
    }
  }
  const seed = (id: string) => st.teamIds.indexOf(id);
  return [...rows.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.killsFor - b.killsAgainst - (a.killsFor - a.killsAgainst) ||
      seed(a.teamId) - seed(b.teamId),
  );
}

function nextRound(state: GameState, comp: Competition, idx: number): string[] | null {
  const st = comp.stages[idx];
  const t = st.teamIds;
  const r = st.rounds.length;
  const prev = r ? seriesOf(state, st.rounds[r - 1]) : [];
  const seed = (id: string) => t.indexOf(id);
  const make = (label: string, a: string, b: string, bestOf = st.bestOf) =>
    seed(a) <= seed(b) ? newSeries(state, comp, idx, r, label, a, b, bestOf) : newSeries(state, comp, idx, r, label, b, a, bestOf);

  switch (st.kind) {
    case 'rr1':
    case 'rr2':
      return null;

    case 'playin':
      return r === 0 ? [make('Play-in', t[0], t[3]), make('Play-in', t[1], t[2])] : null;

    // Top 6: 1º e 2º esperam nas semis; 3º×6º e 4º×5º nas quartas.
    case 'playoffs': {
      if (t.length < 6) return r === 0 ? [make('Semifinal', t[0], t[3]), make('Semifinal', t[1], t[2])] : r === 1 ? [make('Final', prev[0].winner!, prev[1].winner!)] : null;
      if (r === 0) return [make('Quartas de final', t[2], t[5]), make('Quartas de final', t[3], t[4])];
      if (r === 1) {
        const [w1, w2] = prev.map((s) => s.winner!);
        const [low, other] = seed(w1) > seed(w2) ? [w1, w2] : [w2, w1];
        return [make('Semifinal', t[0], low), make('Semifinal', t[1], other)];
      }
      if (r === 2) return [make('Final', prev[0].winner!, prev[1].winner!)];
      return null;
    }

    case 'knockout': {
      if (r === 0) {
        const order = t.length >= 8 ? [[0, 7], [3, 4], [1, 6], [2, 5]] : t.length >= 4 ? [[0, 3], [1, 2]] : [[0, 1]];
        return order.map(([i, j]) => make(knockoutLabel(order.length), t[i], t[j]));
      }
      if (prev.length <= 1) return null;
      const winners = prev.map((s) => s.winner!);
      const label = knockoutLabel(winners.length / 2);
      const out: string[] = [];
      for (let i = 0; i < winners.length; i += 2) out.push(make(label, winners[i], winners[i + 1]));
      return out;
    }

    // Fase suíça: times com a mesma campanha se enfrentam; 3 vitórias classifica, 3 derrotas elimina.
    case 'swiss': {
      const table = stageStandings(state, st);
      const active = table.filter((row) => row.wins < 3 && row.losses < 3);
      if (!active.length) return null;
      const groups = new Map<string, string[]>();
      for (const row of active) {
        const key = `${row.wins}-${row.losses}`;
        groups.set(key, [...(groups.get(key) ?? []), row.teamId]);
      }
      const out: string[] = [];
      let carry: string[] = [];
      for (const [key, members] of [...groups].sort(([a], [b]) => b.localeCompare(a))) {
        const pool = [...carry, ...members].sort((a, b) => seed(a) - seed(b));
        carry = pool.length % 2 ? [pool.pop()!] : [];
        const [w, l] = key.split('-').map(Number);
        // Jogos que valem classificação ou eliminação são MD3.
        const bestOf = w === 2 || l === 2 ? 3 : 1;
        for (let i = 0; i < pool.length / 2; i++) {
          out.push(make(`Rodada ${r + 1} · ${key}`, pool[i], pool[pool.length - 1 - i], bestOf));
        }
      }
      return out;
    }
  }
}

function stageResult(state: GameState, st: Stage): string[] {
  const seed = (id: string) => st.teamIds.indexOf(id);
  const bySeed = (ids: string[]) => [...ids].sort((a, b) => seed(a) - seed(b));
  switch (st.kind) {
    case 'rr1':
    case 'rr2':
    case 'swiss':
      return stageStandings(state, st).map((row) => row.teamId);
    case 'playin': {
      const series = seriesOf(state, st.rounds[0]);
      return [...bySeed(series.map((s) => s.winner!)), ...bySeed(series.map(loser))];
    }
    case 'playoffs':
    case 'knockout': {
      const rounds = st.rounds.map((ids) => seriesOf(state, ids));
      const final = rounds[rounds.length - 1][0];
      const out = [final.winner!];
      for (let i = rounds.length - 1; i >= 0; i--) out.push(...bySeed(rounds[i].map(loser)));
      return out;
    }
  }
}

/** Garante que a próxima rodada exista; encerra fases e competições quando acabam. */
function prepare(state: GameState, comp: Competition) {
  while (!comp.done) {
    const st = comp.stages[comp.stageIndex];
    if (st.played < st.rounds.length) return;
    const next = nextRound(state, comp, comp.stageIndex);
    if (next) {
      st.rounds.push(next);
      return;
    }
    st.result = stageResult(state, st);
    if (comp.stageIndex + 1 < comp.stages.length) {
      const nextStage = comp.stages[comp.stageIndex + 1];
      const entrants = [...nextStage.teamIds, ...st.result.slice(0, nextStage.fromPrevious)];
      comp.stageIndex++;
      startStage(state, comp, comp.stageIndex, entrants);
    } else {
      // Classificação final: última fase primeiro, depois quem caiu nas fases anteriores.
      const ranking: string[] = [];
      for (let i = comp.stages.length - 1; i >= 0; i--) {
        for (const id of comp.stages[i].result ?? []) if (!ranking.includes(id)) ranking.push(id);
      }
      comp.ranking = ranking;
      comp.championId = ranking[0];
      comp.done = true;
      state.titles.push({ season: state.season, compName: comp.name, championId: ranking[0] });
      recordTitle(state, comp);
    }
  }
}

// ---------------------------------------------------------------- jogo

export interface WeekContext {
  focus: Record<string, TrainingFocus>;
  detailed: Set<string>;
  rng: Rng;
}

const needed = (s: Series) => Math.ceil(s.bestOf / 2);

/** Joga um jogo da série. Campeões usados entram na lista do Fearless Draft. */
export function playSeriesGame(state: GameState, s: Series, ctx: WeekContext, options: GameOptions = {}): Game {
  const comp = state.competitions.find((c) => c.id === s.compId)!;
  const detailed = comp.kind === 'international' || ctx.detailed.has(comp.leagueSlug!);
  const g = s.wins[0] + s.wins[1];
  const aBlue = g % 2 === 0;
  s.fearless ??= [];
  const game = simulateGame(
    state,
    { id: `${s.id}#${g + 1}`, seriesId: s.id, blue: aBlue ? s.a : s.b, red: aBlue ? s.b : s.a },
    ctx.focus,
    detailed || !!options.draft,
    ctx.rng,
    { excluded: s.fearless, rich: s.a === state.coach.teamId || s.b === state.coach.teamId, ...options },
  );
  const aWon = game.winner === s.a;
  s.wins[aWon ? 0 : 1]++;
  const [ka, kb] = aBlue ? game.kills : [game.kills[1], game.kills[0]];
  s.kills = [s.kills[0] + ka, s.kills[1] + kb];
  if (game.detail) {
    recordGame(state, game);
    state.games[game.id] = game;
    s.gameIds.push(game.id);
    s.fearless.push(...[...game.detail.blueLines, ...game.detail.redLines].map((l) => l.champion));
  }
  if (s.wins[0] >= needed(s) || s.wins[1] >= needed(s)) finishSeries(state, s);
  return game;
}

function finishSeries(state: GameState, s: Series) {
  s.winner = s.wins[0] > s.wins[1] ? s.a : s.b;
  s.week = state.week;
  // Moral: vitória anima, derrota abala.
  for (const teamId of [s.a, s.b]) {
    // O psicólogo amortece o impacto das derrotas no time do coach.
    const cushion =
      teamId === state.coach.teamId
        ? Math.max(0, 1 - staffLevel(state, 'psychologist') * 0.12 - (coachStyle(state) === 'motivator' ? 0.3 : 0))
        : 1;
    const delta = s.winner === teamId ? 3 : -3 * cushion;
    for (const p of starters(state, teamId)) p.morale = clamp(Math.round(p.morale + delta), 0, 100);
  }
}

function playSeries(state: GameState, s: Series, ctx: WeekContext) {
  while (!s.winner) playSeriesGame(state, s, ctx);
}

/** Rodadas de pontos corridos são jogadas em dobro (2 jogos por semana). */
function roundsPerWeek(st: Stage): number {
  return isRoundRobin(st.kind) ? 2 : 1;
}

/** Séries que serão jogadas nesta semana em uma competição. */
export function seriesThisWeek(state: GameState, comp: Competition): Series[] {
  if (comp.done) return [];
  const st = comp.stages[comp.stageIndex];
  return seriesOf(state, st.rounds.slice(st.played, st.played + roundsPerWeek(st)).flat());
}

/** Próxima série do time na fase atual (mesmo que seja em semanas futuras), e em quantas semanas. */
export function nextSeriesFor(state: GameState, teamId: string): { series: Series; weeksAway: number } | null {
  for (const comp of currentCompetitions(state)) {
    if (comp.done) continue;
    const st = comp.stages[comp.stageIndex];
    for (let r = st.played; r < st.rounds.length; r++) {
      const s = seriesOf(state, st.rounds[r]).find((x) => !x.winner && (x.a === teamId || x.b === teamId));
      if (s) return { series: s, weeksAway: Math.floor((r - st.played) / roundsPerWeek(st)) };
    }
  }
  return null;
}

/** Últimos resultados do time na temporada (V/D), do mais antigo para o mais recente. */
export function recentForm(state: GameState, teamId: string, count = 5): ('V' | 'D')[] {
  return Object.values(state.series)
    .filter((s) => s.winner && (s.a === teamId || s.b === teamId))
    .sort((a, b) => (a.week ?? 0) - (b.week ?? 0))
    .slice(-count)
    .map((s) => (s.winner === teamId ? 'V' : 'D'));
}

/** Joga a semana de todas as competições da fase atual. Retorna as séries jogadas. */
export function playWeek(state: GameState, ctx: WeekContext): Series[] {
  const played: Series[] = [];
  const comps = currentCompetitions(state);
  for (const comp of comps) {
    if (comp.done) continue;
    const st = comp.stages[comp.stageIndex];
    for (let n = 0; n < roundsPerWeek(st) && st.played < st.rounds.length; n++) {
      for (const s of seriesOf(state, st.rounds[st.played])) {
        playSeries(state, s, ctx);
        played.push(s);
      }
      st.played++;
    }
  }
  for (const comp of comps) prepare(state, comp);
  if (state.phase !== 'offseason' && comps.every((c) => c.done)) {
    const idx = PHASES.findIndex((p) => p.id === state.phase);
    enterPhase(state, PHASES[idx + 1].id);
  }
  return played;
}
