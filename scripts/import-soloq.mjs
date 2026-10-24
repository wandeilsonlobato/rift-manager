// Estatísticas reais de SoloQ de alto elo (API da Riot) -> src/data/soloq.json.
// Coleta campeões, confrontos de rota (top x top, ADC x ADC...) e sinergia da dupla do bot.
//
// A chave vai no arquivo .env.local na raiz do projeto (fora do git):
//   RIOT_API_KEY=RGAPI-xxxxxxxx
//
//   npm run import:soloq                                   -> 20000 partidas de kr, euw1, na1 e vn2
//   npm run import:soloq -- --regions=kr,br1 --matches=3000
//
// O progresso fica em data-raw/soloq-progress.json: dá para parar (Ctrl+C) e rodar de novo que continua.
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'soloq.json');
const PROGRESS_FILE = path.join(ROOT, 'data-raw', 'soloq-progress.json');

// Servidor -> roteamento regional da API de partidas. O limite da chave vale por roteamento,
// então servidores de roteamentos diferentes coletam em paralelo.
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

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const platforms = (args.regions ?? args.region ?? 'kr,euw1,na1,vn2').split(',');
const target = Number(args.matches ?? 20000);
for (const p of platforms) if (!REGIONS[p]) throw new Error(`Região desconhecida: ${p}. Use: ${Object.keys(REGIONS).join(', ')}`);

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chave de desenvolvimento: 100 requisições a cada 2 minutos por roteamento.
const MIN_INTERVAL_MS = 1250;
const lastCall = new Map();

async function riot(host, endpoint) {
  for (;;) {
    const wait = (lastCall.get(host) ?? 0) + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(host, Date.now());
    let res;
    try {
      res = await fetch(`https://${host}.api.riotgames.com${endpoint}`, { headers: { 'X-Riot-Token': KEY } });
    } catch {
      await sleep(5000);
      continue;
    }
    if (res.status === 429) {
      await sleep(Number(res.headers.get('retry-after') ?? 10) * 1000);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error('Chave inválida ou expirada. Gere outra em developer.riotgames.com.');
    if (res.status === 404) return null;
    if (res.status >= 500) {
      await sleep(5000);
      continue;
    }
    if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
    return res.json();
  }
}

// IDs numéricos (bans) e nomes da API -> IDs do Data Dragon.
const versions = await fetch('https://ddragon.leagueoflegends.com/api/versions.json').then((r) => r.json());
const ddragon = await fetch(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`).then((r) => r.json());
const byKey = new Map(Object.values(ddragon.data).map((c) => [Number(c.key), c.id]));
const byLowerName = new Map(Object.values(ddragon.data).map((c) => [c.id.toLowerCase(), c.id]));
const champId = (name) => byLowerName.get(name.toLowerCase()) ?? name;

// --- Progresso salvo
let data = { matches: 0, patches: {}, regions: {}, champions: {}, matchups: {}, duos: {} };
let seen = new Set();
try {
  const saved = JSON.parse(await fs.readFile(PROGRESS_FILE, 'utf8'));
  data = saved.data;
  seen = new Set(saved.seen);
  console.log(`Continuando de ${data.matches} partidas já coletadas.`);
} catch {
  // começo do zero
}

const stat = (id) => (data.champions[id] ??= { games: 0, wins: 0, bans: 0, roles: {} });
const bump = (obj, key, won) => {
  const s = (obj[key] ??= { games: 0, wins: 0 });
  s.games++;
  if (won) s.wins++;
};

/** Soma uma partida: campeões, confrontos de cada rota e dupla do bot. */
function addMatch(info, platform) {
  const patch = info.gameVersion.split('.').slice(0, 2).join('.');
  data.patches[patch] = (data.patches[patch] ?? 0) + 1;
  data.regions[platform] = (data.regions[platform] ?? 0) + 1;
  const byTeamRole = {};
  for (const p of info.participants) {
    const champ = champId(p.championName);
    const role = POSITION_TO_ROLE[p.teamPosition];
    const s = stat(champ);
    s.games++;
    if (p.win) s.wins++;
    if (!role) continue;
    bump(s.roles, role, p.win);
    byTeamRole[`${p.teamId}-${role}`] = { champ, win: p.win };
  }
  for (const role of Object.values(POSITION_TO_ROLE)) {
    const a = byTeamRole[`100-${role}`];
    const b = byTeamRole[`200-${role}`];
    if (!a || !b || a.champ === b.champ) continue;
    // Chave em ordem alfabética; "wins" conta as vitórias do primeiro campeão.
    const [first, second] = a.champ < b.champ ? [a, b] : [b, a];
    bump((data.matchups[role] ??= {}), `${first.champ}|${second.champ}`, first.win);
  }
  for (const team of [100, 200]) {
    const adc = byTeamRole[`${team}-bottom`];
    const sup = byTeamRole[`${team}-support`];
    if (adc && sup) bump(data.duos, `${adc.champ}|${sup.champ}`, adc.win);
  }
  for (const team of info.teams) {
    for (const ban of team.bans) {
      const champ = byKey.get(ban.championId);
      if (champ) stat(champ).bans++;
    }
  }
  data.matches++;
}

async function save() {
  await fs.mkdir(path.dirname(PROGRESS_FILE), { recursive: true });
  await fs.writeFile(PROGRESS_FILE, JSON.stringify({ data, seen: [...seen] }));
  await fs.writeFile(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), platform: platforms.join(','), ...data }));
}

/** Coleta de um servidor: Challenger e Grão-Mestre, 100 partidas recentes de cada jogador. */
async function collect(platform) {
  const regional = REGIONS[platform];
  const players = [];
  for (const tier of ['challengerleagues', 'grandmasterleagues']) {
    const ladder = await riot(platform, `/lol/league/v4/${tier}/by-queue/RANKED_SOLO_5x5`);
    players.push(...(ladder?.entries ?? []).filter((e) => e.puuid));
  }
  console.log(`[${platform}] ${players.length} jogadores de Challenger e Grão-Mestre`);
  for (const player of players) {
    if (data.matches >= target) return;
    const ids = (await riot(regional, `/lol/match/v5/matches/by-puuid/${player.puuid}/ids?queue=420&type=ranked&count=100`)) ?? [];
    for (const id of ids) {
      if (data.matches >= target) return;
      if (seen.has(id)) continue;
      seen.add(id);
      const match = await riot(regional, `/lol/match/v5/matches/${id}`);
      if (match?.info?.queueId !== 420) continue;
      addMatch(match.info, platform);
      if (data.matches % 100 === 0) {
        await save();
        console.log(`  ${data.matches}/${target} partidas (${Object.entries(data.regions).map(([r, n]) => `${r} ${n}`).join(', ')})`);
      }
    }
  }
}

process.on('SIGINT', async () => {
  await save();
  console.log(`\nInterrompido: ${data.matches} partidas salvas. Rode de novo para continuar.`);
  process.exit(0);
});

await Promise.all(platforms.map((p) => collect(p).catch((err) => console.error(`[${p}] ${err.message}`))));
await save();
console.log(`\n${data.matches} partidas salvas em ${path.relative(ROOT, OUT_FILE)}`);
