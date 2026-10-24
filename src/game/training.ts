import { championsForRole, type Champion } from './ddragon';
import { clamp, pick, type Rng } from './random';
import { changeCollective } from './collective';
import { COLLECTIVE_LABEL, type Attributes, type Collective, type GameState, type GrowthEntry, type Intensity, type Player, type TrainingFocus } from './types';
import { overall } from './world';

export interface FocusInfo {
  id: TrainingFocus;
  label: string;
  description: string;
  /** atributo que evolui com esse foco */
  attr?: keyof Attributes;
  /** atributo coletivo do time que evolui (focos coletivos) */
  collective?: keyof Collective;
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
    id: 'team_rotations',
    label: 'Scrims de rotação',
    description: 'Movimentação em grupo, troca de rotas e pressão no mapa. Rende no mid game e nos objetivos.',
    collective: 'rotations',
  },
  {
    id: 'team_fights',
    label: 'Teamfight 5x5',
    description: 'Engage, foco no alvo certo e proteção do carry. Rende nas lutas do mid e do late.',
    collective: 'teamfight',
  },
  {
    id: 'team_vision',
    label: 'Visão e objetivos',
    description: 'Wards, sweeps e negar visão. Mais pickoffs e Barões seguros.',
    collective: 'vision',
  },
  {
    id: 'team_comms',
    label: 'Revisão de VODs',
    description: 'Calls mais rápidas e todos na mesma página. Menos dias ruins e moral mais estável.',
    collective: 'comms',
  },
  {
    id: 'team_prep',
    label: 'Preparação de draft',
    description: 'Estudo do adversário e do meta. Bônus no draft e nos confrontos.',
    collective: 'prep',
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
  return pick(rng, [
    'early',
    'teamfight',
    'objectives',
    'mechanics',
    'draft',
    'team_rotations',
    'team_fights',
    'team_vision',
    'team_comms',
    'team_prep',
  ] as TrainingFocus[]);
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

  // Foco coletivo: o time evolui junto (o atributo do time sobe), e a moral segue a intensidade.
  if (info.collective) {
    for (const id of state.teams[teamId].playerIds) {
      const p = state.players[id];
      p.morale = clamp(p.morale + level.morale, 0, 100);
    }
    const gain = Math.round((2 + rng() * 2) * level.growth * growthBoost * 10) / 10;
    changeCollective(state, teamId, info.collective, gain);
    growth.push({ playerId: '', attr: 'collective', value: `${COLLECTIVE_LABEL[info.collective]} +${gain}` });
    return growth;
  }

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
