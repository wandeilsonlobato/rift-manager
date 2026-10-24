import { clamp, gauss, pick, randInt, type Rng } from './random';
import type { Game, GameState, MatchDetail, MatchEvent, Player, PlayerLine, Role, TrainingFocus } from './types';
import { coachStyle, tacticMetaBonus, TACTICS } from './coach';
import { collectiveOf } from './collective';
import { metaWeights, poolMetaBonus } from './meta';
import { staffLevel } from './staff';
import { laneBonus, laneEdges } from './soloq';
import { richTimeline } from './timeline';
import { starters } from './world';

interface Side {
  teamId: string;
  name: string;
  players: Player[];
  early: number;
  mid: number;
  late: number;
  power: number;
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const logistic = (x: number) => 1 / (1 + Math.exp(-x));

// Bônus nas fases do jogo pelo foco do treino da semana.
const FOCUS_BONUS: Record<TrainingFocus, { early: number; mid: number; late: number }> = {
  early: { early: 3, mid: 0, late: 0 },
  teamfight: { early: 0, mid: 2, late: 2.5 },
  objectives: { early: 1, mid: 2.5, late: 1 },
  mechanics: { early: 1, mid: 1, late: 1 },
  draft: { early: 1.5, mid: 1.5, late: 1.5 },
  rest: { early: 0, mid: 0, late: 0 },
  team_rotations: { early: 0, mid: 2, late: 1 },
  team_fights: { early: 0, mid: 1.5, late: 2 },
  team_vision: { early: 0.5, mid: 1.5, late: 1 },
  team_comms: { early: 1, mid: 1, late: 1 },
  team_prep: { early: 1.5, mid: 1, late: 1 },
};

/**
 * Força do time em cada fase do jogo. Além dos atributos entram moral, forma dos jogadores,
 * química do elenco, foco do treino e o meta do patch (ou o bônus do draft, quando houve draft).
 */
function buildSide(
  state: GameState,
  teamId: string,
  focus: TrainingFocus,
  rng: Rng,
  draftBonus?: number,
  lanes = { early: 0, mid: 0 },
): Side {
  const players = starters(state, teamId);
  const bonus = FOCUS_BONUS[focus];
  const morale = (avg(players.map((p) => p.morale)) - 60) / 10;
  const playerForm = avg(players.map((p) => p.form ?? 0)) * 0.6;
  const chemistry = ((state.teams[teamId].chemistry ?? 60) - 60) / 12;
  const mine = teamId === state.coach.teamId;
  const analyst = mine ? staffLevel(state, 'analyst') * 0.3 : 0;
  const tactic = mine ? tacticBonus(state, players) : { early: 0, mid: 0, late: 0 };
  // Coletivo: rotações e visão pesam no mid, coordenação nas lutas, preparação no draft.
  const c = collectiveOf(state, teamId);
  const prep = (c.prep - 60) / (draftBonus === undefined ? 40 : 30);
  const meta = (draftBonus ?? poolMetaBonus(state, players) + analyst) + prep;
  // Variação de "dia": nem todo jogo sai como no papel. Boa comunicação segura os dias ruins.
  const day = gauss(rng) * 3 * clamp(1 - (c.comms - 50) / 150, 0.6, 1.2);
  const shared = morale * clamp(1 - (c.comms - 50) / 200, 0.7, 1.1) + playerForm + chemistry + meta + day;
  const team = {
    early: (c.vision - 60) / 40,
    mid: (c.rotations - 60) / 20 + (c.teamfight - 60) / 25 + (c.vision - 60) / 30,
    late: (c.teamfight - 60) / 20 + (c.vision - 60) / 25,
  };
  const early = avg(players.map((p) => p.attrs.laning * 0.5 + p.attrs.mechanics * 0.3 + p.attrs.macro * 0.2)) + bonus.early + tactic.early + lanes.early + team.early + shared;
  const mid = avg(players.map((p) => p.attrs.teamfight * 0.4 + p.attrs.macro * 0.4 + p.attrs.mechanics * 0.2)) + bonus.mid + tactic.mid + lanes.mid + team.mid + shared;
  const late = avg(players.map((p) => p.attrs.teamfight * 0.4 + p.attrs.mental * 0.3 + p.attrs.macro * 0.3)) + bonus.late + tactic.late + team.late + shared;
  const [we, wm, wl] = metaWeights(state);
  return {
    teamId,
    name: state.teams[teamId].code,
    players,
    early,
    mid,
    late,
    power: early * we + mid * wm + late * wl,
  };
}

/** Bônus da tática escolhida pelo coach em cada fase do jogo. */
function tacticBonus(state: GameState, players: Player[]) {
  const tactic = state.tactic ?? 'balanced';
  const t = TACTICS[tactic];
  const scale = coachStyle(state) === 'tactical' ? 1.25 : 1;
  const meta = tacticMetaBonus(state, tactic);
  // Controle de visão depende do macro do jungle e do suporte.
  const vision = tactic === 'vision'
    ? clamp((avg(players.filter((p) => p.role === 'jungle' || p.role === 'support').map((p) => p.attrs.macro)) - 50) / 20, 0.4, 1.5)
    : 1;
  return {
    early: t.early * scale + meta,
    mid: t.mid * scale * vision + meta,
    late: t.late * scale + meta,
  };
}

// Peso de cada rota para fazer abates.
const KILL_WEIGHT = [1, 1.1, 1.4, 1.6, 0.4];

function weighted<T>(rng: Rng, items: T[], weights: number[]): T {
  let r = rng() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function pickChampions(players: Player[], taken: Set<string>, rng: Rng): string[] {
  return players.map((p) => {
    const options = p.champions.filter((c) => !taken.has(c));
    const champ = options.length ? pick(rng, options) : p.champions[0];
    taken.add(champ);
    return champ;
  });
}

const fmt = (min: number) => {
  const m = Math.floor(min);
  const s = Math.floor((min - m) * 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export interface GameOptions {
  /** campeões já usados na série (Fearless Draft) */
  excluded?: Iterable<string>;
  /** resultado de um draft: escolhas por jogador (azul, vermelho) e bônus de cada lado */
  draft?: { picks: [Record<string, string>, Record<string, string>]; bonus: [number, number] };
  /** gera a partida lance a lance (jogos do time do coach) */
  rich?: boolean;
}

/** Simula um jogo. Com `detailed`, gera linha do tempo e KDA. */
export function simulateGame(
  state: GameState,
  match: Omit<Game, 'winner' | 'kills'>,
  focus: Record<string, TrainingFocus>,
  detailed: boolean,
  rng: Rng,
  options: GameOptions = {},
): Game {
  // Campeões de cada lado (jogos com detalhes): do draft ou do pool de cada jogador.
  const players = [starters(state, match.blue), starters(state, match.red)];
  let champs: [string[], string[]] | null = null;
  if (options.draft) {
    const d = options.draft;
    champs = [players[0].map((p) => d.picks[0][p.id]), players[1].map((p) => d.picks[1][p.id])];
  } else if (detailed) {
    const taken = new Set<string>(options.excluded);
    champs = [pickChampions(players[0], taken, rng), pickChampions(players[1], taken, rng)];
  }
  // Confrontos de rota pelos dados reais de SoloQ: quem leva as rotas sai na frente no early.
  const byRole = (side: 0 | 1) =>
    Object.fromEntries(players[side].map((p, i) => [p.role, champs![side][i]])) as Partial<Record<Role, string>>;
  const lanes = champs ? laneEdges(byRole(0), byRole(1)) : [];
  const lb = laneBonus(lanes);
  const blue = buildSide(state, match.blue, focus[match.blue] ?? 'mechanics', rng, options.draft?.bonus[0], lb);
  const red = buildSide(state, match.red, focus[match.red] ?? 'mechanics', rng, options.draft?.bonus[1], { early: -lb.early, mid: -lb.mid });
  // Leve vantagem do lado azul, como no jogo real.
  const blueWinP = logistic((blue.power - red.power + 0.4) / 3.5);
  const blueWins = rng() < blueWinP;
  const [w, l] = blueWins ? [blue, red] : [red, blue];
  const sideOf = (s: Side) => (s === blue ? 'blue' : 'red') as 'blue' | 'red';

  const totalKills = randInt(rng, 10, 36);
  const winShare = 0.55 + rng() * 0.22;
  const wKills = Math.round(totalKills * winShare);
  const lKills = totalKills - wKills;
  const game: Game = {
    ...match,
    winner: w.teamId,
    kills: blueWins ? [wKills, lKills] : [lKills, wKills],
  };
  if (!detailed) return game;

  const closeness = 1 - Math.abs(blueWinP - 0.5) * 2;
  const duration = clamp(24 + closeness * 10 + gauss(rng) * 3, 21, 45);
  const events: MatchEvent[] = [];
  const add = (time: number, s: Side, text: string) =>
    events.push({ time, side: sideOf(s), text: `${fmt(time)} — ${text}` });

  // KDA: abates distribuídos por rota, assistências para os companheiros.
  const lines = new Map<Side, PlayerLine[]>();
  for (const s of [blue, red]) {
    const list = champs![s === blue ? 0 : 1];
    lines.set(s, s.players.map((p, i) => ({ playerId: p.id, champion: list[i], kills: 0, deaths: 0, assists: 0 })));
  }
  // MVP: abates pesam mais que assistências; morrer custa caro.
  const kdaScore = (p: PlayerLine) => p.kills * 3 + p.assists * 1.5 - p.deaths * 2;

  if (options.rich) {
    const view = (s: Side) => ({ teamId: s.teamId, name: s.name, early: s.early, mid: s.mid, late: s.late, lines: lines.get(s)! });
    const { detail, kills } = richTimeline(state, [view(blue), view(red)], blueWins, duration, rng, lanes);
    detail.lanes = lanes;
    const mvp = [...lines.get(w)!].sort((a, b) => kdaScore(b) - kdaScore(a))[0];
    game.kills = kills;
    game.detail = { ...detail, mvp: mvp.playerId };
    return game;
  }

  const killLog: { side: Side; killer: PlayerLine; victim: PlayerLine }[] = [];
  for (const [s, o, n] of [
    [w, l, wKills],
    [l, w, lKills],
  ] as const) {
    const mine = lines.get(s)!;
    const theirs = lines.get(o)!;
    for (let k = 0; k < n; k++) {
      const killer = weighted(rng, mine, KILL_WEIGHT);
      const victim = pick(rng, theirs);
      killer.kills++;
      victim.deaths++;
      for (const mate of mine) {
        if (mate !== killer && rng() < (mate === mine[4] ? 0.75 : 0.45)) mate.assists++;
      }
      killLog.push({ side: s, killer, victim });
    }
  }
  const nick = (line: PlayerLine) => state.players[line.playerId].nick;

  // First blood: vai para quem domina o early.
  const fbBlue = rng() < logistic((blue.early - red.early) / 4);
  const fb = killLog.find((k) => k.side === (fbBlue ? blue : red)) ?? killLog[0];
  if (fb) add(2 + rng() * 4, fb.side, `First Blood! ${nick(fb.killer)} (${fb.side.name}) abate ${nick(fb.victim)}`);

  // Dragões: os primeiros seguem o early, os seguintes tendem ao vencedor.
  const dragons: [number, number] = [0, 0];
  const dragonNames = ['Infernal', 'Oceano', 'Montanha', 'Nuvem', 'Hextec', 'Quimtec'];
  for (let t = 5 + rng() * 2; t < duration - 2 && dragons[0] < 4 && dragons[1] < 4; t += 5 + rng() * 2) {
    const early = t < 14;
    const pBlue = early ? logistic((blue.early - red.early) / 4) : blueWins ? 0.68 : 0.32;
    const s = rng() < pBlue ? blue : red;
    const idx = s === blue ? 0 : 1;
    dragons[idx]++;
    const soul = dragons[idx] === 4;
    add(t, s, soul ? `${s.name} conquista a Alma do Dragão!` : `${s.name} garante o Dragão ${pick(rng, dragonNames)}`);
  }

  const midLead = rng() < logistic((blue.mid - red.mid) / 4) ? blue : red;
  add(14 + rng() * 2, midLead, `${midLead.name} pega o Arauto do Vale`);

  // Barão: decisivo, quase sempre do vencedor.
  const barons: [number, number] = [0, 0];
  const baronCount = duration > 27 ? randInt(rng, 1, 2) : rng() < 0.4 ? 1 : 0;
  for (let b = 0; b < baronCount; b++) {
    const s = rng() < 0.82 ? w : l;
    barons[s === blue ? 0 : 1]++;
    add(Math.min(duration - 2, 21 + b * 7 + rng() * 4), s, `${s.name} finaliza o Barão Na'Shor`);
  }

  const ace = killLog.filter((k) => k.side === w).at(-1);
  if (ace) add(duration - 1.5, w, `${nick(ace.killer)} decide a luta final para o ${w.name}`);
  add(duration, w, `${w.name} destrói o Nexus!`);
  events.sort((a, b) => a.time - b.time);

  const wTowers = randInt(rng, 7, 11);
  const lTowers = randInt(rng, 0, 6);
  const wGold = Math.round(duration * 1900 + randInt(rng, -3000, 3000));
  const lGold = Math.round(wGold * (0.78 + rng() * 0.17));
  const pair = <T,>(wv: T, lv: T): [T, T] => (blueWins ? [wv, lv] : [lv, wv]);

  const mvp = [...lines.get(w)!].sort((a, b) => kdaScore(b) - kdaScore(a))[0];

  const detail: MatchDetail = {
    duration: Math.round(duration * 10) / 10,
    gold: pair(wGold, lGold),
    towers: pair(wTowers, lTowers),
    dragons,
    barons,
    blueLines: lines.get(blue)!,
    redLines: lines.get(red)!,
    events,
    mvp: mvp.playerId,
  };
  game.detail = detail;
  return game;
}
