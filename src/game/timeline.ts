// Partida lance a lance: gera a linha do tempo completa dos jogos do time do coach,
// com placar acumulado em cada momento para a transmissão ao vivo.
import { clamp, pick, randInt, type Rng } from './random';
import type { GameState, MatchDetail, MatchEvent, MatchEventType, MatchSnapshot, PlayerLine } from './types';

export interface TeamView {
  teamId: string;
  name: string;
  early: number;
  mid: number;
  late: number;
  /** titulares na ordem top, jungle, mid, adc, suporte */
  lines: PlayerLine[];
}

const TOP = 0;
const JUNGLE = 1;
const MID = 2;
const ADC = 3;
const SUPPORT = 4;

const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const DRAGONS: Record<string, string> = {
  infernal: 'Infernal',
  ocean: 'do Oceano',
  mountain: 'da Montanha',
  cloud: 'das Nuvens',
  hextech: 'Hextec',
  chemtech: 'Quimtec',
};
const AREAS = ['no rio do topo', 'no rio de baixo', 'na selva azul', 'na selva vermelha', 'no meio'];

const fmt = (min: number) => {
  const m = Math.floor(min);
  const s = Math.floor((min - m) * 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export function richTimeline(
  state: GameState,
  teams: [TeamView, TeamView],
  blueWins: boolean,
  duration: number,
  rng: Rng,
): { detail: Omit<MatchDetail, 'mvp'>; kills: [number, number] } {
  const events: MatchEvent[] = [];
  // Totais finais e o que mudou desde o último lance (o placar de cada lance é refeito no fim, em ordem).
  const snap: MatchSnapshot = { kills: [0, 0], gold: [0, 0], towers: [0, 0], dragons: [0, 0], barons: [0, 0] };
  const bonus = [0, 0];
  const emptyDelta = (): Delta => ({ kills: [0, 0], towers: [0, 0], dragons: [0, 0], barons: [0, 0], gold: [0, 0] });
  let delta = emptyDelta();
  const deltas = new Map<MatchEvent, Delta>();
  const winner = blueWins ? 0 : 1;
  const sideName = (i: number) => teams[i].name;
  const who = (l: PlayerLine) => `${state.players[l.playerId].nick} (${l.champion})`;
  const nick = (l: PlayerLine) => state.players[l.playerId].nick;
  const nickOf = (id: string) => state.players[id].nick;
  /** " com assistência de X e Y" para dar crédito a quem ajudou no abate. */
  const helped = (k: [string, string, string[]]) =>
    k[2].length ? ` com assistência de ${k[2].slice(0, 2).map(nickOf).join(' e ')}` : '';
  /** Quem começa a luta: geralmente o suporte ou o top/jungle tanque. */
  const engager = (side: number) => who(teams[side].lines[pick(rng, [SUPPORT, SUPPORT, JUNGLE, TOP])]);
  /** Destaque da luta: double/triple/quadra/penta de quem matou mais. */
  const multikill = (ks: [string, string, string[]][]) => {
    const count = new Map<string, number>();
    for (const [killer] of ks) count.set(killer, (count.get(killer) ?? 0) + 1);
    const [best, n] = [...count].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const label = ['', '', 'double kill', 'triple kill', 'QUADRA KILL', 'PENTAKILL'][Math.min(n, 5)];
    return label ? ` ${nickOf(best)} faz ${label}!` : '';
  };

  /** Chance do azul vencer um lance: começa pela fase do jogo e puxa para o vencedor com o tempo. */
  const pBlue = (t: number) => {
    const phase = t < 14 ? teams[0].early - teams[1].early : t < 25 ? teams[0].mid - teams[1].mid : teams[0].late - teams[1].late;
    const phaseP = logistic(phase / 4);
    const momentum = clamp(t / duration, 0, 1) ** 1.5;
    return phaseP * (1 - momentum) + (blueWins ? 0.85 : 0.15) * momentum;
  };
  const sideAt = (t: number) => (rng() < pBlue(t) ? 0 : 1);

  const kill = (side: number, killerIdx?: number, victimIdx?: number, helpers = 0.45): [string, string, string[]] => {
    const mine = teams[side].lines;
    const theirs = teams[1 - side].lines;
    const killer = killerIdx !== undefined ? mine[killerIdx] : mine[weightedIndex(rng, [1, 1.1, 1.4, 1.6, 0.4])];
    const victim = victimIdx !== undefined ? theirs[victimIdx] : pick(rng, theirs);
    const assists = mine.filter((m) => m !== killer && rng() < (m === mine[SUPPORT] ? helpers + 0.25 : helpers));
    killer.kills++;
    victim.deaths++;
    for (const a of assists) a.assists++;
    snap.kills[side]++;
    delta.kills[side]++;
    addGold(side, 300 + assists.length * 60);
    return [killer.playerId, victim.playerId, assists.map((a) => a.playerId)];
  };

  function addGold(side: number, amount: number) {
    bonus[side] += amount;
    delta.gold[side] += amount;
  }
  const count = (key: 'towers' | 'dragons' | 'barons', side: number) => {
    snap[key][side]++;
    delta[key][side]++;
  };

  const push = (
    time: number,
    side: number,
    type: MatchEventType,
    text: string,
    kills?: [string, string, string[]][],
    dragon?: string,
  ) => {
    const event: MatchEvent = { time, side: side === 0 ? 'blue' : 'red', type, text: `${fmt(time)} — ${text}`, kills, dragon };
    events.push(event);
    deltas.set(event, delta);
    delta = emptyDelta();
  };

  const tower = (t: number, side: number, label: string) => {
    count('towers', side);
    addGold(side, 550);
    push(t, side, 'tower', `${sideName(side)} derruba ${label}`);
  };

  // --- Início: invasão nível 1 e disputa do caranguejo
  if (rng() < 0.35) {
    const s = sideAt(0);
    if (rng() < 0.35) {
      const k = kill(s, undefined, undefined, 0.7);
      push(1.4, s, 'invade', `Invasão nível 1 do ${sideName(s)}! ${who(teams[s].lines.find((l) => l.playerId === k[0])!)} pega o abate de entrada`, [k]);
    } else {
      push(1.4, s, 'invade', `${sideName(s)} invade a selva inimiga e rouba o buff de ${nick(teams[1 - s].lines[JUNGLE])}`);
      addGold(s, 150);
    }
  }
  {
    const s = sideAt(3);
    const jg = teams[s].lines[JUNGLE];
    if (rng() < 0.3) {
      const k = kill(s, rng() < 0.6 ? JUNGLE : MID, JUNGLE);
      push(3.3, s, 'crab', `Briga pelo caranguejo: ${who(jg)} vence o duelo contra ${who(teams[1 - s].lines[JUNGLE])} e ainda pega o abate`, [k]);
    } else {
      push(3.3, s, 'crab', `${who(jg)} garante o Caranguejo do Rio com ajuda do mid`);
      addGold(s, 100);
    }
  }

  // --- Fase de rotas: ganks e solo kills
  const laneEvents = randInt(rng, 2, 4);
  const laneTimes = Array.from({ length: laneEvents }, () => 4 + rng() * 8).sort((a, b) => a - b);
  // Lances agendados (dragões, vastilarvas, arauto) são intercalados pelo tempo.
  const scheduled: { time: number; run: () => void }[] = laneTimes.map((t) => ({
    time: t,
    run: () => {
      const s = sideAt(t);
      const lane = pick(rng, [TOP, MID, ADC]);
      const first = snap.kills[0] + snap.kills[1] === 0 ? 'First Blood! ' : '';
      if (rng() < 0.55) {
        const k = kill(s, JUNGLE, lane);
        push(t, s, 'kill', `${first}Gank de ${who(teams[s].lines[JUNGLE])} na rota de ${laneName(lane)}: ${nick(teams[1 - s].lines[lane])} cai${helped(k)}`, [k]);
      } else {
        const k = kill(s, lane, lane, 0.15);
        push(t, s, 'kill', `${first}Solo kill! ${who(teams[s].lines[lane])} vence a troca contra ${who(teams[1 - s].lines[lane])}`, [k]);
      }
    },
  }));

  scheduled.push({
    time: 6,
    run: () => {
      const s = sideAt(6);
      push(6, s, 'grubs', `${sideName(s)} garante as Vastilarvas no topo`);
      addGold(s, 200);
    },
  });

  const heraldTime = 14 + rng();
  scheduled.push({
    time: heraldTime,
    run: () => {
      const t = heraldTime;
      const s = sideAt(t);
      if (rng() < 0.45) {
        const ks = [kill(s), ...(rng() < 0.5 ? [kill(s)] : [])];
        const back = rng() < 0.3 ? [kill(1 - s)] : [];
        push(t, s, 'herald', `Luta no Arauto do Vale! ${sideName(s)} vence ${ks.length}x${back.length} e leva o objetivo`, [...ks, ...back]);
      } else {
        push(t, s, 'herald', `${sideName(s)} pega o Arauto do Vale sem contestação`);
      }
      tower(t + 1.2, s, 'a primeira torre com o Arauto (First Tower!)');
    },
  });

  // Dragões a cada ~5 minutos até alguém fechar a Alma.
  let soulSide = -1;
  for (let t = 5.5 + rng(); t < duration - 2; t += 5 + rng()) {
    const time = t;
    scheduled.push({
      time,
      run: () => {
        if (soulSide >= 0) {
          if (time > 30) {
            const s = rng() < 0.75 ? winner : 1 - winner;
            const ks = Array.from({ length: randInt(rng, 2, 4) }, () => kill(s));
            push(time, s, 'elder', `${sideName(s)} toma o Dragão Ancião depois de vencer a luta ${ks.length}x0!`, ks, 'elder');
          }
          return;
        }
        const s = sideAt(time);
        const fight = rng() < 0.45;
        const ks = fight ? Array.from({ length: randInt(rng, 1, 3) }, () => kill(s)) : [];
        const back = fight && rng() < 0.4 ? [kill(1 - s)] : [];
        count('dragons', s);
        addGold(s, 200);
        const soul = snap.dragons[s] === 4;
        if (soul) soulSide = s;
        const kind = pick(rng, Object.keys(DRAGONS));
        const name = soul ? 'a ALMA DO DRAGÃO' : `o Dragão ${DRAGONS[kind]}`;
        push(
          time,
          s,
          'dragon',
          fight ? `Luta pelo dragão! ${sideName(s)} vence ${ks.length}x${back.length} e garante ${name}` : `${sideName(s)} garante ${name}`,
          [...ks, ...back],
          kind,
        );
      },
    });
  }

  // Meio de jogo: pickoffs, teamfights e cercos até o fim.
  let baronTaken = 0;
  for (let t = 16 + rng() * 2; t < duration - 2.5; t += 2 + rng() * 2) {
    const time = t;
    scheduled.push({
      time,
      run: () => {
        const s = sideAt(time);
        const roll = rng();
        if (time > 21 && baronTaken < 2 && roll < 0.22) {
          baronTaken++;
          const fight = rng() < 0.6;
          const ks = fight ? Array.from({ length: randInt(rng, 1, 4) }, () => kill(s)) : [];
          const back = fight && rng() < 0.35 ? [kill(1 - s)] : [];
          count('barons', s);
          addGold(s, 1500);
          push(time, s, 'baron', fight ? `Luta no Barão! ${sideName(s)} vence ${ks.length}x${back.length} e finaliza o Barão Na'Shor` : `${sideName(s)} faz o Barão Na'Shor escondido!`, [...ks, ...back]);
          tower(time + 1, s, 'uma torre com o buff do Barão');
        } else if (roll < 0.5) {
          const victimIdx = pick(rng, [MID, ADC, SUPPORT, TOP]);
          const k = kill(s, undefined, victimIdx, 0.5);
          push(time, s, 'pick', `Pickoff! ${nick(teams[1 - s].lines[victimIdx])} é pego sem visão ${pick(rng, AREAS)} por ${nickOf(k[0])}${helped(k)}`, [k]);
          if (rng() < 0.5) tower(time + 0.6, s, 'mais uma torre aproveitando a vantagem numérica');
        } else if (roll < 0.8) {
          const ks = Array.from({ length: randInt(rng, 2, 5) }, () => kill(s));
          const back = Array.from({ length: randInt(rng, 0, 2) }, () => kill(1 - s));
          push(time, s, 'teamfight', `Teamfight ${pick(rng, AREAS)}! ${engager(s)} inicia e o ${sideName(s)} vence ${ks.length}x${back.length}.${multikill(ks)}`, [...ks, ...back]);
          if (rng() < 0.6) tower(time + 0.8, s, 'uma torre após a luta');
        } else {
          tower(time, s, rng() < 0.5 ? 'uma torre com split push' : 'uma torre de segundo nível');
        }
      },
    });
  }

  for (const step of scheduled.sort((a, b) => a.time - b.time)) step.run();

  // Fim: o vencedor precisa abrir caminho até a base (torres externas, internas e do inibidor).
  const end = duration;
  const missing = randInt(rng, 6, 9) - snap.towers[winner];
  const from = Math.max(end - 7, 15);
  for (let i = 0; i < missing; i++) {
    const t = from + ((end - 2.2 - from) * (i + 1)) / (missing + 1);
    tower(t, winner, i >= missing - 2 ? 'uma torre da base' : 'mais uma torre');
  }
  // Luta decisiva, inibidor e Nexus sempre para o vencedor.
  const finals = Array.from({ length: randInt(rng, 3, 5) }, () => kill(winner));
  push(end - 1.6, winner, 'teamfight', `Luta decisiva! ${engager(winner)} encontra o engage e o ${sideName(winner)} vence ${finals.length}x0.${multikill(finals)}`, finals);
  tower(end - 1, winner, 'o inibidor');
  push(end, winner, 'nexus', `${sideName(winner)} destrói o Nexus! Fim de jogo.`);
  events.sort((a, b) => a.time - b.time);

  // Placar acumulado em ordem cronológica; o ouro também conta a renda passiva.
  const run: MatchSnapshot = { kills: [0, 0], gold: [0, 0], towers: [0, 0], dragons: [0, 0], barons: [0, 0] };
  const extra = [0, 0];
  for (const ev of events) {
    const d = deltas.get(ev)!;
    for (const i of [0, 1]) {
      run.kills[i] += d.kills[i];
      run.towers[i] += d.towers[i];
      run.dragons[i] += d.dragons[i];
      run.barons[i] += d.barons[i];
      extra[i] += d.gold[i];
      run.gold[i] = Math.round(2500 + 1700 * ev.time + extra[i]);
    }
    ev.snapshot = structuredClone(run);
  }

  return {
    detail: {
      duration: Math.round(duration * 10) / 10,
      gold: run.gold,
      towers: snap.towers,
      dragons: snap.dragons,
      barons: snap.barons,
      blueLines: teams[0].lines,
      redLines: teams[1].lines,
      events,
      rich: true,
    },
    kills: snap.kills,
  };
}

interface Delta {
  kills: [number, number];
  towers: [number, number];
  dragons: [number, number];
  barons: [number, number];
  gold: [number, number];
}

function laneName(idx: number): string {
  return idx === TOP ? 'topo' : idx === MID ? 'meio' : 'baixo';
}

function weightedIndex(rng: Rng, weights: number[]): number {
  let r = rng() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
