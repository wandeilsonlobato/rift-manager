// Estatísticas reais de SoloQ de alto elo (API da Riot) -> src/data/soloq.json.
//
// A chave vai no arquivo .env.local na raiz do projeto (fora do git):
//   RIOT_API_KEY=RGAPI-xxxxxxxx
//
//   npm run import:soloq                       -> 500 partidas da Coreia
//   npm run import:soloq -- --region=br1 --matches=300
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'soloq.json');

// Servidor -> roteamento regional usado pela API de partidas.
const REGIONS = {
  kr: 'asia',
  jp1: 'asia',
  euw1: 'europe',
  eun1: 'europe',
  tr1: 'europe',
  na1: 'americas',
  br1: 'americas',
  la1: 'americas',
  la2: 'americas',
  vn2: 'sea',
  tw2: 'sea',
};
const POSITION_TO_ROLE = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid', BOTTOM: 'bottom', UTILITY: 'support' };

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')),
);
const platform = args.region ?? 'kr';
const target = Number(args.matches ?? 500);
const regional = REGIONS[platform];
if (!regional) throw new Error(`Região desconhecida: ${platform}. Use: ${Object.keys(REGIONS).join(', ')}`);

async function readKey() {
  if (process.env.RIOT_API_KEY) return process.env.RIOT_API_KEY.trim();
  try {
    const env = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8');
    const line = env.split(/\r?\n/).find((l) => l.startsWith('RIOT_API_KEY='));
    if (line) return line.slice('RIOT_API_KEY='.length).trim();
  } catch {
    // sem arquivo
  }
  throw new Error('Chave não encontrada. Crie o arquivo .env.local com RIOT_API_KEY=RGAPI-...');
}

const KEY = await readKey();

// Chave de desenvolvimento: 100 requisições a cada 2 minutos.
const MIN_INTERVAL_MS = 1250;
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function riot(host, endpoint) {
  for (;;) {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(`https://${host}.api.riotgames.com${endpoint}`, { headers: { 'X-Riot-Token': KEY } });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? 10);
      console.log(`  limite atingido, aguardando ${retry}s…`);
      await sleep(retry * 1000);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error('Chave inválida ou expirada. Gere outra em developer.riotgames.com.');
    if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
    return res.json();
  }
}

// IDs numéricos dos campeões (bans vêm assim) -> IDs do Data Dragon.
const versions = await fetch('https://ddragon.leagueoflegends.com/api/versions.json').then((r) => r.json());
const ddragon = await fetch(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`).then((r) => r.json());
const byKey = new Map(Object.values(ddragon.data).map((c) => [Number(c.key), c.id]));
const byLowerName = new Map(Object.values(ddragon.data).map((c) => [c.id.toLowerCase(), c.id]));

console.log(`Buscando o Challenger de ${platform}…`);
const ladder = await riot(platform, '/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5');
const players = ladder.entries.sort((a, b) => b.leaguePoints - a.leaguePoints).filter((e) => e.puuid);
console.log(`${players.length} jogadores. Coletando partidas…`);

const matchIds = new Set();
for (const p of players) {
  if (matchIds.size >= target) break;
  const ids = await riot(regional, `/lol/match/v5/matches/by-puuid/${p.puuid}/ids?queue=420&type=ranked&count=20`);
  ids.forEach((id) => matchIds.add(id));
}

const champions = {};
const patches = {};
const stat = (id) => (champions[id] ??= { games: 0, wins: 0, bans: 0, roles: {} });

let done = 0;
for (const id of [...matchIds].slice(0, target)) {
  const match = await riot(regional, `/lol/match/v5/matches/${id}`);
  const info = match.info;
  if (!info || info.queueId !== 420) continue;
  const patch = info.gameVersion.split('.').slice(0, 2).join('.');
  patches[patch] = (patches[patch] ?? 0) + 1;
  for (const p of info.participants) {
    const champ = byLowerName.get(p.championName.toLowerCase()) ?? p.championName;
    const role = POSITION_TO_ROLE[p.teamPosition];
    const s = stat(champ);
    s.games++;
    if (p.win) s.wins++;
    if (role) {
      const r = (s.roles[role] ??= { games: 0, wins: 0 });
      r.games++;
      if (p.win) r.wins++;
    }
  }
  for (const team of info.teams) {
    for (const ban of team.bans) {
      const champ = byKey.get(ban.championId);
      if (champ) stat(champ).bans++;
    }
  }
  done++;
  if (done % 25 === 0) console.log(`  ${done}/${Math.min(target, matchIds.size)} partidas`);
}

const out = {
  generatedAt: new Date().toISOString(),
  platform,
  matches: done,
  patches,
  champions,
};
await fs.writeFile(OUT_FILE, JSON.stringify(out));
console.log(`\n${done} partidas de ${Object.keys(champions).length} campeões salvas em ${path.relative(ROOT, OUT_FILE)}`);
