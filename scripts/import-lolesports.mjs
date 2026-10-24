// Importa ligas, times e elencos da API do lolesports.com e gera src/data/leagues.json.
//   npm run import           -> baixa da API (e salva cópia bruta em data-raw/)
//   npm run import:offline   -> usa os arquivos já baixados em data-raw/
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW_DIR = path.join(ROOT, 'data-raw');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'leagues.json');

const API = 'https://esports-api.lolesports.com/persisted/gw';
// Chave pública usada pelo próprio site lolesports.com.
const API_KEY = process.env.LOLESPORTS_API_KEY ?? '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';

const MAX_TEAMS = 10;
const MIN_TEAMS = 6;
const ROLES = ['top', 'jungle', 'mid', 'bottom', 'support'];

// Ligas principais e seu prestígio (1 = regional pequena, 5 = elite mundial).
// Toda liga principal tem uma Academy; as que não existem de verdade são geradas pelo jogo.
const LEAGUES = {
  lck: 5,
  lpl: 5,
  lec: 4,
  lcs: 3,
  lcp: 3,
  'cblol-brazil': 3,
  lfl: 2,
  primeleague: 2,
  'turkiye-sampiyonluk-ligi': 2,
  vcs: 2,
  lco: 1,
  north_regional_league: 1,
  south_regional_league: 1,
};

// Segunda divisão (tier 2) de cada liga.
//   slug: liga da API com elencos reais
//   name: nome oficial; sem slug, os times são gerados pelo jogo como academies
//   image: liga da API de onde pegar só o logo
const ACADEMIES = {
  'cblol-brazil': { slug: 'cd' },
  lck: { slug: 'lck_challengers_league' },
  lcs: { slug: 'nacl' },
  lcp: { slug: 'pcs' },
  lpl: { name: 'LDL' },
  lec: { name: 'EMEA Masters', image: 'emea_masters' },
  lfl: { name: 'LFL Division 2' },
};

const offline = process.argv.includes('--offline');

async function get(endpoint, params = {}) {
  const url = new URL(`${API}/${endpoint}`);
  url.search = new URLSearchParams({ hl: 'pt-BR', ...params }).toString();
  const res = await fetch(url, { headers: { 'x-api-key': API_KEY } });
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
  return (await res.json()).data;
}

async function readRaw(name) {
  return JSON.parse(await fs.readFile(path.join(RAW_DIR, name), 'utf8')).data;
}

async function saveRaw(name, data) {
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.writeFile(path.join(RAW_DIR, name), JSON.stringify({ data }));
}

// IDs dos times que disputaram o torneio mais recente já iniciado da liga.
async function currentTeamIds(leagueId) {
  const { leagues } = await get('getTournamentsForLeague', { leagueId });
  const today = new Date().toISOString().slice(0, 10);
  const latest = leagues[0].tournaments
    .filter((t) => t.startDate <= today)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (!latest) return null;
  const { standings } = await get('getStandings', { tournamentId: latest.id });
  const ids = new Set();
  for (const stage of standings[0]?.stages ?? []) {
    for (const section of stage.sections) {
      section.rankings?.forEach((r) => r.teams.forEach((t) => ids.add(t.id)));
      section.matches?.forEach((m) => m.teams.forEach((t) => t.id && ids.add(t.id)));
    }
  }
  return ids.size ? ids : null;
}

// Fotos de jogadores têm timestamp na URL; elencos com fotos recentes tendem a ser os atuais.
function recency(team) {
  const stamps = team.players
    .map((p) => Number(p.image?.match(/\/(\d{13})_/)?.[1] ?? 0))
    .sort((a, b) => b - a);
  return stamps[Math.floor(stamps.length / 2)] ?? 0;
}

function pickStarters(players) {
  const used = new Set();
  return ROLES.map((role) => {
    const p = players.find((x) => x.role === role && !used.has(x.id));
    if (!p) return null;
    used.add(p.id);
    return p;
  });
}

function toPlayer(p) {
  return {
    id: p.id,
    nick: p.summonerName.trim(),
    firstName: p.firstName,
    lastName: p.lastName,
    image: p.image,
    role: p.role,
  };
}

function toTeam(t) {
  return {
    id: t.id,
    name: t.name,
    code: t.code,
    image: t.image,
    players: t.players.filter((p) => ROLES.includes(p.role)).map(toPlayer),
  };
}

async function selectTeams(league, teams, minRoles) {
  let candidates = teams.filter((t) => t.homeLeague?.name === league.name && t.status === 'active');
  if (!offline) {
    const ids = await currentTeamIds(league.id).catch(() => null);
    if (ids) candidates = teams.filter((t) => ids.has(t.id));
  }
  return candidates
    .filter((t) => pickStarters(t.players).filter(Boolean).length >= minRoles)
    .sort((a, b) => recency(b) - recency(a))
    .slice(0, MAX_TEAMS);
}

async function main() {
  let leagues, teams;
  if (offline) {
    ({ leagues } = await readRaw('leagues.json'));
    ({ teams } = await readRaw('teams.json'));
  } else {
    ({ leagues } = await get('getLeagues'));
    ({ teams } = await get('getTeams'));
    await saveRaw('leagues.json', { leagues });
    await saveRaw('teams.json', { teams });
  }

  const out = [];
  const used = new Set();
  for (const league of leagues) {
    const prestige = LEAGUES[league.slug];
    if (!prestige) continue;

    const playable = await selectTeams(league, teams, 4);
    if (playable.length < MIN_TEAMS) {
      console.warn(`- ${league.name}: só ${playable.length} times, ignorada`);
      continue;
    }

    let academy = null;
    const config = ACADEMIES[league.slug];
    const academyLeague = config?.slug && leagues.find((l) => l.slug === config.slug);
    if (config?.name) {
      academy = {
        slug: `${league.slug}-academy`,
        name: config.name,
        image: leagues.find((l) => l.slug === config.image)?.image ?? league.image,
        teams: [],
      };
    } else if (academyLeague) {
      const academyTeams = await selectTeams(academyLeague, teams, 2);
      academy = {
        slug: academyLeague.slug,
        name: academyLeague.name,
        image: academyLeague.image,
        teams: academyTeams.map(toTeam),
      };
      console.log(`  ${academyLeague.name}: ${academyTeams.map((t) => t.code).join(', ')}`);
    }

    const entry = {
      slug: league.slug,
      name: league.name,
      region: league.region,
      image: league.image,
      prestige,
      teams: playable.map(toTeam),
      academy,
    };
    for (const t of [...entry.teams, ...(academy?.teams ?? [])]) {
      t.players.forEach((p) => used.add(p.id));
    }
    out.push(entry);
    console.log(`- ${league.name}: ${playable.map((t) => t.code).join(', ')}`);
  }

  // Todos os outros jogadores (de times atuais, antigos ou extintos) viram agentes livres.
  const freeAgents = new Map();
  for (const t of teams) {
    for (const p of t.players) {
      if (!ROLES.includes(p.role) || used.has(p.id)) continue;
      const region = t.homeLeague?.region ?? null;
      const prev = freeAgents.get(p.id);
      if (!prev || (!prev.region && region)) freeAgents.set(p.id, { ...toPlayer(p), region });
    }
  }

  out.sort((a, b) => b.prestige - a.prestige || a.name.localeCompare(b.name));
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(
    OUT_FILE,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      leagues: out,
      freeAgents: [...freeAgents.values()],
    }),
  );
  console.log(
    `\n${out.length} ligas e ${freeAgents.size} agentes livres salvos em ${path.relative(ROOT, OUT_FILE)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
