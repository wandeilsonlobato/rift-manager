import leagueData from '../data/leagues.json';
import { championsForRole, type Champion } from './ddragon';
import { clamp, createRng, gauss, pick, randInt, shuffle, type Rng } from './random';
import { newPatch } from './meta';
import { proChampions, proDataVersion, realTeamBonus } from './pro';
import { enterPhase } from './season';
import { generateStaffMarket } from './staff';
import {
  ROLES,
  SAVE_VERSION,
  type Attributes,
  type CoachStyle,
  type GameState,
  type League,
  type Objective,
  type Player,
  type Proposal,
  type Role,
  type Team,
} from './types';

interface RawPlayer {
  id: string;
  nick: string;
  firstName: string;
  lastName: string;
  image: string;
  role: string;
}

interface RawFreeAgent extends RawPlayer {
  region: string | null;
}

interface RawTeam {
  id: string;
  name: string;
  code: string;
  image: string;
  players: RawPlayer[];
}

interface RawLeague {
  slug: string;
  name: string;
  region: string;
  image: string;
  prestige: number;
  teams: RawTeam[];
  academy: { slug: string; name: string; image: string; teams: RawTeam[] } | null;
}

export const RAW_LEAGUES = leagueData.leagues as RawLeague[];
const RAW_FREE_AGENTS = leagueData.freeAgents as RawFreeAgent[];

export const START_SEASON = 2026;

/** Campeões no pool inicial de cada jogador. */
const POOL_SIZE = 5;

/** Reservas que um time mantém além dos 5 titulares. */
const MAX_SUBS = 2;
/** Academies jogam num nível abaixo da liga principal. */
const ACADEMY_PRESTIGE_DROP = 1.5;

// Peso de cada atributo no overall, por rota.
const ROLE_WEIGHTS: Record<Role, Attributes> = {
  top: { mechanics: 0.25, laning: 0.3, teamfight: 0.2, macro: 0.1, mental: 0.15 },
  jungle: { mechanics: 0.15, laning: 0.05, teamfight: 0.2, macro: 0.4, mental: 0.2 },
  mid: { mechanics: 0.3, laning: 0.25, teamfight: 0.2, macro: 0.1, mental: 0.15 },
  bottom: { mechanics: 0.3, laning: 0.25, teamfight: 0.3, macro: 0.05, mental: 0.1 },
  support: { mechanics: 0.1, laning: 0.15, teamfight: 0.25, macro: 0.3, mental: 0.2 },
};

const ROOKIE_NICKS = [
  'Nyx', 'Kairo', 'Vex', 'Lumen', 'Draxx', 'Sora', 'Zephyr', 'Rook', 'Nami7', 'Blitzz',
  'Orion', 'Kaze', 'Mirage', 'Talon0', 'Echo', 'Riven9', 'Volt', 'Hex', 'Saint', 'Frost',
];

export function academyName(rl: RawLeague): string {
  return rl.academy?.name ?? `${rl.name} Academy`;
}

/** Salário mensal (em milhares) que um jogador pede, pelo nível e pela liga. */
export function askingSalary(ovr: number, prestige: number): number {
  return Math.round(((Math.max(ovr, 40) - 40) ** 2 / 40) * (0.6 + prestige * 0.25)) + 2;
}

export function overall(p: Player): number {
  const w = ROLE_WEIGHTS[p.role];
  let sum = 0;
  for (const k of Object.keys(w) as (keyof Attributes)[]) sum += p.attrs[k] * w[k];
  return Math.round(sum);
}

// IDs do lolesports crescem com o tempo: ID antigo = jogador cadastrado há muitos anos (veterano).
const OLDEST_ID = 98.7e15;
const NEWEST_ID = 115.5e15;

/** 0 = recém-chegado, 1 = veterano desde as primeiras temporadas. */
function experience(id: string): number {
  const n = Number(id);
  if (!Number.isFinite(n)) return 0;
  return clamp((NEWEST_ID - n) / (NEWEST_ID - OLDEST_ID), 0, 1);
}

function makeAttributes(rng: Rng, base: number): Attributes {
  const a = () => clamp(Math.round(base + gauss(rng) * 5), 25, 99);
  return { mechanics: a(), laning: a(), teamfight: a(), macro: a(), mental: a() };
}

function makeRookie(id: string, role: Role, rng: Rng): RawPlayer {
  return {
    id: `rookie-${id}-${role}`,
    nick: pick(rng, ROOKIE_NICKS),
    firstName: 'Jogador',
    lastName: 'Novato',
    image: '',
    role,
  };
}

/** Cria um mundo novo: ligas principais, academies e agentes livres. */
class WorldBuilder {
  leagues: Record<string, League> = {};
  teams: Record<string, Team> = {};
  players: Record<string, Player> = {};
  private poolByRegion = new Map<string | null, RawFreeAgent[]>();
  private regionPrestige = new Map<string, number>();
  private championsByRole: Record<Role, Champion[]>;
  private championIds: Set<string>;

  constructor(champions: Champion[]) {
    this.championIds = new Set(champions.map((c) => c.id));
    this.championsByRole = Object.fromEntries(
      ROLES.map((r) => [r, championsForRole(champions, r)]),
    ) as Record<Role, Champion[]>;
    for (const rl of RAW_LEAGUES) {
      this.regionPrestige.set(rl.region, Math.max(this.regionPrestige.get(rl.region) ?? 0, rl.prestige));
    }
    for (const fa of RAW_FREE_AGENTS) {
      if (!ROLES.includes(fa.role as Role)) continue;
      const list = this.poolByRegion.get(fa.region) ?? [];
      list.push(fa);
      this.poolByRegion.set(fa.region, list);
    }
  }

  build() {
    for (const rl of RAW_LEAGUES) this.buildLeague(rl);
    // Quem sobrou no banco (jogadores atuais sem time, antigos e aposentados) fica livre no mercado.
    for (const [region, list] of this.poolByRegion) {
      for (const fa of list) this.makePlayer(fa, fa.role as Role, null, this.freeAgentPrestige(region), 0, region);
    }
    // Teto salarial com folga sobre a folha atual; caixa para multas e transferências.
    for (const team of Object.values(this.teams)) {
      const payroll = team.playerIds.reduce((sum, id) => sum + this.players[id].salary, 0);
      team.budget = Math.round(payroll * 1.25) + 5;
      team.cash = team.budget * 6;
    }
    return { leagues: this.leagues, teams: this.teams, players: this.players };
  }

  private freeAgentPrestige(region: string | null): number {
    return Math.max(1, (region ? (this.regionPrestige.get(region) ?? 2) : 2) - 1);
  }

  private makePlayer(
    raw: RawPlayer,
    role: Role,
    teamId: string | null,
    prestige: number,
    teamBonus: number,
    region: string | null,
  ): Player {
    const rng = createRng(raw.id);
    const xp = experience(raw.id);
    const age = clamp(Math.round(17 + xp * 11 + gauss(rng) * 1.5), 16, 32);
    const decline = Math.max(0, age - 28) * 1.5;
    const base = 43 + prestige * 6 + teamBonus + xp * 13 - decline + gauss(rng) * 2.5;
    const attrs = makeAttributes(rng, base);
    // Pool inicial de 5: os campeões mais usados pelo pro em partidas oficiais, completando com a rota.
    // O resto ele libera treinando "Draft e pool".
    const real = proChampions(raw.id).filter((id) => this.championIds.has(id)).slice(0, POOL_SIZE);
    const filler = shuffle(rng, this.championsByRole[role]).filter((c) => !real.includes(c.id));
    const pool = [...real, ...filler.slice(0, POOL_SIZE - real.length).map((c) => c.id)];
    const player: Player = {
      id: raw.id,
      nick: raw.nick,
      firstName: raw.firstName,
      lastName: raw.lastName,
      image: raw.image,
      role,
      age,
      attrs,
      potential: 0,
      morale: randInt(rng, 55, 85),
      salary: 0,
      contractEnd: teamId ? START_SEASON + randInt(rng, 0, 2) : 0,
      champions: pool,
      teamId,
      region,
    };
    const ovr = overall(player);
    player.potential = clamp(ovr + Math.max(0, Math.round((24 - age) * 2.5 + gauss(rng) * 4)), ovr, 99);
    player.salary = askingSalary(ovr, prestige);
    this.players[raw.id] = player;
    return player;
  }

  /** Pega um agente livre da região para a rota (ou de região desconhecida). */
  private takeFromPool(region: string, role: Role, rng: Rng): RawFreeAgent | null {
    for (const key of [region, null]) {
      const list = this.poolByRegion.get(key) ?? [];
      const options = list.filter((p) => p.role === role);
      if (!options.length) continue;
      const chosen = pick(rng, options);
      list.splice(list.indexOf(chosen), 1);
      return chosen;
    }
    return null;
  }

  /**
   * Define titulares (melhor por rota) e reservas. Rotas vazias são preenchidas com agentes
   * livres da região ou novatos. Retorna quem não coube no elenco.
   */
  private assemble(team: Team, candidates: Player[], region: string, prestige: number, rng: Rng): Player[] {
    const sorted = [...candidates].sort((a, b) => overall(b) - overall(a));
    const roster: Player[] = [];
    for (const role of ROLES) {
      let p = sorted.find((x) => x.role === role && !roster.includes(x));
      if (!p) {
        const raw = this.takeFromPool(region, role, rng) ?? makeRookie(team.id, role, rng);
        p = this.makePlayer(raw, role, team.id, prestige, 0, region);
      }
      roster.push(p);
    }
    const rest = sorted.filter((p) => !roster.includes(p));
    roster.push(...rest.splice(0, MAX_SUBS));
    for (const p of roster) p.teamId = team.id;
    for (const p of rest) {
      p.teamId = null;
      p.contractEnd = 0;
    }
    team.playerIds = roster.map((p) => p.id);
    return rest;
  }

  private newTeam(raw: Pick<RawTeam, 'id' | 'name' | 'code' | 'image'>, leagueSlug: string): Team {
    const team: Team = {
      id: raw.id,
      name: raw.name,
      code: raw.code,
      image: raw.image,
      leagueSlug,
      playerIds: [],
      budget: 0,
      cash: 0,
    };
    this.teams[team.id] = team;
    return team;
  }

  private freshPlayers(rt: RawTeam, teamId: string, prestige: number, teamBonus: number, region: string): Player[] {
    return rt.players
      .filter((p) => !this.players[p.id])
      .map((p) => this.makePlayer(p, p.role as Role, teamId, prestige, teamBonus, region));
  }

  private buildLeague(rl: RawLeague) {
    const academySlug = rl.academy?.slug ?? `${rl.slug}-academy`;
    const main: League = {
      slug: rl.slug,
      name: rl.name,
      region: rl.region,
      image: rl.image,
      prestige: rl.prestige,
      tier: 1,
      academySlug,
      teamIds: [],
    };
    const academy: League = {
      slug: academySlug,
      name: academyName(rl),
      region: rl.region,
      image: rl.academy?.image ?? rl.image,
      prestige: Math.max(0.5, rl.prestige - ACADEMY_PRESTIGE_DROP),
      tier: 2,
      parentSlug: rl.slug,
      teamIds: [],
    };
    this.leagues[main.slug] = main;
    this.leagues[academy.slug] = academy;

    // Times principais: o excedente do elenco desce para a academy.
    const leftovers = new Map<string, Player[]>();
    for (const rt of rl.teams) {
      if (this.teams[rt.id]) continue;
      const rng = createRng(`team-${rt.id}`);
      const team = this.newTeam(rt, main.slug);
      // Força do elenco pelo desempenho real em 2026 (ou um sorteio leve sem dados).
      const bonus = realTeamBonus(main.slug, rt.code) ?? gauss(rng) * 3;
      const candidates = this.freshPlayers(rt, team.id, main.prestige, bonus, rl.region);
      leftovers.set(team.id, this.assemble(team, candidates, rl.region, main.prestige, rng));
      main.teamIds.push(team.id);
    }

    const mainByCode = new Map(main.teamIds.map((id) => [this.teams[id].code, this.teams[id]]));
    // Sem elencos reais na API, cada time principal ganha uma academy gerada.
    const academyRaw: { raw: RawTeam; parent?: Team }[] = rl.academy?.teams.length
      ? rl.academy.teams.map((raw) => ({
          raw,
          parent: mainByCode.get(raw.code) ?? mainByCode.get(raw.code.replace(/A$/, '')),
        }))
      : main.teamIds.map((id) => {
          const parent = this.teams[id];
          const raw = {
            id: `${id}-academy`,
            name: `${parent.name} Academy`,
            code: `${parent.code}.A`,
            image: parent.image,
            players: [],
          };
          return { raw, parent };
        });

    for (const { raw, parent } of academyRaw) {
      // A mesma organização pode ter ID repetido entre as ligas (ex.: BFX na LCK e na LCK CL).
      const id = this.teams[raw.id] ? `${raw.id}-academy` : raw.id;
      const rng = createRng(`team-${id}`);
      const team = this.newTeam({ ...raw, id }, academy.slug);
      if (parent) team.parentTeamId = parent.id;
      const candidates = [
        ...this.freshPlayers(raw, team.id, academy.prestige, realTeamBonus(academy.slug, raw.code) ?? gauss(rng) * 3, rl.region),
        ...(parent ? (leftovers.get(parent.id) ?? []) : []),
      ];
      if (parent) leftovers.delete(parent.id);
      this.assemble(team, candidates, rl.region, academy.prestige, rng);
      academy.teamIds.push(team.id);
    }
  }
}

export function buildWorld(champions: Champion[]) {
  return new WorldBuilder(champions).build();
}

/** Titular de cada rota: o escolhido pelo coach (se ainda estiver no elenco) ou o de maior overall. */
export function starters(state: Pick<GameState, 'teams' | 'players'>, teamId: string): Player[] {
  const team = state.teams[teamId];
  const roster = team.playerIds.map((id) => state.players[id]);
  return ROLES.map((role) => {
    const chosen = team.lineup?.[role];
    if (chosen && team.playerIds.includes(chosen) && state.players[chosen]?.role === role) return state.players[chosen];
    return roster.filter((p) => p.role === role).sort((a, b) => overall(b) - overall(a))[0];
  }).filter(Boolean);
}

export function teamStrength(state: Pick<GameState, 'teams' | 'players'>, teamId: string): number {
  const s = starters(state, teamId);
  return Math.round(s.reduce((sum, p) => sum + overall(p), 0) / s.length);
}

export function freeAgents(state: GameState): Player[] {
  return Object.values(state.players).filter((p) => !p.teamId);
}

/** Objetivo da diretoria conforme a força do time dentro da liga. */
export function objectiveFor(rank: number, total: number): Objective {
  const pct = rank / total;
  if (pct <= 0.2) return { text: 'Ser campeão da liga', targetRank: 1.5 };
  if (pct <= 0.45) return { text: 'Chegar às semifinais', targetRank: 4 };
  if (pct <= 0.7) return { text: 'Classificar para os playoffs', targetRank: 6 };
  return { text: 'Evitar a lanterna', targetRank: total - 1 };
}

/** Posição do time no ranking de força da própria liga (1 = mais forte). */
export function strengthRank(state: GameState, teamId: string): { rank: number; total: number } {
  const league = state.leagues[state.teams[teamId].leagueSlug];
  const ranked = [...league.teamIds].sort((a, b) => teamStrength(state, b) - teamStrength(state, a));
  return { rank: ranked.indexOf(teamId) + 1, total: ranked.length };
}

export function coachSalary(prestige: number, reputation: number, rng: Rng): number {
  return Math.round((4 + prestige * 3 + reputation / 8) * (0.85 + rng() * 0.3));
}

export function makeProposal(state: GameState, teamId: string, rng: Rng): Proposal {
  const { rank, total } = strengthRank(state, teamId);
  const prestige = state.leagues[state.teams[teamId].leagueSlug].prestige;
  return {
    teamId,
    salary: coachSalary(prestige, state.coach.reputation, rng),
    years: randInt(rng, 1, 2),
    objective: objectiveFor(rank, total),
  };
}

/**
 * Propostas para um coach iniciante: de 2 a 4 times sorteados entre todos os da liga.
 * Os mais fracos têm mais chance (peso cresce com a posição no ranking de força), mas qualquer um pode chamar.
 */
export function generateProposals(state: GameState, leagueSlug: string, rng: Rng): Proposal[] {
  const league = state.leagues[leagueSlug];
  const ranked = [...league.teamIds].sort((a, b) => teamStrength(state, b) - teamStrength(state, a));
  const pool = ranked.map((teamId, i) => ({ teamId, weight: (i + 1) ** 1.3 }));
  const chosen: string[] = [];
  const count = Math.min(randInt(rng, 2, 4), pool.length);
  while (chosen.length < count) {
    let r = rng() * pool.reduce((sum, t) => sum + t.weight, 0);
    const idx = pool.findIndex((t) => (r -= t.weight) <= 0);
    chosen.push(pool.splice(idx < 0 ? pool.length - 1 : idx, 1)[0].teamId);
  }
  return chosen.map((teamId) => makeProposal(state, teamId, rng));
}

/** O coach escolhe a liga principal, mas começa a carreira na academy dela. */
export function createCareer(
  coachName: string,
  country: string,
  mainLeagueSlug: string,
  champions: Champion[],
  style: CoachStyle = 'tactical',
): GameState {
  const world = buildWorld(champions);
  const leagueSlug = world.leagues[mainLeagueSlug].academySlug!;
  const state: GameState = {
    version: SAVE_VERSION,
    coach: { name: coachName, country, reputation: 15, teamId: null, salary: 0, contractEnd: 0, objective: null, style },
    leagueSlug,
    season: START_SEASON,
    week: 0,
    ...world,
    proposals: [],
    phase: 'split1',
    competitions: [],
    series: {},
    games: {},
    titles: [],
    training: { focus: 'teamfight', intensity: 'normal' },
    lastReport: null,
    poolsFixed: true,
    proPoolsVersion: proDataVersion() ?? undefined,
    refused: [],
    review: null,
    career: [],
    news: [],
  };
  enterPhase(state, 'split1');
  const rng = createRng(Date.now());
  newPatch(state, champions, rng);
  state.staffMarket = generateStaffMarket(state, rng);
  state.proposals = generateProposals(state, leagueSlug, rng);
  return state;
}

export function acceptProposal(state: GameState, proposal: Proposal): GameState {
  // No mercado, o contrato vale a partir da próxima temporada.
  const start = state.phase === 'offseason' ? state.season + 1 : state.season;
  return {
    ...state,
    coach: {
      ...state.coach,
      teamId: proposal.teamId,
      salary: proposal.salary,
      contractEnd: start + proposal.years - 1,
      objective: proposal.objective,
    },
    leagueSlug: state.teams[proposal.teamId].leagueSlug,
    proposals: [],
    week: Math.max(state.week, 1),
  };
}

/**
 * Saves antigos geravam pools pela classe do campeão (ex.: Leona no top). Troca os campeões que não
 * jogam na rota do jogador por outros da rota certa. Só roda uma vez por save.
 */
export function repairChampionPools(state: GameState, champions: Champion[]): GameState {
  if (state.poolsFixed) return state;
  const byId = new Map(champions.map((c) => [c.id, c]));
  const players: Record<string, Player> = {};
  for (const p of Object.values(state.players)) {
    const fits = p.champions.filter((id) => {
      const c = byId.get(id);
      return c && championsForRole([c], p.role).length > 0;
    });
    if (fits.length === p.champions.length) {
      players[p.id] = p;
      continue;
    }
    const rng = createRng(`pool-${p.id}`);
    const options = shuffle(rng, championsForRole(champions, p.role).filter((c) => !fits.includes(c.id)));
    const wanted = Math.max(3, p.champions.length);
    players[p.id] = { ...p, champions: [...fits, ...options.slice(0, wanted - fits.length).map((c) => c.id)] };
  }
  return { ...state, players, poolsFixed: true };
}

/** Saves existentes: aplica os pools reais dos pros quando os dados de partidas oficiais chegam ou mudam. */
export function applyProPools(state: GameState, champions: Champion[]): GameState {
  const version = proDataVersion();
  if (!version || state.proPoolsVersion === version) return state;
  const valid = new Set(champions.map((c) => c.id));
  const players: Record<string, Player> = {};
  for (const p of Object.values(state.players)) {
    const real = proChampions(p.id).filter((id) => valid.has(id)).slice(0, POOL_SIZE);
    players[p.id] = real.length
      ? { ...p, champions: [...real, ...p.champions.filter((c) => !real.includes(c))].slice(0, POOL_SIZE) }
      : p;
  }
  return { ...state, players, proPoolsVersion: version };
}
