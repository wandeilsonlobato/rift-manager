import { clamp, createRng, gauss, pick, randInt, shuffle, type Rng } from './random';
import type { Champion } from './ddragon';
import { newPatch } from './meta';
import { enterPhase } from './season';
import { generateStaffMarket } from './staff';
import { recordSeasonHistory } from './stats';
import { ROLE_LABEL, ROLES, type GameState, type Player, type Proposal, type Role, type SplitResult } from './types';
import { askingSalary, makeProposal, objectiveFor, overall, starters, strengthRank, teamStrength } from './world';

export const MAX_ROSTER = 10;
/** Reputação usada pelos times da IA ao negociar. */
const AI_REPUTATION = 30;

const leagueOf = (state: GameState, teamId: string) => state.leagues[state.teams[teamId].leagueSlug];

export function payroll(state: GameState, teamId: string): number {
  return state.teams[teamId].playerIds.reduce((sum, id) => sum + state.players[id].salary, 0);
}

/** Jogadores com contrato para a próxima temporada (no mercado, quem está vencendo já não conta). */
export function committedRoster(state: GameState, teamId: string): Player[] {
  const roster = state.teams[teamId].playerIds.map((id) => state.players[id]);
  return state.phase === 'offseason' ? roster.filter((p) => !isExpiring(state, p)) : roster;
}

export function committedPayroll(state: GameState, teamId: string): number {
  return committedRoster(state, teamId).reduce((sum, p) => sum + p.salary, 0);
}

/** Nível do jogador na escala de prestígio das ligas (≈1 regional, ≈5 elite). */
function playerLevel(p: Player): number {
  return (overall(p) - 43) / 6;
}

/** Contrato vence ao fim desta temporada. */
export function isExpiring(state: GameState, p: Player): boolean {
  return !!p.teamId && p.contractEnd <= state.season;
}

/** Salário que o jogador pede para jogar no time. */
export function marketAsk(state: GameState, p: Player, teamId: string): number {
  return askingSalary(overall(p), Math.max(leagueOf(state, teamId).prestige, playerLevel(p) - 0.5));
}

/** Chance (0-100) de o jogador aceitar a proposta. */
export function interest(state: GameState, p: Player, teamId: string, salary: number, reputation = state.coach.reputation): number {
  const ratio = salary / marketAsk(state, p, teamId);
  const prestigeGap = leagueOf(state, teamId).prestige - playerLevel(p);
  // Jogadores querem ser titulares.
  const starter = starters(state, teamId).find((s) => s.role === p.role);
  const playTime = !starter || starter.id === p.id || overall(p) >= overall(starter) ? 10 : -15;
  let value = 50 + (ratio - 1) * 120 + prestigeGap * 10 + (reputation - 30) / 3 + playTime;
  if (p.teamId && p.teamId !== teamId) value -= 10;
  if (p.teamId === teamId) value += (p.morale - 60) / 2;
  return Math.round(clamp(value, 0, 100));
}

/** Multa para tirar o jogador de outro time. */
export function transferFee(state: GameState, p: Player): number {
  if (!p.teamId || isExpiring(state, p)) return 0;
  return Math.round(p.salary * 6 * (p.contractEnd - state.season));
}

/** Custo para dispensar um jogador do próprio elenco. */
export function releaseCost(state: GameState, p: Player): number {
  const yearsLeft = p.contractEnd - state.season;
  return yearsLeft <= 0 ? 0 : Math.round(p.salary * 3 * yearsLeft);
}

export function signBlocker(state: GameState, p: Player, salary: number): string | null {
  const teamId = state.coach.teamId!;
  const team = state.teams[teamId];
  if (state.phase !== 'offseason') return 'A janela de transferências abre no fim da temporada.';
  if (state.refused.includes(p.id)) return 'Este jogador já recusou uma proposta nesta janela.';
  // Renovação: o jogador que vence não está na folha comprometida; quem não vence sai dela para trocar o salário.
  const own = p.teamId === teamId;
  const base = committedPayroll(state, teamId) - (own && !isExpiring(state, p) ? p.salary : 0);
  if (base + salary > team.budget) return 'O salário estoura o teto salarial.';
  if (own) return null;
  if (committedRoster(state, teamId).length >= MAX_ROSTER) return `Elenco cheio (máximo ${MAX_ROSTER}).`;
  if (transferFee(state, p) > team.cash) return 'Caixa insuficiente para pagar a multa.';
  return null;
}

function moveToTeam(state: GameState, p: Player, teamId: string | null) {
  if (p.teamId) {
    const old = state.teams[p.teamId];
    old.playerIds = old.playerIds.filter((id) => id !== p.id);
  }
  p.teamId = teamId;
  if (teamId) state.teams[teamId].playerIds.push(p.id);
  else p.contractEnd = 0;
}

export interface OfferOutcome {
  state: GameState;
  accepted: boolean;
  message: string;
}

/** Proposta para agente livre, jogador de outro time ou renovação de alguém do elenco. */
export function makeOffer(prev: GameState, playerId: string, salary: number, years: number): OfferOutcome {
  const state = structuredClone(prev);
  const p = state.players[playerId];
  const teamId = state.coach.teamId!;
  const blocker = signBlocker(state, p, salary);
  if (blocker) return { state: prev, accepted: false, message: blocker };

  const chance = interest(state, p, teamId, salary);
  const renewal = p.teamId === teamId;
  if (Math.random() * 100 >= chance) {
    state.refused.push(p.id);
    return { state, accepted: false, message: `${p.nick} recusou a proposta.` };
  }

  const fee = transferFee(state, p);
  if (fee && p.teamId) {
    state.teams[teamId].cash -= fee;
    state.teams[p.teamId].cash += fee;
  }
  if (!renewal) {
    moveToTeam(state, p, teamId);
    // Jogador novo ainda precisa se entrosar.
    state.teams[teamId].chemistry = clamp((state.teams[teamId].chemistry ?? 60) - 6, 0, 100);
  }
  p.salary = salary;
  p.contractEnd = state.season + years;
  p.morale = clamp(p.morale + 10, 0, 100);
  const team = state.teams[teamId];
  state.news.unshift(
    renewal
      ? `${team.name} renova com ${p.nick} até ${p.contractEnd}.`
      : `${team.name} contrata ${p.nick}${fee ? ` (multa de $${fee}k)` : ''}.`,
  );
  return { state, accepted: true, message: renewal ? `${p.nick} renovou!` : `${p.nick} aceitou a proposta!` };
}

export function releasePlayer(prev: GameState, playerId: string): OfferOutcome {
  const state = structuredClone(prev);
  const p = state.players[playerId];
  const team = state.teams[state.coach.teamId!];
  const cost = releaseCost(state, p);
  if (cost > team.cash) return { state: prev, accepted: false, message: 'Caixa insuficiente para pagar a rescisão.' };
  team.cash -= cost;
  moveToTeam(state, p, null);
  state.news.unshift(`${team.name} dispensa ${p.nick}.`);
  return { state, accepted: true, message: `${p.nick} foi dispensado${cost ? ` (rescisão de $${cost}k)` : ''}.` };
}

// ---------------------------------------------------------------- fim de temporada

const INTL_BONUS: Record<string, number> = {
  firstStand: 10,
  msi: 15,
  ewc: 10,
  worlds: 25,
};

/** Avalia o coach: reputação, demissão e histórico da carreira. */
function reviewCoach(state: GameState) {
  const teamId = state.coach.teamId!;
  const team = state.teams[teamId];
  const league = leagueOf(state, teamId);
  const results: SplitResult[] = state.competitions
    .filter((c) => c.kind === 'league' && c.leagueSlug === league.slug && c.ranking)
    .map((c) => ({ compName: c.name, rank: c.ranking!.indexOf(teamId) + 1 }));
  const titles = state.competitions.filter((c) => c.championId === teamId).map((c) => c.name);

  const avgRank = results.reduce((s, r) => s + r.rank, 0) / Math.max(1, results.length);
  const target = state.coach.objective?.targetRank ?? 5;
  let delta = Math.round((target - avgRank) * 3.5);
  for (const c of state.competitions) {
    if (c.championId !== teamId) continue;
    delta += c.kind === 'international' ? INTL_BONUS[c.phase] : Math.round(8 * (league.prestige / 3));
  }
  if (state.competitions.some((c) => c.phase === 'worlds' && c.stages[0].teamIds.includes(teamId))) delta += 5;
  delta = clamp(delta, -25, 40);
  const fired = delta <= -12;

  state.coach.reputation = clamp(state.coach.reputation + delta, 0, 100);
  if (fired) state.coach.contractEnd = state.season;
  const verdict = fired
    ? 'A diretoria ficou muito insatisfeita e decidiu te demitir.'
    : delta >= 10
      ? 'Temporada excelente! A diretoria está radiante.'
      : delta >= 0
        ? 'A diretoria está satisfeita com o seu trabalho.'
        : 'A diretoria esperava mais desta temporada.';

  state.review = { season: state.season, teamId, results, titles, reputationDelta: delta, fired, verdict };
  state.career.push({ season: state.season, teamId, teamName: team.name, results, titles });
}

/** Propostas para o coach no fim da temporada, conforme a reputação. */
function coachOffers(state: GameState, rng: Rng): Proposal[] {
  const { coach } = state;
  const current = coach.teamId!;
  const review = state.review!;
  const offers: Proposal[] = [];
  const contractEnds = coach.contractEnd <= state.season;

  if (contractEnds && !review.fired) {
    const renewal = makeProposal(state, current, rng);
    offers.push({ ...renewal, salary: Math.max(renewal.salary, coach.salary + 1), renewal: true });
  }

  // Academy campeã ou no topo: o time principal chama.
  const parentId = state.teams[current].parentTeamId;
  const avgRank = review.results.reduce((s, r) => s + r.rank, 0) / Math.max(1, review.results.length);
  if (parentId && (review.titles.length > 0 || avgRank <= 2.5) && coach.reputation >= 25) {
    offers.push(makeProposal(state, parentId, rng));
  }

  const level = 1 + coach.reputation / 20;
  const region = leagueOf(state, current).region;
  // A maioria das propostas vem da própria região; de vez em quando, uma do exterior.
  const candidates = Object.values(state.teams).filter((t) => {
    const league = state.leagues[t.leagueSlug];
    const p = league.prestige;
    const sameRegion = league.region === region || rng() < 0.08;
    return sameRegion && t.id !== current && t.id !== parentId && p <= level + 0.3 && p >= level - 2;
  });
  const count = coach.reputation >= 60 ? 3 : coach.reputation >= 30 ? 2 : 1;
  // Times mais fortes só chamam coaches de reputação alta: sorteia entre os mais fracos do nível.
  const pool = shuffle(rng, candidates)
    .sort((a, b) => teamStrength(state, a.id) - teamStrength(state, b.id))
    .slice(0, 12);
  for (const t of shuffle(rng, pool).slice(0, count)) offers.push(makeProposal(state, t.id, rng));

  if (!offers.some((o) => o.teamId !== current) && review.fired) {
    const fallback = Object.values(state.teams)
      .filter((t) => state.leagues[t.leagueSlug].tier === 2 && t.id !== current)
      .sort((a, b) => teamStrength(state, a.id) - teamStrength(state, b.id))
      .slice(0, 8);
    for (const t of shuffle(rng, fallback).slice(0, 2)) offers.push(makeProposal(state, t.id, rng));
  }
  return offers;
}

/** Times da IA decidem quem renovar entre os contratos que vencem. */
function aiContracts(state: GameState, rng: Rng) {
  for (const team of Object.values(state.teams)) {
    if (team.id === state.coach.teamId) continue;
    const lineup = new Set(starters(state, team.id).map((p) => p.id));
    const strength = teamStrength(state, team.id);
    const prestige = state.leagues[team.leagueSlug].prestige;
    for (const id of [...team.playerIds]) {
      const p = state.players[id];
      if (!isExpiring(state, p)) continue;
      if ((lineup.has(id) || overall(p) >= strength - 4) && p.age < 31 && rng() < 0.85) {
        p.contractEnd = state.season + randInt(rng, 1, 3);
        p.salary = askingSalary(overall(p), prestige);
      } else {
        moveToTeam(state, p, null);
      }
    }
  }
}

const SYLLABLES = ['ka', 'ri', 'no', 'zen', 'vex', 'lu', 'mo', 'tor', 'shi', 'ra', 'gon', 'fly', 'ice', 'dra', 'ko', 'xi', 'ya', 'bo', 'lex', 'qi', 'sol', 'nyx', 'jin', 'ark'];

/** Novos talentos aparecem no mercado de cada região. */
function generateRookies(state: GameState, rng: Rng) {
  const championsByRole = new Map<Role, string[]>();
  for (const p of Object.values(state.players)) {
    championsByRole.set(p.role, [...new Set([...(championsByRole.get(p.role) ?? []), ...p.champions])]);
  }
  const taken = new Set(Object.values(state.players).map((p) => p.nick.toLowerCase()));
  const nick = () => {
    for (;;) {
      const raw = pick(rng, SYLLABLES) + pick(rng, SYLLABLES) + (rng() < 0.3 ? randInt(rng, 1, 9) : '');
      const name = raw[0].toUpperCase() + raw.slice(1);
      if (!taken.has(name.toLowerCase())) {
        taken.add(name.toLowerCase());
        return name;
      }
    }
  };
  let n = 0;
  for (const league of Object.values(state.leagues).filter((l) => l.tier === 1)) {
    for (const role of ROLES) {
      if (rng() < 0.4) continue;
      const base = 34 + league.prestige * 5 + gauss(rng) * 4;
      const a = () => clamp(Math.round(base + gauss(rng) * 5), 25, 99);
      const id = `gen-${state.season}-${n++}`;
      const p: Player = {
        id,
        nick: nick(),
        firstName: 'Novo',
        lastName: 'Talento',
        image: '',
        role,
        age: randInt(rng, 17, 18),
        attrs: { mechanics: a(), laning: a(), teamfight: a(), macro: a(), mental: a() },
        potential: 0,
        morale: 70,
        salary: 0,
        contractEnd: 0,
        champions: shuffle(rng, championsByRole.get(role) ?? []).slice(0, randInt(rng, 3, 4)),
        teamId: null,
        region: league.region,
      };
      p.potential = clamp(overall(p) + randInt(rng, 12, 30), 0, 99);
      p.salary = askingSalary(overall(p), league.prestige);
      state.players[id] = p;
    }
  }
  if (n) state.news.unshift(`${n} novos talentos chegaram ao mercado.`);
}

/** Chamado quando o Worlds termina e a fase de mercado começa. */
export function beginOffseason(state: GameState) {
  const rng = createRng(`offseason-${state.season}-${Date.now()}`);
  state.news = [];
  state.refused = [];
  state.pendingEvent = null;
  reviewCoach(state);
  aiContracts(state, rng);
  generateRookies(state, rng);
  state.proposals = coachOffers(state, rng);
}

// ---------------------------------------------------------------- nova temporada

export function startBlockers(state: GameState): string[] {
  const out: string[] = [];
  if (state.coach.contractEnd <= state.season) out.push('Você está sem contrato: aceite uma proposta.');
  const teamId = state.coach.teamId!;
  const staying = state.teams[teamId].playerIds.map((id) => state.players[id]).filter((p) => !isExpiring(state, p));
  const missing = ROLES.filter((r) => !staying.some((p) => p.role === r));
  if (missing.length) out.push(`Faltam jogadores com contrato para: ${missing.map((r) => ROLE_LABEL[r]).join(', ')}.`);
  return out;
}

/** Envelhecimento: jovens evoluem rumo ao potencial, veteranos caem. */
function develop(p: Player, rng: Rng) {
  p.age++;
  const room = Math.max(0, p.potential - overall(p));
  const attrs = { ...p.attrs };
  for (const k of Object.keys(attrs) as (keyof typeof attrs)[]) {
    let d: number;
    if (p.age <= 23) d = Math.round(rng() * room * 0.35);
    else if (p.age <= 27) d = randInt(rng, -1, 1) + (room > 0 ? randInt(rng, 0, 1) : 0);
    else d = -randInt(rng, 0, 2) - (p.age >= 30 ? 1 : 0);
    attrs[k] = clamp(attrs[k] + d, 25, 99);
  }
  p.attrs = attrs;
  p.potential = Math.max(overall(p), p.potential - (p.age >= 26 ? 1 : 0));
  p.morale = Math.round((p.morale + 70) / 2);
}

function retirements(state: GameState, rng: Rng) {
  for (const p of Object.values(state.players)) {
    const ovr = overall(p);
    const chance =
      p.age >= 33 ? 0.6 : p.age >= 31 ? 0.25 : !p.teamId && p.age >= 27 && ovr < 50 ? 0.3 : 0;
    if (rng() >= chance) continue;
    if (p.teamId === state.coach.teamId || ovr >= 72) state.news.push(`${p.nick} anuncia aposentadoria aos ${p.age} anos.`);
    if (p.teamId) moveToTeam(state, p, null);
    delete state.players[p.id];
  }
}

/** Times da IA completam o elenco e buscam reforços no mercado. */
function aiMarket(state: GameState, rng: Rng) {
  const free = Object.values(state.players)
    .filter((p) => !p.teamId)
    .sort((a, b) => overall(b) - overall(a));
  const teams = Object.values(state.teams)
    .filter((t) => t.id !== state.coach.teamId)
    .sort((a, b) => state.leagues[b.leagueSlug].prestige - state.leagues[a.leagueSlug].prestige || rng() - 0.5);

  const sign = (teamId: string, p: Player) => {
    const prestige = state.leagues[state.teams[teamId].leagueSlug].prestige;
    moveToTeam(state, p, teamId);
    state.teams[teamId].chemistry = clamp((state.teams[teamId].chemistry ?? 60) - 6, 0, 100);
    p.salary = marketAsk(state, p, teamId);
    p.contractEnd = state.season + randInt(rng, 1, 3);
    free.splice(free.indexOf(p), 1);
    if (overall(p) >= 70 || prestige >= 4 || teamId === state.coach.teamId) {
      state.news.push(`${state.teams[teamId].name} contrata ${p.nick}.`);
    }
  };
  const candidates = (teamId: string, role: Role) => {
    const region = state.leagues[state.teams[teamId].leagueSlug].region;
    return free.filter((p) => p.role === role && (p.region === region || p.region === null || rng() < 0.1));
  };

  // O time do coach também é completado se alguém se aposentou e deixou uma rota vazia.
  for (const team of [state.teams[state.coach.teamId!], ...teams]) {
    const roster = () => team.playerIds.map((id) => state.players[id]);
    // 1. Completa as rotas vazias com o melhor disponível que aceite.
    for (const role of ROLES) {
      if (roster().some((p) => p.role === role)) continue;
      const options = candidates(team.id, role);
      const choice =
        options.find((p) => interest(state, p, team.id, marketAsk(state, p, team.id), AI_REPUTATION) >= 50) ??
        options[options.length - 1];
      if (choice) sign(team.id, choice);
    }
    if (team.id === state.coach.teamId) continue;
    // 2. Um reforço por temporada se aparecer alguém bem melhor que o titular.
    if (team.playerIds.length >= MAX_ROSTER || rng() < 0.4) continue;
    const weakest = starters(state, team.id).sort((a, b) => overall(a) - overall(b))[0];
    if (!weakest) continue;
    const upgrade = candidates(team.id, weakest.role).find(
      (p) =>
        overall(p) >= overall(weakest) + 4 &&
        payroll(state, team.id) + marketAsk(state, p, team.id) <= team.budget * 1.1 &&
        interest(state, p, team.id, marketAsk(state, p, team.id), AI_REPUTATION) >= 55,
    );
    if (upgrade) sign(team.id, upgrade);
  }
  // Elencos inchados dispensam os reservas mais fracos.
  for (const team of teams) {
    while (team.playerIds.length > MAX_ROSTER - 2) {
      const lineup = new Set(starters(state, team.id).map((p) => p.id));
      const worst = team.playerIds
        .map((id) => state.players[id])
        .filter((p) => !lineup.has(p.id))
        .sort((a, b) => overall(a) - overall(b))[0];
      if (!worst) break;
      moveToTeam(state, worst, null);
    }
  }
}

/** Fecha o mercado e começa a próxima temporada. */
export function startNewSeason(prev: GameState, champions: Champion[]): GameState {
  const state = structuredClone(prev);
  const rng = createRng(`season-${state.season}-${Date.now()}`);
  const myTeam = state.coach.teamId!;
  state.news = [];

  // Contratos não renovados viram agentes livres.
  for (const id of [...state.teams[myTeam].playerIds]) {
    const p = state.players[id];
    if (isExpiring(state, p)) {
      moveToTeam(state, p, null);
      state.news.push(`${p.nick} deixa o ${state.teams[myTeam].name} ao fim do contrato.`);
    }
  }
  // As séries e jogos da temporada passada saem do save (os títulos ficam).
  state.competitions = [];
  state.series = {};
  state.games = {};
  state.lastReport = null;
  state.proposals = [];
  state.refused = [];

  recordSeasonHistory(state);
  retirements(state, rng);
  for (const p of Object.values(state.players)) develop(p, rng);
  aiMarket(state, rng);

  // Times da IA ajustam o teto à nova folha e recebem verba; o caixa do coach anda semana a semana.
  for (const team of Object.values(state.teams)) {
    if (team.id === myTeam) continue;
    team.budget = Math.max(team.budget, Math.round(payroll(state, team.id) * 1.2) + 5);
    team.cash += team.budget * 2;
  }
  // Títulos ampliam o teto salarial do time do coach.
  const titles = prev.review?.titles.length ?? 0;
  state.teams[myTeam].budget = Math.round(state.teams[myTeam].budget * (1 + titles * 0.05));

  state.season++;
  state.week = 1;
  const { rank, total } = strengthRank(state, myTeam);
  state.coach.objective = objectiveFor(rank, total);
  enterPhase(state, 'split1');
  newPatch(state, champions, rng);
  state.staffMarket = generateStaffMarket(state, rng);
  return state;
}
