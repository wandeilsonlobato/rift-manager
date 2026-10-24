import { championsForRole, type Champion } from './ddragon';
import { clamp, pick, type Rng } from './random';
import type { Attributes, GameState, GrowthEntry, Intensity, Player, TrainingFocus } from './types';
import { overall } from './world';

export interface FocusInfo {
  id: TrainingFocus;
  label: string;
  description: string;
  /** atributo que evolui com esse foco */
  attr?: keyof Attributes;
}

export const FOCUSES: FocusInfo[] = [
  {
    id: 'early',
    label: 'Early game',
    description: 'Fase de rotas, trocas e pressão nos primeiros minutos. Bônus no early.',
    attr: 'laning',
  },
  {
    id: 'teamfight',
    label: 'Teamfight',
    description: 'Posicionamento e execução em lutas 5x5. Bônus no mid e late game.',
    attr: 'teamfight',
  },
  {
    id: 'objectives',
    label: 'Controle de objetivos',
    description: 'Dragões, Arauto, Barão e rotações. Bônus em objetivos e macro.',
    attr: 'macro',
  },
  {
    id: 'mechanics',
    label: 'Mecânica individual',
    description: 'Scrims 1x1 e SoloQ focada. Pequeno bônus em todas as fases.',
    attr: 'mechanics',
  },
  {
    id: 'draft',
    label: 'Draft e pool',
    description: 'Estudo do meta e campeões novos. Jogadores podem aprender campeões; bônus no draft.',
  },
  {
    id: 'rest',
    label: 'Descanso',
    description: 'Semana leve para recuperar a cabeça. Moral sobe bastante, mas ninguém evolui.',
    attr: 'mental',
  },
];

export const INTENSITIES: { id: Intensity; label: string; description: string; growth: number; morale: number }[] = [
  { id: 'light', label: 'Leve', description: 'Menos evolução, moral sobe.', growth: 0.5, morale: 2 },
  { id: 'normal', label: 'Normal', description: 'Equilíbrio entre evolução e moral.', growth: 1, morale: 0 },
  { id: 'intense', label: 'Intensa', description: 'Mais evolução, mas desgasta a moral.', growth: 1.6, morale: -3 },
];

export function focusInfo(id: TrainingFocus): FocusInfo {
  return FOCUSES.find((f) => f.id === id)!;
}

/** Times controlados pelo computador escolhem um foco aleatório a cada semana. */
export function aiFocus(rng: Rng): TrainingFocus {
  return pick(rng, ['early', 'teamfight', 'objectives', 'mechanics', 'draft'] as TrainingFocus[]);
}

function growthChance(p: Player): number {
  const room = p.potential - overall(p);
  const ageFactor = p.age <= 21 ? 1.3 : p.age >= 27 ? 0.6 : 1;
  return clamp(0.15 + room * 0.03, 0.05, 0.75) * ageFactor;
}

/** Aplica uma semana de treino ao elenco. Muta os jogadores e retorna o que evoluiu. */
export function applyTraining(
  state: GameState,
  teamId: string,
  focus: TrainingFocus,
  intensity: Intensity,
  champions: Champion[] | null,
  rng: Rng,
  growthBoost = 1,
  /** multiplicador extra para jogadores de até 22 anos */
  youthBoost = 1,
): GrowthEntry[] {
  const info = focusInfo(focus);
  const level = INTENSITIES.find((i) => i.id === intensity)!;
  const growth: GrowthEntry[] = [];

  for (const id of state.teams[teamId].playerIds) {
    const p = state.players[id];
    if (focus === 'rest') {
      p.morale = clamp(p.morale + 6, 0, 100);
      continue;
    }
    p.morale = clamp(p.morale + level.morale, 0, 100);
    const youth = p.age <= 22 ? youthBoost : 1;
    if (rng() > growthChance(p) * level.growth * growthBoost * youth) continue;

    if (focus === 'draft') {
      const options = champions
        ? championsForRole(champions, p.role).filter((c) => !p.champions.includes(c.id))
        : [];
      if (options.length && p.champions.length < 10) {
        // Estudar o meta: campeões fortes do patch têm prioridade.
        const meta = options.filter((c) => state.meta?.buffed.includes(c.id));
        const champ = pick(rng, meta.length && rng() < 0.6 ? meta : options);
        p.champions = [...p.champions, champ.id];
        growth.push({ playerId: id, attr: 'champion', value: champ.id });
      }
    } else if (info.attr && p.attrs[info.attr] < 99) {
      const gain = rng() < 0.35 ? 2 : 1;
      p.attrs = { ...p.attrs, [info.attr]: Math.min(99, p.attrs[info.attr] + gain) };
      growth.push({ playerId: id, attr: info.attr, value: String(gain) });
    }
  }
  return growth;
}
