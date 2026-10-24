import { useState } from 'react';
import type { GameState } from '../game/types';
import { trainedFocus } from '../game/week';
import type { Tab } from './Hub';
import { Icon, type IconName } from './Icon';

interface Message {
  id: string;
  from: string;
  icon: IconName;
  subject: string;
  body?: string;
  tone?: 'good' | 'bad';
  action?: { label: string; tab: Tab };
}

/** Monta as mensagens da semana a partir do que aconteceu no jogo. */
function buildMessages(game: GameState): Message[] {
  const out: Message[] = [];
  const myTeam = game.coach.teamId!;
  const team = game.teams[myTeam];

  if (game.phase !== 'offseason' && !trainedFocus(game)) {
    out.push({
      id: 'training',
      from: 'Comissão técnica',
      icon: 'dumbbell',
      subject: 'O treino desta semana ainda não foi feito',
      body: 'Sem treino o time não evolui nem recebe o bônus do foco nos jogos da semana.',
      tone: 'bad',
      action: { label: 'Ir para o treino', tab: 'training' },
    });
  }

  for (const id of game.lastReport?.seriesIds ?? []) {
    const s = game.series[id];
    if (!s?.winner) continue;
    const won = s.winner === myTeam;
    const rival = game.teams[s.a === myTeam ? s.b : s.a];
    const [mine, theirs] = s.a === myTeam ? s.wins : [s.wins[1], s.wins[0]];
    out.push({
      id: `result-${id}`,
      from: 'Análise de desempenho',
      icon: 'bracket',
      subject: `${won ? 'Vitória' : 'Derrota'} contra ${rival.name}${s.bestOf > 1 ? ` (${mine}–${theirs})` : ''}`,
      body: s.label,
      tone: won ? 'good' : 'bad',
    });
  }

  if (game.week <= 2 && game.coach.objective && game.phase !== 'offseason') {
    out.push({
      id: 'objective',
      from: `Diretoria · ${team.name}`,
      icon: 'shield',
      subject: `Objetivo da temporada: ${game.coach.objective.text}`,
      body: 'A diretoria vai avaliar seu trabalho pela colocação média nos três splits.',
    });
  }

  (game.eventLog ?? []).slice(0, 4).forEach((text, i) =>
    out.push({ id: `event-${i}`, from: 'Assessoria do time', icon: 'users', subject: text }),
  );
  game.news.slice(0, 5).forEach((text, i) =>
    out.push({ id: `news-${i}`, from: 'Mercado', icon: 'coins', subject: text }),
  );
  return out;
}

export function Inbox({ game, onTab }: { game: GameState; onTab: (tab: Tab) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const messages = buildMessages(game);
  if (!messages.length) return null;

  return (
    <section className="panel inbox">
      <h3>Caixa de entrada</h3>
      <ul>
        {messages.map((m) => (
          <li key={m.id} className={`mail ${m.tone ?? ''} ${openId === m.id ? 'open' : ''}`}>
            <button className="mail-row" onClick={() => setOpenId(openId === m.id ? null : m.id)}>
              <span className="mail-avatar">
                <Icon name={m.icon} size={18} />
              </span>
              <span className="mail-text">
                <span className="mail-from">{m.from}</span>
                <span className="mail-subject">{m.subject}</span>
              </span>
            </button>
            {openId === m.id && (m.body || m.action) && (
              <div className="mail-body">
                {m.body && <p>{m.body}</p>}
                {m.action && (
                  <button className="btn small" onClick={() => onTab(m.action!.tab)}>
                    {m.action.label}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
