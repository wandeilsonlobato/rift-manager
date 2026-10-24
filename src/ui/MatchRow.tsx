import type { GameState, Series } from '../game/types';
import { Img } from './common';

interface Props {
  game: GameState;
  series: Series;
  /** time do ponto de vista (destaca vitória/derrota) */
  teamId?: string;
  onClick?: () => void;
}

export function SeriesRow({ game, series, teamId, onClick }: Props) {
  const a = game.teams[series.a];
  const b = game.teams[series.b];
  const played = !!series.winner;
  const involved = teamId === series.a || teamId === series.b;
  const outcome = played && involved ? (series.winner === teamId ? 'win' : 'loss') : '';
  // MD1 mostra abates; séries mostram o placar de jogos.
  const score = series.bestOf === 1 ? series.kills : series.wins;

  return (
    <div
      className={`match-row ${outcome} ${involved ? 'mine' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
    >
      <span className="muted small match-when">
        {series.label} · MD{series.bestOf}
      </span>
      <span className={`match-team right ${series.winner === a.id ? 'winner' : ''}`}>
        {a.code}
        <Img src={a.image} alt={a.code} className="team-logo small" />
      </span>
      <span className="match-score">{played ? `${score[0]} × ${score[1]}` : 'vs'}</span>
      <span className={`match-team ${series.winner === b.id ? 'winner' : ''}`}>
        <Img src={b.image} alt={b.code} className="team-logo small" />
        {b.code}
      </span>
      {outcome && <span className={`result-tag ${outcome}`}>{outcome === 'win' ? 'V' : 'D'}</span>}
    </div>
  );
}
