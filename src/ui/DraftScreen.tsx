import { useEffect, useMemo, useState } from 'react';
import { championIcon, championLoading, championsForRole, roleIcon, type Champion } from '../game/ddragon';
import {
  aiStep,
  DRAFT_SEQUENCE,
  draftComplete,
  draftScore,
  emptyDraft,
  unavailable,
  type DraftState,
  type Side,
} from '../game/draft';
import { createRng } from '../game/random';
import { TACTICS } from '../game/coach';
import { ROLE_LABEL, ROLES, type Game, type GameState, type Player, type Role, type Tactic } from '../game/types';
import { hasSoloq, soloqInfo, winrate } from '../game/soloq';
import { playDraftedGame } from '../game/week';
import { overall, starters } from '../game/world';
import { Img, Rating } from './common';
import { LiveMatch } from './LiveMatch';

interface Props {
  game: GameState;
  seriesId: string;
  champions: Champion[];
  onGamePlayed: (state: GameState) => void;
  onFinish: () => void;
}

const AI_DELAY = 650;

export function DraftScreen({ game, seriesId, champions, onGamePlayed, onFinish }: Props) {
  const series = game.series[seriesId];
  const myTeam = game.coach.teamId!;
  const gameNumber = series.wins[0] + series.wins[1] + 1;
  const blueId = gameNumber % 2 === 1 ? series.a : series.b;
  const teams: Record<Side, string> = { blue: blueId, red: blueId === series.a ? series.b : series.a };
  const mySide: Side = teams.blue === myTeam ? 'blue' : 'red';
  const enemySide: Side = mySide === 'blue' ? 'red' : 'blue';
  const fearless = series.fearless ?? [];
  const comp = game.competitions.find((c) => c.id === series.compId)!;

  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [selected, setSelected] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [filter, setFilter] = useState<Role | ''>('');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<Game | null>(null);
  const [live, setLive] = useState(false);
  const rng = useMemo(() => createRng(`${seriesId}-${gameNumber}-${Date.now()}`), [seriesId, gameNumber]);

  const done = draftComplete(draft);
  const step = DRAFT_SEQUENCE[draft.step];
  const myTurn = !done && step.side === mySide;
  const taken = unavailable(draft, fearless);
  const myPicks = draft.picks[mySide];
  const openRoles = ROLES.filter((r) => !myPicks[r]);
  const activeRole = role && !myPicks[role] ? role : openRoles[0];
  const champName = (id: string) => champions.find((c) => c.id === id)?.name ?? id;

  // Vez da IA: age depois de uma pequena pausa para dar ritmo ao draft.
  useEffect(() => {
    if (done || myTurn || result) return;
    const t = setTimeout(() => setDraft((d) => aiStep(game, d, teams, fearless, champions, rng)), AI_DELAY);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, myTurn, done, result]);

  const myPools = new Set(starters(game, teams[mySide]).flatMap((p) => p.champions));
  const enemyPools = new Set(starters(game, teams[enemySide]).flatMap((p) => p.champions));

  const grid = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = filter ? championsForRole(champions, filter) : champions;
    return [...pool].filter((c) => !q || c.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  }, [champions, filter, search]);

  const confirm = () => {
    if (!selected || !myTurn) return;
    const next = structuredClone(draft);
    if (step.type === 'ban') next.bans[mySide].push(selected);
    else next.picks[mySide][activeRole] = selected;
    next.step++;
    setDraft(next);
    setSelected(null);
    setRole(null);
  };

  const autoDraft = () => {
    let d = draft;
    while (!draftComplete(d)) d = aiStep(game, d, teams, fearless, champions, rng);
    setDraft(d);
  };

  const play = () => {
    const out = playDraftedGame(game, seriesId, draft, champions);
    setResult(out.game);
    setLive(!!out.game.detail?.rich);
    onGamePlayed(out.state);
  };

  const nextGame = () => {
    setDraft(emptyDraft());
    setResult(null);
    setLive(false);
    setSelected(null);
  };

  const scores = done
    ? {
        blue: draftScore(game, teams.blue, draft.picks.blue, champions),
        red: draftScore(game, teams.red, draft.picks.red, champions),
      }
    : null;

  const status = result
    ? 'Partida encerrada'
    : done
      ? 'Draft concluído'
      : myTurn
        ? step.type === 'ban'
          ? 'Sua vez de banir'
          : `Sua vez: escolha para ${ROLE_LABEL[activeRole]}`
        : `${game.teams[teams[step.side]].code} ${step.type === 'ban' ? 'banindo' : 'escolhendo'}…`;
  // Barra de progresso do draft na cor de quem está na vez.
  const progress = (draft.step / DRAFT_SEQUENCE.length) * 100;
  const scoreA = series.wins[blueId === series.a ? 0 : 1];
  const scoreB = series.wins[blueId === series.a ? 1 : 0];

  if (result && live) {
    return (
      <div className="draft-screen">
        <LiveMatch game={game} match={result} onEnd={() => setLive(false)} />
      </div>
    );
  }

  const banner = (side: Side) => {
    const team = game.teams[teams[side]];
    return (
      <div className={`bc-banner ${side} ${step?.side === side && !done ? 'turn' : ''}`}>
        <div className="bc-banner-head">
          <span className="bc-team-name">{team.name}</span>
          {teams[side] === myTeam && <span className="bc-coach">COACH: {game.coach.name}</span>}
        </div>
        <div className="bc-bans">
          {Array.from({ length: 5 }, (_, i) => draft.bans[side][i]).map((c, i) => {
            const banning = !done && step.type === 'ban' && step.side === side && draft.bans[side].length === i;
            return (
              <span key={i} className={`bc-ban ${banning ? 'active' : ''}`}>
                {c ? (
                  <img src={championIcon(c)} alt={c} title={champName(c)} />
                ) : banning && side === mySide && selected ? (
                  <img src={championIcon(selected)} alt="" className="preview" />
                ) : null}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  const cards = (side: Side) =>
    starters(game, teams[side]).map((p) => {
      const active = !done && step.type === 'pick' && step.side === side && side === mySide && p.role === activeRole;
      return (
        <PickCard
          key={p.id}
          player={p}
          side={side}
          champion={draft.picks[side][p.role]}
          preview={active ? selected : null}
          active={active}
          enemyTurn={!done && step.type === 'pick' && step.side === side && side !== mySide && !draft.picks[side][p.role]}
          taken={taken}
          champName={champName}
          onClick={side === mySide && !draft.picks[side][p.role] ? () => setRole(p.role) : undefined}
        />
      );
    });

  return (
    <div className="draft-screen broadcast">
      <div className="bc-top">
        {banner('blue')}
        <div className="bc-info">
          <span className="muted small">
            {comp.name} · {series.label}
          </span>
          <strong>
            Jogo {gameNumber} · MD{series.bestOf}
          </strong>
          <span className={`bc-status ${step?.side ?? ''}`}>{status}</span>
        </div>
        {banner('red')}
      </div>
      <div className={`bc-timer ${done ? 'done' : step.side}`}>
        <div style={{ width: `${progress}%` }} />
      </div>

      <div className="bc-picks">
        <div className="bc-side blue">{cards('blue')}</div>
        <div className="bc-center">
          <div className="bc-sides">
            <span>BLUE SIDE</span>
            <span className="bc-arrow">{done ? '•' : step.side === 'blue' ? '◀' : '▶'}</span>
            <span>2ND PICK</span>
          </div>
          <div className="bc-logos">
            <Img src={game.teams[teams.blue].image} alt="" className="bc-logo" />
            {comp.image && <Img src={comp.image} alt="" className="bc-comp" />}
            <Img src={game.teams[teams.red].image} alt="" className="bc-logo" />
          </div>
          <div className="bc-codes">
            <strong>{game.teams[teams.blue].code}</strong>
            <span className="bc-series">
              {scoreA} - {scoreB}
            </span>
            <strong>{game.teams[teams.red].code}</strong>
          </div>
          {game.meta && <span className="bc-patch">PATCH {game.meta.name}</span>}
        </div>
        <div className="bc-side red">{cards('red')}</div>
      </div>

      {fearless.length > 0 && (
        <div className="fearless">
          <span className="muted small">Fearless (já usados na série):</span>
          {fearless.map((c) => (
            <img key={c} src={championIcon(c)} alt={c} title={champName(c)} />
          ))}
        </div>
      )}

      <div className="bc-bottom">
        {result ? (
          <GameResult game={game} match={result} seriesId={seriesId} onNext={nextGame} onFinish={onFinish} />
        ) : done && scores ? (
          <div className="draft-summary">
            <h3>Análise do draft</h3>
            <div className="score-cols">
              {(['blue', 'red'] as Side[]).map((side) => (
                <div key={side} className={`score-col ${side}`}>
                  <strong>{game.teams[teams[side]].code}</strong>
                  <span>Conforto {fmt(scores[side].comfort)}</span>
                  <span>Composição {fmt(scores[side].composition)}</span>
                  <strong>Total {fmt(scores[side].total)}</strong>
                  {scores[side].notes.map((n) => (
                    <span key={n} className="muted small">
                      ⚠ {n}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <label className="inline">
              Tática para a partida
              <select value={game.tactic ?? 'balanced'} onChange={(e) => onGamePlayed({ ...game, tactic: e.target.value as Tactic })}>
                {(Object.keys(TACTICS) as Tactic[]).map((t) => (
                  <option key={t} value={t}>
                    {TACTICS[t].label}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn primary big" onClick={play}>
              Jogar partida ▶
            </button>
          </div>
        ) : (
          <>
            <div className="bc-controls">
              <input placeholder="Buscar campeão…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="role-filter">
                <button className={filter === '' ? 'active' : ''} onClick={() => setFilter('')}>
                  Todos
                </button>
                {ROLES.map((r) => (
                  <button key={r} className={filter === r ? 'active' : ''} onClick={() => setFilter(r)} title={ROLE_LABEL[r]}>
                    <img src={roleIcon(r)} alt={ROLE_LABEL[r]} />
                  </button>
                ))}
              </div>
              <button className="btn primary bc-lock" disabled={!selected || !myTurn} onClick={confirm}>
                {step?.type === 'ban' ? 'Banir' : 'Travar'} {selected ? champName(selected) : ''}
              </button>
              <button className="btn small" onClick={autoDraft}>
                Draft automático ⏭
              </button>
            </div>
            <div className="legend muted small">
              <span className="dot mine" /> pool do seu time <span className="dot enemy" /> pool do adversário{' '}
              <span className="up">▲</span> forte no patch <span className="down">▼</span> fraco no patch
              {hasSoloq() && (
                <span className="soloq-tag">
                  % = vitórias na SoloQ ({soloqInfo().matches} partidas Challenger {soloqInfo().platform}, patch {soloqInfo().patch})
                </span>
              )}
            </div>
            <div className="champ-grid">
              {grid.map((c) => {
                const off = taken.has(c.id);
                return (
                  <button
                    key={c.id}
                    className={`champ ${selected === c.id ? 'selected' : ''}`}
                    disabled={off || !myTurn}
                    onClick={() => setSelected(c.id)}
                    onDoubleClick={() => selected === c.id && confirm()}
                    title={wrLabel(c.id, filter || undefined, c.name)}
                  >
                    <img src={championIcon(c.id)} alt={c.name} loading="lazy" />
                    {myPools.has(c.id) && <span className="dot mine" />}
                    {enemyPools.has(c.id) && <span className="dot enemy" />}
                    {game.meta?.buffed.includes(c.id) && <span className="meta-tag up">▲</span>}
                    {game.meta?.nerfed.includes(c.id) && <span className="meta-tag down">▼</span>}
                    {hasSoloq() && winrate(c.id, filter || undefined) !== null && (
                      <span className={`champ-wr ${winrate(c.id, filter || undefined)! >= 0.5 ? 'up' : 'down'}`}>
                        {pct(winrate(c.id, filter || undefined)!)}
                      </span>
                    )}
                    <span className="champ-name">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;
const pct = (wr: number) => `${(wr * 100).toFixed(1)}%`;

function wrLabel(id: string, role: Role | undefined, name: string): string {
  const wr = winrate(id, role);
  return wr === null ? name : `${name} · ${pct(wr)} de vitórias na SoloQ`;
}

interface CardProps {
  player: Player;
  side: Side;
  champion?: string;
  preview: string | null;
  active: boolean;
  enemyTurn: boolean;
  taken: Set<string>;
  champName: (id: string) => string;
  onClick?: () => void;
}

/** Card vertical do jogador, no estilo das transmissões: arte do campeão, nick e rota. */
function PickCard({ player, side, champion, preview, active, enemyTurn, taken, champName, onClick }: CardProps) {
  const art = champion ?? preview;
  return (
    <div
      className={`pick-card ${side} ${active ? 'active' : ''} ${enemyTurn ? 'waiting' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
    >
      {art && <img className={`pick-art ${champion ? '' : 'preview'}`} src={championLoading(art)} alt={art} />}
      <div className="pick-shade" />
      <div className="pick-top">
        <Rating value={overall(player)} />
        {champion && (
          <span className={`pick-comfort ${player.champions.includes(champion) ? 'up' : 'down'}`}>
            {player.champions.includes(champion) ? '✓' : '✗'}
          </span>
        )}
      </div>
      {!champion && (
        <div className="pick-pool">
          {player.champions.map((c) => (
            <img key={c} src={championIcon(c)} alt={c} title={champName(c)} className={taken.has(c) ? 'gone' : ''} />
          ))}
        </div>
      )}
      <div className="pick-foot">
        <img className="pick-role" src={roleIcon(player.role)} alt={ROLE_LABEL[player.role]} />
        <span className="pick-name">{player.nick}</span>
      </div>
      {champion && (
        <span className="pick-champ-name">
          {champName(champion)}
          {winrate(champion, player.role) !== null && <em> · {pct(winrate(champion, player.role)!)}</em>}
        </span>
      )}
    </div>
  );
}

interface ResultProps {
  game: GameState;
  match: Game;
  seriesId: string;
  onNext: () => void;
  onFinish: () => void;
}

function GameResult({ game, match, seriesId, onNext, onFinish }: ResultProps) {
  const series = game.series[seriesId];
  const myTeam = game.coach.teamId!;
  const won = match.winner === myTeam;
  const d = match.detail;
  const mvp = d && game.players[d.mvp];
  return (
    <div className="draft-summary">
      <h2 className={won ? 'up' : 'down'}>{won ? 'VITÓRIA!' : 'DERROTA'}</h2>
      <p>
        {game.teams[match.blue].code} {match.kills[0]} × {match.kills[1]} {game.teams[match.red].code}
        {d && ` · ${Math.floor(d.duration)} min`}
      </p>
      {mvp && <p className="muted">MVP: {mvp.nick}</p>}
      {d && (
        <ul className="timeline compact">
          {d.events.map((e, i) => (
            <li key={i} className={e.side}>
              {e.text}
            </li>
          ))}
        </ul>
      )}
      <p>
        Série: {game.teams[series.a].code} {series.wins[0]} × {series.wins[1]} {game.teams[series.b].code}
      </p>
      {series.winner ? (
        <button className="btn primary big" onClick={onFinish}>
          {series.winner === myTeam ? 'Série vencida! Continuar' : 'Continuar'}
        </button>
      ) : (
        <button className="btn primary big" onClick={onNext}>
          Próximo jogo ▶
        </button>
      )}
    </div>
  );
}
