export type Role = 'top' | 'jungle' | 'mid' | 'bottom' | 'support';

export const ROLES: Role[] = ['top', 'jungle', 'mid', 'bottom', 'support'];

export const ROLE_LABEL: Record<Role, string> = {
  top: 'Top',
  jungle: 'Jungle',
  mid: 'Mid',
  bottom: 'ADC',
  support: 'Suporte',
};

export interface Attributes {
  mechanics: number;
  laning: number;
  teamfight: number;
  macro: number;
  mental: number;
}

export const ATTR_LABEL: Record<keyof Attributes, string> = {
  mechanics: 'Mecânica',
  laning: 'Laning',
  teamfight: 'Teamfight',
  macro: 'Macro',
  mental: 'Mental',
};

export interface Player {
  id: string;
  nick: string;
  firstName: string;
  lastName: string;
  image: string;
  role: Role;
  age: number;
  attrs: Attributes;
  potential: number;
  /** 0-100 */
  morale: number;
  /** em milhares por mês */
  salary: number;
  /** temporada em que o contrato termina */
  contractEnd: number;
  /** IDs de campeões do Data Dragon */
  champions: string[];
  teamId: string | null;
  /** região de origem (para o mercado) */
  region: string | null;
  /** fase do momento, de -5 a +5 */
  form?: number;
  /** semanas restantes de doença/indisposição */
  sick?: number;
  /** OVR e time ao fim de cada temporada */
  history?: { season: number; ovr: number; team: string }[];
  /** títulos conquistados como titular */
  titles?: { season: number; comp: string }[];
}

/** Estatísticas de uma temporada (partidas com detalhes: ligas da região do coach e internacionais). */
export interface SeasonStats {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  mvps: number;
  champions: Record<string, number>;
}

export interface Team {
  id: string;
  name: string;
  code: string;
  image: string;
  leagueSlug: string;
  playerIds: string[];
  /** teto da folha salarial, em milhares por mês */
  budget: number;
  /** caixa para multas e transferências, em milhares */
  cash: number;
  /** time principal, quando este é uma academy */
  parentTeamId?: string;
  /** entrosamento do elenco, 0-100 */
  chemistry?: number;
  /** titulares escolhidos pelo coach por rota (sem isso, joga o maior OVR) */
  lineup?: Partial<Record<Role, string>>;
  collective?: Collective;
}

export interface League {
  slug: string;
  name: string;
  region: string;
  image: string;
  prestige: number;
  /** 1 = liga principal, 2 = academy */
  tier: 1 | 2;
  parentSlug?: string;
  academySlug?: string;
  teamIds: string[];
}

export interface Coach {
  name: string;
  country: string;
  /** 0-100 */
  reputation: number;
  teamId: string | null;
  salary: number;
  contractEnd: number;
  objective: Objective | null;
  style?: CoachStyle;
}

export type CoachStyle = 'tactical' | 'motivator' | 'developer';

export type Tactic = 'balanced' | 'early' | 'scaling' | 'vision' | 'objectives';

export interface Objective {
  text: string;
  /** colocação média esperada nos splits */
  targetRank: number;
}

export interface Proposal {
  teamId: string;
  salary: number;
  years: number;
  objective: Objective;
  /** renovação com o time atual */
  renewal?: boolean;
}

export interface SplitResult {
  compName: string;
  rank: number;
}

export interface SeasonReview {
  season: number;
  teamId: string;
  results: SplitResult[];
  titles: string[];
  reputationDelta: number;
  fired: boolean;
  verdict: string;
}

export interface CareerEntry {
  season: number;
  teamId: string;
  teamName: string;
  results: SplitResult[];
  titles: string[];
}

export type TrainingFocus =
  | 'early'
  | 'teamfight'
  | 'objectives'
  | 'mechanics'
  | 'draft'
  | 'rest'
  | 'team_rotations'
  | 'team_fights'
  | 'team_vision'
  | 'team_comms'
  | 'team_prep';

/** Atributos coletivos do time (0-100): como os cinco jogam juntos. */
export interface Collective {
  rotations: number;
  teamfight: number;
  vision: number;
  comms: number;
  prep: number;
}

export const COLLECTIVE_LABEL: Record<keyof Collective, string> = {
  rotations: 'Rotações',
  teamfight: 'Coordenação de teamfight',
  vision: 'Controle de visão',
  comms: 'Comunicação',
  prep: 'Preparação de draft',
};
export type Intensity = 'light' | 'normal' | 'intense';

export interface Training {
  focus: TrainingFocus;
  intensity: Intensity;
}

export interface PlayerLine {
  playerId: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
}

export type MatchEventType =
  | 'invade'
  | 'crab'
  | 'kill'
  | 'grubs'
  | 'dragon'
  | 'herald'
  | 'tower'
  | 'pick'
  | 'teamfight'
  | 'baron'
  | 'elder'
  | 'nexus';

/** Placar acumulado logo após um lance (para a partida ao vivo). */
export interface MatchSnapshot {
  kills: [number, number];
  gold: [number, number];
  towers: [number, number];
  dragons: [number, number];
  barons: [number, number];
}

export interface MatchEvent {
  /** minuto do jogo */
  time: number;
  side: 'blue' | 'red';
  text: string;
  type?: MatchEventType;
  /** abates do lance: [matador, vítima, assistências] (ids de jogadores) */
  kills?: [string, string, string[]][];
  snapshot?: MatchSnapshot;
  /** tipo do dragão (infernal, ocean, mountain, cloud, hextech, chemtech, elder) */
  dragon?: string;
}

/** Detalhes guardados só para as ligas do coach (para não estourar o save). */
export interface MatchDetail {
  duration: number;
  gold: [number, number];
  towers: [number, number];
  dragons: [number, number];
  barons: [number, number];
  blueLines: PlayerLine[];
  redLines: PlayerLine[];
  events: MatchEvent[];
  mvp: string;
  /** linha do tempo lance a lance (jogos do time do coach) */
  rich?: boolean;
  /** confrontos de rota pelos dados de SoloQ (chance do lado azul em cada rota) */
  lanes?: { lane: string; blue: string[]; red: string[]; winrate: number; games: number }[];
}

export interface Game {
  id: string;
  seriesId: string;
  blue: string;
  red: string;
  winner: string;
  kills: [number, number];
  detail?: MatchDetail;
}

export interface Series {
  id: string;
  compId: string;
  stage: number;
  round: number;
  label: string;
  /** time A é o de melhor seed */
  a: string;
  b: string;
  bestOf: number;
  wins: [number, number];
  kills: [number, number];
  gameIds: string[];
  /** campeões já usados na série (Fearless Draft) */
  fearless?: string[];
  winner?: string;
  week?: number;
}

export type PhaseId = 'split1' | 'firstStand' | 'split2' | 'msi' | 'ewc' | 'split3' | 'worlds' | 'offseason';

/** rr1/rr2 = pontos corridos turno único/turno e returno */
/** double = eliminação dupla (chave superior, chave inferior e grande final) */
export type StageKind = 'rr1' | 'rr2' | 'playoffs' | 'knockout' | 'playin' | 'swiss' | 'double';

export interface Stage {
  kind: StageKind;
  name: string;
  /** times classificados direto para esta fase, em ordem de seed */
  teamIds: string[];
  /** quantos times entram vindos da fase anterior */
  fromPrevious: number;
  bestOf: number;
  rounds: string[][];
  played: number;
  /** classificação final da fase */
  result?: string[];
}

export interface Competition {
  id: string;
  name: string;
  phase: PhaseId;
  kind: 'league' | 'international';
  leagueSlug?: string;
  image: string;
  stages: Stage[];
  stageIndex: number;
  done: boolean;
  championId?: string;
  ranking?: string[];
  /** premiação já distribuída */
  paid?: boolean;
}

export type MetaStyle = 'early' | 'balanced' | 'late';

export interface Patch {
  name: string;
  phase: PhaseId;
  style: MetaStyle;
  buffed: string[];
  nerfed: string[];
}

export type StaffRole = 'analyst' | 'assistant' | 'psychologist';

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  /** 1-5 */
  level: number;
  /** em milhares por mês */
  salary: number;
}

export interface FinanceEntry {
  season: number;
  week: number;
  label: string;
  amount: number;
}

export interface EventOption {
  label: string;
  hint: string;
}

export interface GameEvent {
  type: string;
  title: string;
  text: string;
  playerIds: string[];
  amount: number;
  options: EventOption[];
}

export interface Title {
  season: number;
  compName: string;
  championId: string;
}

export interface GrowthEntry {
  /** vazio quando o ganho é do time (atributo coletivo) */
  playerId: string;
  attr: keyof Attributes | 'champion' | 'collective';
  /** campeão aprendido (attr = 'champion') ou pontos ganhos no atributo */
  value?: string;
}

export interface WeekReport {
  week: number;
  seriesIds: string[];
  /** foco treinado na semana (null = não treinou) */
  focus: TrainingFocus | null;
  growth: GrowthEntry[];
}

export const SAVE_VERSION = 5;

export interface GameState {
  version: typeof SAVE_VERSION;
  coach: Coach;
  leagueSlug: string;
  season: number;
  week: number;
  leagues: Record<string, League>;
  teams: Record<string, Team>;
  players: Record<string, Player>;
  proposals: Proposal[];
  phase: PhaseId;
  competitions: Competition[];
  series: Record<string, Series>;
  games: Record<string, Game>;
  titles: Title[];
  training: Training;
  lastReport: WeekReport | null;
  /** jogadores que recusaram proposta nesta janela */
  refused: string[];
  review: SeasonReview | null;
  career: CareerEntry[];
  /** semana em que o coach já treinou (o treino libera de novo após os jogos) */
  trainedWeek?: number;
  trainingResult?: { week: number; focus: TrainingFocus; intensity: Intensity; growth: GrowthEntry[] };
  /** draft manual nos jogos do coach */
  manualDraft?: boolean;
  tactic?: Tactic;
  /** torneios internacionais simulados porque o time do coach não se classificou */
  skipped?: { phase: PhaseId; compName: string; championId: string }[];
  /** tutorial da primeira carreira já visto */
  tutorialDone?: boolean;
  /** evolução do elenco na virada de temporada (OVR antes e depois) */
  evolution?: { playerId: string; from: number; to: number }[];
  /** títulos do coach já comemorados (cerimônia mostrada) */
  celebrated?: string[];
  /** versão dos dados de partidas oficiais já aplicada aos pools */
  proPoolsVersion?: string;
  /** pools de campeões já corrigidos para as rotas reais */
  poolsFixed?: boolean;
  /** estatísticas por jogador e temporada */
  playerStats?: Record<string, Record<number, SeasonStats>>;
  meta?: Patch;
  staff?: Staff[];
  staffMarket?: Staff[];
  finances?: FinanceEntry[];
  pendingEvent?: GameEvent | null;
  eventLog?: string[];
  /** notícias do mercado e da virada de temporada */
  news: string[];
}
