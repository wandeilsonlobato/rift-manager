import { useState } from 'react';
import { PHASES, stageStandings } from '../game/season';
import type { Competition, GameState, Series, Stage } from '../game/types';
import { myCompetition } from '../game/week';
import { teamStrength } from '../game/world';
import { Img, Rating } from './common';
import { SeriesRow } from './MatchRow';
import { Icon } from './Icon';

interface Props {
  game: GameState;
  onOpenSeries: (s: Series) => void;
}

export function CompetitionsTab({ game, onOpenSeries }: Props) {
  const myTeam = game.coach.teamId!;
  const myLeague = game.leagues[game.teams[myTeam].leagueSlug];
  const regional = new Set([myLeague.slug, myLeague.parentSlug, myLeague.academySlug]);
  const featured = game.competitions.filter((c) => c.kind === 'international' || regional.has(c.leagueSlug));
  const others = game.competitions.filter((c) => !featured.includes(c));
  const defaultComp = myCompetition(game) ?? featured[featured.length - 1];
  const [compId, setCompId] = useState(defaultComp?.id);
  const comp = game.competitions.find((c) => c.id === compId) ?? defaultComp;

  return (
    <>
      <h2>Competições {game.season}</h2>
      <div className="comp-picker">
        {PHASES.filter((p) => featured.some((c) => c.phase === p.id)).map((p) => (
          <div key={p.id} className="comp-phase">
            <span className="muted small">{p.label}</span>
            {featured
              .filter((c) => c.phase === p.id)
              .map((c) => (
                <button
                  key={c.id}
                  className={`comp-chip ${c.id === comp?.id ? 'active' : ''}`}
                  onClick={() => setCompId(c.id)}
                >
                  {c.name}
                  {c.done && c.championId && <span className="muted small"> · <Icon name="trophy" size={14} /> {game.teams[c.championId].code}</span>}
                </button>
              ))}
          </div>
        ))}
        {others.length > 0 && (
          <select value={others.some((c) => c.id === comp?.id) ? comp!.id : ''} onChange={(e) => setCompId(e.target.value)}>
            <option value="">Outras ligas…</option>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {comp && <CompetitionView game={game} comp={comp} onOpenSeries={onOpenSeries} />}
    </>
  );
}

function CompetitionView({ game, comp, onOpenSeries }: { game: GameState; comp: Competition; onOpenSeries: (s: Series) => void }) {
  const myTeam = game.coach.teamId!;
  const stages = comp.stages.slice(0, comp.stageIndex + 1).reverse();
  return (
    <>
      <div className="comp-header">
        <Img src={comp.image} alt={comp.name} className="league-logo" />
        <div>
          <h2>{comp.name}</h2>
          <span className="muted small">
            {comp.done
              ? `Campeão: ${game.teams[comp.championId!].name}`
              : `Em andamento · ${comp.stages[comp.stageIndex].name}`}
          </span>
        </div>
      </div>
      {stages.map((st) => (
        <section key={st.name} className="panel">
          <h3>{st.name}</h3>
          {st.kind === 'rr1' || st.kind === 'rr2' || st.kind === 'swiss' ? (
            <StandingsTable game={game} stage={st} highlight={myTeam} swiss={st.kind === 'swiss'} />
          ) : null}
          <Rounds game={game} stage={st} onOpenSeries={onOpenSeries} />
        </section>
      ))}
    </>
  );
}

function StandingsTable({ game, stage, highlight, swiss }: { game: GameState; stage: Stage; highlight: string; swiss: boolean }) {
  const table = stageStandings(game, stage);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th></th>
            <th>Time</th>
            <th>V</th>
            <th>D</th>
            <th>Saldo</th>
            <th>Últimos</th>
            <th>Força</th>
          </tr>
        </thead>
        <tbody>
          {table.map((r, i) => {
            const t = game.teams[r.teamId];
            const diff = r.killsFor - r.killsAgainst;
            const status = swiss ? (r.wins >= 3 ? 'qualified' : r.losses >= 3 ? 'out' : '') : '';
            return (
              <tr key={r.teamId} className={`${r.teamId === highlight ? 'mine' : ''} ${status}`}>
                <td>{i + 1}</td>
                <td>
                  <Img src={t.image} alt={t.code} className="team-logo small" />
                </td>
                <td>
                  <strong>{t.name}</strong>
                </td>
                <td>{r.wins}</td>
                <td>{r.losses}</td>
                <td className={diff > 0 ? 'up' : diff < 0 ? 'down' : ''}>
                  {diff > 0 ? '+' : ''}
                  {diff}
                </td>
                <td>
                  <span className="streak">
                    {[...r.streak].map((c, j) => (
                      <span key={j} className={c === 'V' ? 'win' : 'loss'}>
                        {c}
                      </span>
                    ))}
                  </span>
                </td>
                <td>
                  <Rating value={teamStrength(game, r.teamId)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Rounds({ game, stage, onOpenSeries }: { game: GameState; stage: Stage; onOpenSeries: (s: Series) => void }) {
  const myTeam = game.coach.teamId!;
  const isLeague = stage.kind === 'rr1' || stage.kind === 'rr2';
  const [open, setOpen] = useState(!isLeague);
  if (!stage.rounds.length) return null;
  const rounds = stage.rounds.map((ids) => ids.map((id) => game.series[id]));
  const shown = isLeague && !open ? rounds.filter((r) => r.some((s) => s.a === myTeam || s.b === myTeam)) : rounds;

  return (
    <div className="rounds">
      {isLeague && (
        <button className="link small" onClick={() => setOpen(!open)}>
          {open ? 'Mostrar só os meus jogos' : 'Mostrar todas as rodadas'}
        </button>
      )}
      <div className={isLeague ? '' : 'bracket'}>
        {shown.map((round, i) => (
          <div key={i} className="round">
            {!isLeague && <span className="muted small">{[...new Set(round.map((s) => s.label))].join(' · ')}</span>}
            {round
              .filter((s) => open || !isLeague || s.a === myTeam || s.b === myTeam)
              .map((s) => (
                <SeriesRow
                  key={s.id}
                  game={game}
                  series={s}
                  teamId={myTeam}
                  onClick={s.gameIds.length ? () => onOpenSeries(s) : undefined}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
