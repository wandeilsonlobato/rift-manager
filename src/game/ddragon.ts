import championRoles from '../data/championRoles.json';
// Riot Data Dragon: dados e imagens oficiais dos campeões (sem chave de API).
import type { Role } from './types';

const BASE = 'https://ddragon.leagueoflegends.com';

export interface Champion {
  id: string;
  name: string;
  title: string;
  tags: string[];
}

let version = '';

export async function loadChampions(): Promise<Champion[]> {
  const versions: string[] = await fetch(`${BASE}/api/versions.json`).then((r) => r.json());
  version = versions[0];
  const res = await fetch(`${BASE}/cdn/${version}/data/pt_BR/champion.json`).then((r) => r.json());
  return Object.values(res.data as Record<string, Champion>).map(({ id, name, title, tags }) => ({
    id,
    name,
    title,
    tags,
  }));
}

export function championIcon(id: string): string {
  return `${BASE}/cdn/${version}/img/champion/${id}.png`;
}

export function championSplash(id: string): string {
  return `${BASE}/cdn/img/champion/splash/${id}_0.jpg`;
}

// Rotas reais (Meraki Analytics). Campeões novos que ainda não estão lá usam a classe como estimativa.
const REAL_ROLES = championRoles as Record<string, Role[]>;

// Classes do Data Dragon que combinam com cada rota (aproximação).
const ROLE_TAGS: Record<Role, string[]> = {
  top: ['Fighter', 'Tank'],
  jungle: ['Fighter', 'Assassin', 'Tank'],
  mid: ['Mage', 'Assassin'],
  bottom: ['Marksman'],
  support: ['Support'],
};

export function playsRole(champion: Champion, role: Role): boolean {
  const real = REAL_ROLES[champion.id];
  return real ? real.includes(role) : ROLE_TAGS[role].includes(champion.tags[0]);
}

export function championsForRole(champions: Champion[], role: Role): Champion[] {
  return champions.filter((c) => playsRole(c, role));
}

/** Arte vertical do campeão (a da tela de carregamento), boa para os cards do draft. */
export function championLoading(id: string): string {
  return `${BASE}/cdn/img/champion/loading/${id}_0.jpg`;
}

const POSITION: Record<Role, string> = {
  top: 'top',
  jungle: 'jungle',
  mid: 'middle',
  bottom: 'bottom',
  support: 'utility',
};

/** Ícone oficial da rota (Community Dragon). */
export function roleIcon(role: Role): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${POSITION[role]}.png`;
}
