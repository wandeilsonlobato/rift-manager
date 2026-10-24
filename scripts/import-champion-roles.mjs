// Rotas reais de cada campeão (Meraki Analytics, sem chave) -> src/data/championRoles.json.
//   npm run import:roles
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'championRoles.json');
const URL = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json';

const POSITION_TO_ROLE = {
  TOP: 'top',
  JUNGLE: 'jungle',
  MIDDLE: 'mid',
  BOTTOM: 'bottom',
  SUPPORT: 'support',
};

const res = await fetch(URL);
if (!res.ok) throw new Error(`Meraki: HTTP ${res.status}`);
const data = await res.json();

const roles = {};
for (const [id, champ] of Object.entries(data)) {
  const list = (champ.positions ?? []).map((p) => POSITION_TO_ROLE[p]).filter(Boolean);
  if (list.length) roles[id] = list;
}

await fs.writeFile(OUT_FILE, JSON.stringify(roles));
console.log(`${Object.keys(roles).length} campeões salvos em ${path.relative(ROOT, OUT_FILE)}`);
