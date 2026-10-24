import type { CoachStyle, GameState, Tactic } from './types';

export const COACH_STYLES: Record<CoachStyle, { label: string; description: string; bonus: string }> = {
  tactical: {
    label: 'Tático',
    description: 'Estuda cada adversário e vive de draft e estratégia.',
    bonus: '+0,8 no draft e táticas 25% mais fortes',
  },
  motivator: {
    label: 'Motivador',
    description: 'Mantém o vestiário unido e o time confiante.',
    bonus: 'Derrotas abalam 30% menos, +1 de moral por semana e +0,5 de química',
  },
  developer: {
    label: 'Formador de talentos',
    description: 'Aposta na base e lapida jovens promessas.',
    bonus: 'Jogadores de até 22 anos evoluem 25% mais no treino',
  },
};

export function coachStyle(state: GameState): CoachStyle {
  return state.coach.style ?? 'tactical';
}

export const TACTICS: Record<Tactic, { label: string; description: string; early: number; mid: number; late: number }> = {
  balanced: { label: 'Equilibrada', description: 'Joga o jogo como ele vier, sem forçar.', early: 0, mid: 0, late: 0 },
  early: { label: 'Agressiva no early', description: 'Invades, ganks e pressão desde o nível 1. Perde força se o jogo alongar.', early: 2.5, mid: 0.5, late: -1.5 },
  scaling: { label: 'Escalar para o late', description: 'Segura o early e confia no time completo. Sofre contra pressão inicial.', early: -1.5, mid: 0, late: 2.5 },
  vision: { label: 'Controle de visão', description: 'Wards, sweeps e pickoffs. Rende mais com suporte e jungle de macro alto.', early: 0, mid: 1.5, late: 0.5 },
  objectives: { label: 'Foco em objetivos', description: 'Troca abates por dragões, Arauto e Barão.', early: 0.5, mid: 2, late: 0 },
};

/** Tática combina com o meta do patch: early com meta de early, scaling com meta de late. */
export function tacticMetaBonus(state: GameState, tactic: Tactic): number {
  const style = state.meta?.style;
  if ((tactic === 'early' && style === 'early') || (tactic === 'scaling' && style === 'late')) return 1;
  if ((tactic === 'early' && style === 'late') || (tactic === 'scaling' && style === 'early')) return -0.5;
  return 0;
}
