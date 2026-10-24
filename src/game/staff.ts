import { pick, randInt, type Rng } from './random';
import type { GameState, Staff, StaffRole } from './types';

export const STAFF_INFO: Record<StaffRole, { label: string; effect: (level: number) => string }> = {
  analyst: {
    label: 'Analista',
    effect: (l) => `+${(l * 0.3).toFixed(1)} no draft e na leitura do meta`,
  },
  assistant: {
    label: 'Treinador assistente',
    effect: (l) => `+${l * 12}% de evolução nos treinos`,
  },
  psychologist: {
    label: 'Psicólogo',
    effect: (l) => `derrotas abalam ${l * 12}% menos; +${(l * 0.5).toFixed(1)} de química por semana`,
  },
};

const FIRST = ['Lucas', 'Rafael', 'Ana', 'Bruno', 'Julia', 'Diego', 'Min-jun', 'Ji-woo', 'Chen', 'Wei', 'Marco', 'Sofia', 'Erik', 'Lena', 'Tomás', 'Camila', 'Hiro', 'Nguyen', 'Alex', 'Pedro'];
const LAST = ['Silva', 'Souza', 'Kim', 'Park', 'Li', 'Zhang', 'Rossi', 'Müller', 'Costa', 'Lopez', 'Tanaka', 'Tran', 'Ferreira', 'Johansson', 'Martins', 'Oliveira', 'Lee', 'Dubois'];

export function staffSalary(level: number): number {
  return Math.round(3 + level * level * 1.5);
}

export function generateStaffMarket(state: GameState, rng: Rng): Staff[] {
  const out: Staff[] = [];
  for (const role of Object.keys(STAFF_INFO) as StaffRole[]) {
    for (let i = 0; i < 3; i++) {
      const level = randInt(rng, 1, 5);
      out.push({
        id: `staff-${state.season}-${role}-${i}-${Math.floor(rng() * 1e6)}`,
        name: `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
        role,
        level,
        salary: staffSalary(level),
      });
    }
  }
  return out;
}

/** Nível do membro do staff na função (0 se ninguém contratado). */
export function staffLevel(state: GameState, role: StaffRole): number {
  return state.staff?.find((s) => s.role === role)?.level ?? 0;
}

export function staffPayroll(state: GameState): number {
  return (state.staff ?? []).reduce((sum, s) => sum + s.salary, 0);
}

export function hireStaff(prev: GameState, staffId: string): GameState {
  const state = structuredClone(prev);
  const hired = state.staffMarket!.find((s) => s.id === staffId)!;
  const current = state.staff?.find((s) => s.role === hired.role);
  state.staff = [...(state.staff ?? []).filter((s) => s !== current), hired];
  state.staffMarket = state.staffMarket!.filter((s) => s.id !== staffId);
  if (current) state.staffMarket.push(current);
  return state;
}

/** Demitir custa um mês de salário. */
export function fireStaff(prev: GameState, staffId: string): GameState {
  const state = structuredClone(prev);
  const member = state.staff!.find((s) => s.id === staffId)!;
  state.staff = state.staff!.filter((s) => s.id !== staffId);
  const team = state.teams[state.coach.teamId!];
  team.cash -= member.salary;
  state.finances = [
    { season: state.season, week: state.week, label: `Rescisão de ${member.name}`, amount: -member.salary },
    ...(state.finances ?? []),
  ].slice(0, 40);
  return state;
}
