import { addEntry } from './finance';
import { changeCollective } from './collective';
import { clamp, pick, type Rng } from './random';
import { recentForm, stageStandings } from './season';
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
    const options = starters(state, team(state).id).filter(
      (p) => ((p.form ?? 0) >= 1 || overall(p) >= 70) && p.lastRaise !== state.season,
    );
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
  leak: (state) => {
    const analyst = staffLevel(state, 'analyst');
    return {
      type: 'leak',
      title: 'Vazou print de treino',
      text: 'Um print da sala de scrim com a estratégia do time caiu nas redes. Os rivais já estão comentando.',
      playerIds: [],
      amount: 0,
      options: [
        { label: 'Investigar quem vazou', hint: `Chance de descobrir: ${Math.round((0.45 + analyst * 0.08) * 100)}% (analista ajuda)` },
        { label: 'Trocar a estratégia', hint: 'Preparação de draft -5' },
        { label: 'Ignorar', hint: 'Preparação de draft -10, comunicação -3' },
      ],
    };
  },
  indiscipline: (state, rng) => {
    const roster = team(state).playerIds.map((id) => state.players[id]);
    const p = pick(rng, starters(state, team(state).id));
    const hasBackup = roster.some((x) => x.role === p.role && x.id !== p.id);
    const fine = Math.max(2, Math.round(p.salary * 0.5));
    const reason = pick(rng, [
      'chegou atrasado em três scrims seguidas',
      'passou a madrugada na SoloQ e dormiu na hora do treino',
      'faltou à reunião de VOD sem avisar',
    ]);
    return {
      type: 'indiscipline',
      title: 'Jogador indisciplinado',
      text: `${p.nick} ${reason}. O resto do elenco está de olho na sua reação.`,
      playerIds: [p.id],
      amount: fine,
      options: [
        { label: `Multar (${money(fine)})`, hint: `Caixa +${money(fine)}, moral de ${p.nick} -8, química +2` },
        ...(hasBackup ? [{ label: 'Afastar do próximo jogo', hint: `${p.nick} vai para o banco, moral -15, química +4` }] : []),
        { label: 'Conversar em particular', hint: 'Pode resolver; se não resolver, a forma cai' },
        { label: 'Ignorar', hint: 'Química -6, moral dos outros -3' },
      ],
    };
  },
  board: (state) => ({
    type: 'board',
    title: 'Cobrança da diretoria',
    text: `A diretoria do ${team(state).name} está insatisfeita com os resultados e quer explicações. Se não melhorar, sua cadeira fica em risco no fim da temporada.`,
    playerIds: [],
    amount: Math.round(20 + state.leagues[team(state).leagueSlug].prestige * 20),
    options: [
      { label: 'Assumir a responsabilidade', hint: 'Reputação -1, moral dos titulares +4' },
      { label: 'Culpar os jogadores', hint: 'Reputação +1, moral dos titulares -8, química -5' },
      { label: 'Pedir tempo e reforço', hint: 'Com reputação 30+: verba extra no caixa. Abaixo disso: reputação -3' },
    ],
  }),
  poach: (state, rng) => {
    const roster = team(state).playerIds.map((id) => state.players[id]);
    const candidates = starters(state, team(state).id).filter(
      (p) => overall(p) >= 55 && roster.some((x) => x.role === p.role && x.id !== p.id),
    );
    if (!candidates.length) return null;
    const p = pick(rng, candidates);
    const league = state.leagues[team(state).leagueSlug];
    const rivals = Object.values(state.teams).filter(
      (t) => t.id !== team(state).id && state.leagues[t.leagueSlug].prestige >= league.prestige,
    );
    if (!rivals.length) return null;
    const rival = pick(rng, rivals);
    const fee = Math.round(p.salary * 8 + 20);
    return {
      type: 'poach',
      title: 'Proposta por um titular',
      text: `O ${rival.name} oferece ${money(fee)} para levar ${p.nick} agora. O jogador gostou da ideia.`,
      playerIds: [p.id],
      amount: fee,
      rivalId: rival.id,
      options: [
        { label: 'Vender', hint: `Caixa +${money(fee)}; o reserva da rota assume` },
        { label: 'Recusar', hint: `Moral de ${p.nick} -8` },
        { label: 'Segurar com aumento', hint: `Salário +${money(Math.round(p.salary * 0.2) + 1)}/mês, moral +8` },
      ],
    };
  },
  injury: (state, rng) => {
    const p = pick(rng, starters(state, team(state).id));
    return {
      type: 'injury',
      title: 'Tendinite no pulso',
      text: `${p.nick} está com dores no pulso depois da maratona de treinos. O médico recomenda repouso.`,
      playerIds: [p.id],
      amount: 0,
      options: [
        { label: 'Repouso', hint: 'Forma bem baixa por 2 semanas, moral +5' },
        { label: 'Jogar no sacrifício', hint: 'Forma -2 agora; 40% de chance de piorar (3 semanas fora de forma)' },
      ],
    };
  },
  homesick: (state, rng) => {
    const region = state.leagues[team(state).leagueSlug].region;
    const foreigners = starters(state, team(state).id).filter((p) => p.region && p.region !== region);
    if (!foreigners.length) return null;
    const p = pick(rng, foreigners);
    return {
      type: 'homesick',
      title: 'Saudade de casa',
      text: `${p.nick} está há meses longe da família e pede alguns dias para visitar a terra natal.`,
      playerIds: [p.id],
      amount: 0,
      options: [
        { label: 'Liberar uns dias', hint: 'Moral +12, forma -3' },
        { label: 'Negar', hint: 'Moral -10' },
      ],
    };
  },
  trashtalk: (state, rng) => {
    const league = state.leagues[team(state).leagueSlug];
    const rival = state.teams[pick(rng, league.teamIds.filter((id) => id !== team(state).id))];
    return {
      type: 'trashtalk',
      title: 'Provocação de rival',
      text: `Um jogador do ${rival.name} disse em entrevista que o seu time "não tem nível para a liga".`,
      playerIds: [],
      amount: 0,
      options: [
        { label: 'Responder à altura', hint: 'Moral dos titulares +5, reputação -1' },
        { label: 'Ignorar e focar', hint: 'Comunicação +2' },
      ],
    };
  },
  fans: (state) => {
    const amount = Math.round(10 + state.leagues[team(state).leagueSlug].prestige * 8);
    return {
      type: 'fans',
      title: 'Encontro com a torcida',
      text: `A torcida organizou um meet & greet e quer o elenco presente. A ação rende ${money(amount)} em produtos.`,
      playerIds: [],
      amount,
      options: [
        { label: 'Participar', hint: `Caixa +${money(amount)}, moral +4, reputação +1, forma -1` },
        { label: 'Poupar o elenco', hint: 'Reputação -1' },
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
  raise: 1,
  conflict: 1.5,
  bench: 1,
  sponsor: 1,
  drama: 1.2,
  bootcamp: 0.8,
  sick: 0.6,
  leak: 1,
  indiscipline: 1.3,
  poach: 0.8,
  injury: 0.6,
  homesick: 0.8,
  trashtalk: 1,
  fans: 0.8,
};

/** Quantos eventos precisam passar antes de um tipo poder se repetir. */
const COOLDOWN = 4;

/** Time indo mal: últimos jogos ruins ou na parte de baixo da tabela atual. */
function strugglingTeam(state: GameState): boolean {
  const teamId = team(state).id;
  const form = recentForm(state, teamId);
  if (form.length >= 4 && form.filter((r) => r === 'V').length <= 1) return true;
  const comp = state.competitions.find(
    (c) => c.phase === state.phase && !c.done && c.stages[c.stageIndex].teamIds.includes(teamId),
  );
  const st = comp?.stages[comp.stageIndex];
  if (!st || (st.kind !== 'rr1' && st.kind !== 'rr2')) return false;
  const table = stageStandings(state, st);
  const pos = table.findIndex((r) => r.teamId === teamId);
  const played = table[pos].wins + table[pos].losses;
  return played >= 4 && pos >= Math.ceil(table.length * 0.7);
}

function weightedType(rng: Rng, blocked: string[]): string {
  const entries = Object.entries(WEIGHTS).filter(([type]) => !blocked.includes(type));
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
  const recent = state.recentEvents ?? [];
  // Time mal das pernas: a diretoria cobra com prioridade (se não cobrou há pouco).
  const types: string[] = [];
  if (!recent.includes('board') && strugglingTeam(state) && rng() < 0.35) types.push('board');
  for (let i = 0; i < 6; i++) types.push(weightedType(rng, [...recent, ...types]));
  for (const type of types) {
    const event = BUILDERS[type](state, rng);
    if (event) {
      state.pendingEvent = event;
      state.recentEvents = [type, ...recent].slice(0, COOLDOWN);
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
      a.lastRaise = state.season;
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
    case 'leak':
      if (option === 0) {
        const roster = team(state).playerIds.map((id) => state.players[id]);
        if (Math.random() < 0.45 + staffLevel(state, 'analyst') * 0.08) {
          const culprit = roster[Math.floor(Math.random() * roster.length)];
          changeMorale(culprit, -10);
          changeChemistry(state, 3);
          log(state, `O print foi vazado por ${culprit.nick}. O caso foi resolvido internamente.`);
        } else {
          changeChemistry(state, -5);
          log(state, 'A investigação não achou o responsável e o clima ficou desconfiado.');
        }
      } else if (option === 1) {
        changeCollective(state, team(state).id, 'prep', -5);
        log(state, 'O time trocou a estratégia depois do vazamento.');
      } else {
        changeCollective(state, team(state).id, 'prep', -10);
        changeCollective(state, team(state).id, 'comms', -3);
        log(state, 'O vazamento foi ignorado e os rivais aproveitaram a estratégia.');
      }
      break;
    case 'indiscipline': {
      // As opções variam: "afastar" só existe quando há reserva na rota.
      const label = ev.options[option]?.label ?? '';
      if (label.startsWith('Multar')) {
        addEntry(state, `Multa de ${a.nick}`, ev.amount);
        changeMorale(a, -8);
        changeChemistry(state, 2);
        log(state, `${a.nick} foi multado por indisciplina.`);
      } else if (label.startsWith('Afastar')) {
        const t = team(state);
        const backup = t.playerIds.map((id) => state.players[id]).find((p) => p.role === a.role && p.id !== a.id);
        if (backup) t.lineup = { ...t.lineup, [a.role]: backup.id };
        changeMorale(a, -15);
        changeChemistry(state, 4);
        log(state, `${a.nick} foi afastado e ${backup?.nick ?? 'o reserva'} assume como titular.`);
      } else if (label.startsWith('Conversar')) {
        if (Math.random() < 0.5 + staffLevel(state, 'psychologist') * 0.1) {
          changeMorale(a, 5);
          log(state, `A conversa com ${a.nick} surtiu efeito.`);
        } else {
          a.form = clamp((a.form ?? 0) - 2, -5, 5);
          log(state, `${a.nick} não mudou de postura depois da conversa.`);
        }
      } else {
        changeChemistry(state, -6);
        for (const p of lineup) if (p !== a) changeMorale(p, -3);
        log(state, `A indisciplina de ${a.nick} passou batido e o elenco não gostou.`);
      }
      break;
    }
    case 'board':
      if (option === 0) {
        state.coach.reputation = clamp(state.coach.reputation - 1, 0, 100);
        for (const p of lineup) changeMorale(p, 4);
        log(state, 'Você assumiu a responsabilidade diante da diretoria.');
      } else if (option === 1) {
        state.coach.reputation = clamp(state.coach.reputation + 1, 0, 100);
        for (const p of lineup) changeMorale(p, -8);
        changeChemistry(state, -5);
        log(state, 'Você culpou os jogadores e o vestiário sentiu.');
      } else if (state.coach.reputation >= 30) {
        addEntry(state, 'Verba extra da diretoria', ev.amount);
        log(state, `A diretoria liberou ${money(ev.amount)} para reforçar o time.`);
      } else {
        state.coach.reputation = clamp(state.coach.reputation - 3, 0, 100);
        log(state, 'A diretoria negou o pedido e a confiança em você caiu.');
      }
      break;
    case 'poach':
      if (option === 0) {
        const from = team(state);
        const rival = state.teams[ev.rivalId!];
        from.playerIds = from.playerIds.filter((id) => id !== a.id);
        rival.playerIds.push(a.id);
        a.teamId = rival.id;
        if (from.lineup?.[a.role] === a.id) from.lineup = { ...from.lineup, [a.role]: undefined };
        addEntry(state, `Venda de ${a.nick}`, ev.amount);
        changeChemistry(state, -4);
        log(state, `${a.nick} foi vendido ao ${rival.name} por ${money(ev.amount)}.`);
      } else if (option === 1) {
        changeMorale(a, -8);
        log(state, `Você recusou a proposta por ${a.nick}.`);
      } else {
        a.salary += Math.round(a.salary * 0.2) + 1;
        changeMorale(a, 8);
        log(state, `${a.nick} ganhou aumento e fica no time.`);
      }
      break;
    case 'injury':
      if (option === 0) {
        a.sick = 2;
        a.form = -5;
        changeMorale(a, 5);
        log(state, `${a.nick} vai descansar o pulso por duas semanas.`);
      } else if (Math.random() < 0.4) {
        a.sick = 3;
        a.form = -5;
        log(state, `A lesão de ${a.nick} piorou: três semanas fora de forma.`);
      } else {
        a.form = clamp((a.form ?? 0) - 2, -5, 5);
        log(state, `${a.nick} segue jogando apesar das dores.`);
      }
      break;
    case 'homesick':
      if (option === 0) {
        changeMorale(a, 12);
        a.form = clamp((a.form ?? 0) - 3, -5, 5);
        log(state, `${a.nick} foi visitar a família e voltou animado.`);
      } else {
        changeMorale(a, -10);
        log(state, `${a.nick} ficou chateado por não poder ir para casa.`);
      }
      break;
    case 'trashtalk':
      if (option === 0) {
        for (const p of lineup) changeMorale(p, 5);
        state.coach.reputation = clamp(state.coach.reputation - 1, 0, 100);
        log(state, 'O time respondeu à provocação e entrou motivado.');
      } else {
        changeCollective(state, team(state).id, 'comms', 2);
        log(state, 'O time ignorou a provocação e focou nos treinos.');
      }
      break;
    case 'fans':
      if (option === 0) {
        addEntry(state, 'Encontro com a torcida', ev.amount);
        for (const p of lineup) {
          changeMorale(p, 4);
          p.form = clamp((p.form ?? 0) - 1, -5, 5);
        }
        state.coach.reputation = clamp(state.coach.reputation + 1, 0, 100);
        log(state, 'O encontro com a torcida foi um sucesso.');
      } else {
        state.coach.reputation = clamp(state.coach.reputation - 1, 0, 100);
        log(state, 'A torcida não gostou da ausência do elenco.');
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
