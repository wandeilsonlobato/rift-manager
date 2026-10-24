import { useState } from 'react';
import { championIcon } from '../game/ddragon';
import { ROLE_LABEL, type Game, type GameState, type PlayerLine, type Series } from '../game/types';
import { Img } from './common';
import { LiveMatch } from './LiveMatch';

interface Props {
  game: GameState;
  series: Series;
  onClose: () => void;
}

const k = (n: number) => `${(n / 1000).toFixed(1)}k`;

export function SeriesModal({ game, series, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [watching, setWatching] = useState(false);
  const a = game.teams[series.a];
  const b = game.teams[series.b];
  const comp = game.competitions.find((c) => c.id === series.compId);
  const games = series.gameIds.map((id) => game.games[id]).filter(Boolean);
  const current = games[index];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <p className="muted small center">
          {comp?.name} · {series.label} · MD{series.bestOf}
        </p>
        <div className="scoreboard">
          <div className={`sb-team ${series.winner === a.id ? 'winner' : ''}`}>
            <Img src={a.image} alt={a.code} className="team-logo big" />
            <strong>{a.name}</strong>
          </div>
          <div className="sb-center">
            <span className="sb-score">
              {series.wins[0]} <span className="muted">×</span> {series.wins[1]}
            </span>
          </div>
          <div className={`sb-team ${series.winner === b.id ? 'winner' : ''}`}>
            <Img src={b.image} alt={b.code} className="team-logo big" />
            <strong>{b.name}</strong>
          </div>
        </div>

        {games.length > 1 && (
          <div className="tabs">
            {games.map((g, i) => (
              <button key={g.id} className={`tab ${i === index ? 'active' : ''}`} onClick={() => setIndex(i)}>
                Jogo {i + 1} · {game.teams[g.winner].code}
              </button>
            ))}
          </div>
        )}
        {current?.detail?.rich && (
          <button className="btn small primary" onClick={() => setWatching(true)}>
            ▶ Assistir lance a lance
          </button>
        )}
        {watching && current && (
          <div className="draft-screen">
            <LiveMatch game={game} match={current} onEnd={() => setWatching(false)} />
          </div>
        )}
        {current?.detail ? (
          <GameDetail game={game} match={current} />
        ) : (
          <p className="muted">Detalhes não disponíveis para esta partida.</p>
        )}
      </div>
    </div>
  );
}

function GameDetail({ game, match }: { game: GameState; match: Game }) {
  const d = match.detail!;
  const blue = game.teams[match.blue];
  const red = game.teams[match.red];
  const minutes = Math.floor(d.duration);
  const seconds = Math.round((d.duration - minutes) * 60);

  const stats: [string, number | string, number | string][] = [
    ['Abates', match.kills[0], match.kills[1]],
    ['Ouro', k(d.gold[0]), k(d.gold[1])],
    ['Torres', d.towers[0], d.towers[1]],
    ['Dragões', d.dragons[0], d.dragons[1]],
    ['Barões', d.barons[0], d.barons[1]],
  ];

  const lines = (rows: PlayerLine[]) =>
    rows.map((l) => {
      const p = game.players[l.playerId];
      return (
        <tr key={l.playerId} className={l.playerId === d.mvp ? 'mvp' : ''}>
          <td>
            <img className="champ-icon" src={championIcon(l.champion)} alt={l.champion} title={l.champion} />
          </td>
          <td>
            <strong>{p.nick}</strong>
            {l.playerId === d.mvp && <span className="mvp-tag">MVP</span>}
            <div className="muted small">{ROLE_LABEL[p.role]}</div>
          </td>
          <td className="kda">
            {l.kills}/{l.deaths}/{l.assists}
          </td>
        </tr>
      );
    });

  return (
    <>
      <div className="sb-stats">
        <div className="sb-stat">
          <span className="blue-text">
            {blue.code} {match.winner === blue.id && '🏆'}
          </span>
          <span className="muted small">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          <span className="red-text">
            {match.winner === red.id && '🏆'} {red.code}
          </span>
        </div>
        {stats.map(([label, bv, rv]) => (
          <div key={label} className="sb-stat">
            <span className="blue-text">{bv}</span>
            <span className="muted small">{label}</span>
            <span className="red-text">{rv}</span>
          </div>
        ))}
      </div>

      <div className="sb-lines">
        <table>
          <tbody>{lines(d.blueLines)}</tbody>
        </table>
        <table>
          <tbody>{lines(d.redLines)}</tbody>
        </table>
      </div>

      <h3>Linha do tempo</h3>
      <ul className="timeline">
        {d.events.map((e, i) => (
          <li key={i} className={e.side}>
            {e.text}
          </li>
        ))}
      </ul>
    </>
  );
}
