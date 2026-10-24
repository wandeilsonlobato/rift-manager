import { addEntry } from './finance';
import { clamp, pick, type Rng } from './random';
import { staffLevel } from './staff';
import type { GameEvent, GameState, Player } from './types';
import { overall, starters } from './world';

/** Chance de um evento acontecer em uma semana. */
const EVENT_CHANCE = 0.3;

const money = (k: number) => `$${k}k`;

function log(state: GameState, text: string) {
  state.eventLog = [text, ...(state.eventLog ?? [])].slice(0, 12);
}

function team(state: GameState) {
  return state.teams[state.coach.teamId!];
}

function changeChemistry(state: GameState, delta: number) {
  const t = team(state);
  t.chemistry = clamp((t.chemistry ?? 60) + delta, 0, 100);
}

function changeMorale(p: Player, delta: number) {
  p.morale = clamp(p.morale + delta, 0, 100);
}

type Builder = (state: GameState, rng: Rng) => GameEvent | null;

const BUILDERS: Record<string, Builder> = {
  raise: (state, rng) => {
    const options = starters(state, team(state).id).filter((p) => (p.form ?? 0) >= 1 || overall(p) >= 70);
    if (!options.length) return null;
    const p = pick(rng, options);
    const amount = Math.max(2, Math.round(p.salary * 0.25));
    return {
      type: 'raise',
      title: 'Pedido de aumento',
      text: `${p.nick} está em grande fase e pede um aumento de ${money(amount)}/mês.`,
      playerIds: [p.id],
      amount,
      options: [
        { label: 'Aceitar', hint: `Salário +${money(amount)}/mês, moral +10` },
        { label: 'Recusar', hint: 'Moral -15, química -3' },
      ],
    };
  },
  conflict: (state, rng) => {
    const lineup = starters(state, team(state).id);
    if (lineup.length < 2) return null;
    const a = pick(rng, lineup);
    const b = pick(rng, lineup.filter((p) => p !== a));
    const psych = staffLevel(state, 'psychologist');
    return {
      type: 'conflict',
      title: 'Conflito no elenco',
      text: `${a.nick} e ${b.nick} discutiram feio depois da scrim. O clima ficou pesado na gaming house.`,
      playerIds: [a.id, b.id],
      amount: 0,
      options: [
        { label: 'Mediar a conversa', hint: `Chance de resolver: ${Math.round((0.4 + psych * 0.12) * 100)}% (psicólogo ajuda)` },
        { label: `Punir ${a.nick}`, hint: `Moral de ${a.nick} -12, química +3` },
        { label: 'Deixar quieto', hint: 'Química -8, moral dos dois -5' },
      ],
    };
  },
  bench: (state, rng) => {
    const lineup = new Set(starters(state, team(state).id).map((p) => p.id));
    const bench = team(state).playerIds.map((id) => state.players[id]).filter((p) => !lineup.has(p.id));
    if (!bench.length) return null;
    const p = pick(rng, bench);
    return {
      type: 'bench',
      title: 'Reserva insatisfeito',
      text: `${p.nick} reclama da falta de oportunidades e quer saber qual é o plano para ele.`,
      playerIds: [p.id],
      amount: 0,
      options: [
        { label: 'Conversar e motivar', hint: 'Moral +8' },
        { label: 'Ignorar', hint: 'Moral -12, química -3' },
      ],
    };
  },
  sponsor: (state) => {
    const amount = Math.round(20 + state.leagues[team(state).leagueSlug].prestige * 20);
    return {
      type: 'sponsor',
      title: 'Ação de patrocínio',
      text: `Um patrocinador oferece ${money(amount)} por uma semana de gravações e eventos com o elenco.`,
      playerIds: [],
      amount,
      options: [
        { label: 'Aceitar', hint: `Caixa +${money(amount)}, forma dos titulares -1` },
        { label: 'Recusar', hint: 'Nada muda' },
      ],
    };
  },
  drama: (state, rng) => {
    const p = pick(rng, starters(state, team(state).id));
    return {
      type: 'drama',
      title: 'Polêmica nas redes',
      text: `Uma live de ${p.nick} viralizou pelos motivos errados e a comunidade está cobrando o time.`,
      playerIds: [p.id],
      amount: 0,
      options: [
        { label: 'Defender o jogador', hint: `Reputação -2, moral de ${p.nick} +6` },
        { label: 'Punir publicamente', hint: `Moral de ${p.nick} -10, reputação +1` },
      ],
    };
  },
  bootcamp: (state) => {
    const amount = Math.round(15 + state.leagues[team(state).leagueSlug].prestige * 15);
    return {
      type: 'bootcamp',
      title: 'Convite para bootcamp',
      text: `Surgiu a chance de um bootcamp na Coreia por ${money(amount)}. Scrims de alto nível e o time junto 24h.`,
      playerIds: [],
      amount,
      options: [
        { label: 'Fazer o bootcamp', hint: `Caixa -${money(amount)}, química +10, forma +2` },
        { label: 'Recusar', hint: 'Nada muda' },
      ],
    };
  },
  sick: (state, rng) => {
    const p = pick(rng, starters(state, team(state).id));
    return {
      type: 'sick',
      title: 'Jogador doente',
      text: `${p.nick} pegou uma gripe forte e vai jogar abaixo do normal nas próximas 2 semanas.`,
      playerIds: [p.id],
      amount: 0,
      options: [{ label: 'Entendido', hint: `Forma de ${p.nick} -5 por 2 semanas` }],
    };
  },
};

// Frequência relativa de cada tipo de evento.
const WEIGHTS: Record<string, number> = {
  raise: 2,
  conflict: 2,
  bench: 1.5,
  sponsor: 1.5,
  drama: 1.5,
  bootcamp: 1,
  sick: 0.7,
};

function weightedType(rng: Rng): string {
  const entries = Object.entries(WEIGHTS);
  let r = rng() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [type, w] of entries) {
    r -= w;
    if (r <= 0) return type;
  }
  return entries[0][0];
}

/** Sorteia um evento para o time do coach (no máximo um pendente por vez). */
export function rollEvent(state: GameState, rng: Rng) {
  if (state.pendingEvent || rng() >= EVENT_CHANCE) return;
  for (let i = 0; i < 4; i++) {
    const event = BUILDERS[weightedType(rng)](state, rng);
    if (event) {
      state.pendingEvent = event;
      return;
    }
  }
}

/** Aplica a decisão do coach sobre o evento pendente. */
export function resolveEvent(prev: GameState, option: number): GameState {
  const state = structuredClone(prev);
  const ev = state.pendingEvent!;
  const [a, b] = ev.playerIds.map((id) => state.players[id]).filter(Boolean);
  const lineup = starters(state, team(state).id);
  state.pendingEvent = null;

  switch (ev.type) {
    case 'raise':
      if (option === 0) {
        a.salary += ev.amount;
        changeMorale(a, 10);
        log(state, `${a.nick} ganhou aumento de ${money(ev.amount)}/mês.`);
      } else {
        changeMorale(a, -15);
        changeChemistry(state, -3);
        log(state, `${a.nick} ficou chateado com o aumento negado.`);
      }
      break;
    case 'conflict':
      if (option === 0) {
        const solved = Math.random() < 0.4 + staffLevel(state, 'psychologist') * 0.12;
        changeChemistry(state, solved ? -2 : -10);
        log(state, solved ? `Conversa resolveu o conflito entre ${a.nick} e ${b.nick}.` : `A mediação não funcionou: ${a.nick} e ${b.nick} seguem brigados.`);
      } else if (option === 1) {
        changeMorale(a, -12);
        changeChemistry(state, 3);
        log(state, `${a.nick} foi punido pela discussão.`);
      } else {
        changeChemistry(state, -8);
        changeMorale(a, -5);
        changeMorale(b, -5);
        log(state, `O conflito entre ${a.nick} e ${b.nick} foi ignorado e o clima piorou.`);
      }
      break;
    case 'bench':
      if (option === 0) changeMorale(a, 8);
      else {
        changeMorale(a, -12);
        changeChemistry(state, -3);
      }
      log(state, option === 0 ? `${a.nick} saiu motivado da conversa.` : `${a.nick} segue insatisfeito no banco.`);
      break;
    case 'sponsor':
      if (option === 0) {
        addEntry(state, 'Ação de patrocínio', ev.amount);
        for (const p of lineup) p.form = clamp((p.form ?? 0) - 1, -5, 5);
        log(state, `Ação de patrocínio rendeu ${money(ev.amount)}.`);
      }
      break;
    case 'drama':
      if (option === 0) {
        state.coach.reputation = clamp(state.coach.reputation - 2, 0, 100);
        changeMorale(a, 6);
      } else {
        state.coach.reputation = clamp(state.coach.reputation + 1, 0, 100);
        changeMorale(a, -10);
      }
      log(state, option === 0 ? `Você defendeu ${a.nick} publicamente.` : `${a.nick} foi punido pela polêmica.`);
      break;
    case 'bootcamp':
      if (option === 0) {
        addEntry(state, 'Bootcamp', -ev.amount);
        changeChemistry(state, 10);
        for (const p of lineup) p.form = clamp((p.form ?? 0) + 2, -5, 5);
        log(state, 'O bootcamp aproximou o elenco.');
      }
      break;
    case 'sick':
      a.sick = 2;
      a.form = clamp((a.form ?? 0) - 5, -5, 5);
      log(state, `${a.nick} está doente.`);
      break;
  }
  return state;
}
