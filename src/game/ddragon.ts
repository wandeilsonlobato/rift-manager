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

// Classes do Data Dragon que combinam com cada rota (aproximação).
const ROLE_TAGS: Record<Role, string[]> = {
  top: ['Fighter', 'Tank'],
  jungle: ['Fighter', 'Assassin', 'Tank'],
  mid: ['Mage', 'Assassin'],
  bottom: ['Marksman'],
  support: ['Support'],
};

export function championsForRole(champions: Champion[], role: Role): Champion[] {
  const tags = ROLE_TAGS[role];
  return champions.filter((c) => tags.includes(c.tags[0]));
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
