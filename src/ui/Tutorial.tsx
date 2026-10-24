import { useState } from 'react';
import type { Tab } from './Hub';
import { Icon } from './Icon';

interface Step {
  title: string;
  text: string;
  /** aba do menu destacada durante o passo */
  tab?: Tab;
}

const STEPS: Step[] = [
  {
    title: 'Bem-vindo à sala do coach',
    text: 'Aqui no Início você vê o próximo jogo, as mensagens da semana e seus titulares. Cada semana tem treino, jogos e decisões.',
    tab: 'home',
  },
  {
    title: 'Treine toda semana',
    text: 'Na aba Treino escolha um foco individual ou coletivo e aperte Treinar. É um treino por semana: sem ele o time não evolui.',
    tab: 'training',
  },
  {
    title: 'Monte o time',
    text: 'No Elenco você escolhe os titulares, a tática de jogo e acompanha o entrosamento do time.',
    tab: 'roster',
  },
  {
    title: 'O draft é com você',
    text: 'Nos seus jogos você faz pick e ban. Campeões do pool dos jogadores e fortes no patch dão vantagem; os confrontos de rota pesam no early.',
  },
  {
    title: 'Avance a semana',
    text: 'Quando estiver pronto, aperte Avançar semana no Início. Depois do Worlds abre o mercado para renovar, contratar e dispensar.',
    tab: 'home',
  },
  {
    title: 'Clube e mercado',
    text: 'No Clube você contrata staff e acompanha o caixa. No Mercado, os reforços. Boa sorte rumo ao Worlds!',
    tab: 'club',
  },
];

interface Props {
  onHighlight: (tab: Tab | null) => void;
  onFinish: () => void;
}

/** Tutorial curto da primeira carreira, em balões; dá para pular a qualquer momento. */
export function Tutorial({ onHighlight, onFinish }: Props) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const go = (next: number) => {
    setIndex(next);
    onHighlight(STEPS[next].tab ?? null);
  };
  const finish = () => {
    onHighlight(null);
    onFinish();
  };

  return (
    <div className="tutorial">
      <div className="tutorial-box">
        <span className="hero-sub">
          Tutorial · {index + 1}/{STEPS.length}
        </span>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="tutorial-actions">
          <button className="btn ghost small" onClick={finish}>
            Pular
          </button>
          {index > 0 && (
            <button className="btn small" onClick={() => go(index - 1)}>
              <Icon name="back" size={14} /> Voltar
            </button>
          )}
          <button className="btn primary small" onClick={() => (last ? finish() : go(index + 1))}>
            {last ? 'Começar' : 'Próximo'} <Icon name="next" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
