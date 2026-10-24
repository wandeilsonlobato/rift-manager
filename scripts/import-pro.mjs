// Dados reais das partidas profissionais de 2026 (API do lolesports) -> src/data/pro.json.
//   - resultados das séries e jogos de cada time (força inicial dos times)
//   - campeões que cada jogador usou em partidas oficiais (pool real)
//
//   npm run import:pro
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'pro.json');
const API = 'https://esports-api.lolesports.com/persisted/gw';
const FEED = 'https://feed.lolesports.com/livestats/v1/window';
// Chave pública usada pelo próprio site lolesports.com.
const API_KEY = process.env.LOLESPORTS_API_KEY ?? '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const SEASON_START = '2026-01-01';
const PARALLEL = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 204 || res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await sleep(2000);
    }
  }
  return null;
}

const api = (endpoint, params) => {
  const url = new URL(`${API}/${endpoint}`);
  url.search = new URLSearchParams({ hl: 'pt-BR', ...params }).toString();
  return getJson(url, { 'x-api-key': API_KEY }).then((r) => r?.data);
};

/** Executa tarefas com no máximo N em paralelo. */
async function pool(items, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

// Ligas do jogo (principais e academies) com o ID da API.
const game = JSON.parse(await fs.readFile(path.join(ROOT, 'src', 'data', 'leagues.json'), 'utf8'));
const apiLeagues = JSON.parse(await fs.readFile(path.join(ROOT, 'data-raw', 'leagues.json'), 'utf8')).data.leagues;
const slugs = new Set(game.leagues.flatMap((l) => [l.slug, l.academy?.slug].filter(Boolean)));
const leagues = apiLeagues.filter((l) => slugs.has(l.slug));

// Nomes de campeão do feed -> IDs do Data Dragon.
const versions = await fetch('https://ddragon.leagueoflegends.com/api/versions.json').then((r) => r.json());
const ddragon = await fetch(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`).then((r) => r.json());
const champByKey = new Map();
for (const c of Object.values(ddragon.data)) {
  champByKey.set(c.id.toLowerCase(), c.id);
  champByKey.set(c.name.toLowerCase().replace(/[^a-z]/g, ''), c.id);
}
const champId = (name) => champByKey.get(String(name).toLowerCase()) ?? champByKey.get(String(name).toLowerCase().replace(/[^a-z]/g, '')) ?? name;

const teams = {};
const players = {};
const matches = [];

/** Partidas concluídas de 2026 de uma liga (o calendário vem em páginas, das mais novas para as mais antigas). */
async function scheduleOf(league) {
  const found = [];
  let token;
  for (let page = 0; page < 40; page++) {
    const data = await api('getSchedule', { leagueId: league.id, ...(token ? { pageToken: token } : {}) });
    const events = data?.schedule?.events ?? [];
    for (const e of events) {
      if (e.type !== 'match' || e.state !== 'completed' || e.startTime < SEASON_START) continue;
      found.push(e);
    }
    const oldest = events.reduce((min, e) => (e.startTime < min ? e.startTime : min), '9999');
    token = data?.schedule?.pages?.older;
    if (!token || oldest < SEASON_START) break;
  }
  return found;
}

for (const league of leagues) {
  const events = await scheduleOf(league);
  for (const e of events) {
    const [a, b] = e.match.teams;
    if (!a || !b) continue;
    for (const [t, other] of [
      [a, b],
      [b, a],
    ]) {
      const key = `${league.slug}|${t.code}`;
      const s = (teams[key] ??= { name: t.name, seriesW: 0, seriesL: 0, gamesW: 0, gamesL: 0 });
      if (t.result?.outcome === 'win') s.seriesW++;
      else s.seriesL++;
      s.gamesW += t.result?.gameWins ?? 0;
      s.gamesL += other.result?.gameWins ?? 0;
    }
    matches.push(e.match.id);
  }
  console.log(`- ${league.name}: ${events.length} séries`);
}

// Campeões de cada jogo: detalhes da série -> jogos -> feed com os participantes.
let gamesRead = 0;
await pool(matches, async (matchId) => {
  const details = await api('getEventDetails', { id: matchId });
  const gamesOfMatch = (details?.event?.match?.games ?? []).filter((g) => g.state === 'completed');
  for (const g of gamesOfMatch) {
    const window = await getJson(`${FEED}/${g.id}`);
    const meta = window?.gameMetadata;
    if (!meta) continue;
    for (const side of [meta.blueTeamMetadata, meta.redTeamMetadata]) {
      for (const p of side?.participantMetadata ?? []) {
        if (!p.esportsPlayerId || !p.championId) continue;
        const pool = (players[p.esportsPlayerId] ??= {});
        const champ = champId(p.championId);
        pool[champ] = (pool[champ] ?? 0) + 1;
      }
    }
    gamesRead++;
    if (gamesRead % 200 === 0) console.log(`  ${gamesRead} jogos lidos`);
  }
});

await fs.writeFile(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), games: gamesRead, teams, players }));
console.log(`\n${Object.keys(teams).length} times, ${Object.keys(players).length} jogadores e ${gamesRead} jogos em ${path.relative(ROOT, OUT_FILE)}`);
