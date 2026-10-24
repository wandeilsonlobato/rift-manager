import { nextSeriesFor, recentForm } from '../game/season';
import type { GameState } from '../game/types';
import { teamStrength } from '../game/world';
import { Img, Rating } from './common';

/** Card do próximo confronto: escudos frente a frente, como na tela de abertura de uma partida. */
export function NextMatchCard({ game }: { game: GameState }) {
  const myTeam = game.coach.teamId!;
  const next = nextSeriesFor(game, myTeam);
  if (!next) return null;
  const { series, weeksAway } = next;
  const comp = game.competitions.find((c) => c.id === series.compId)!;
  const opponentId = series.a === myTeam ? series.b : series.a;
  const sides = [myTeam, opponentId];

  return (
    <section className="next-match">
      <div className="nm-head">
        {comp.image && <Img src={comp.image} alt="" className="nm-comp" />}
        <span>
          {comp.name} · {series.label} · MD{series.bestOf}
        </span>
        <span className="nm-when">{weeksAway === 0 ? 'Esta semana' : weeksAway === 1 ? 'Próxima semana' : `Em ${weeksAway} semanas`}</span>
      </div>
      <div className="nm-body">
        {sides.map((id, i) => {
          const team = game.teams[id];
          return (
            <div key={id} className={`nm-team ${i === 0 ? 'mine' : 'rival'}`}>
              <Img src={team.image} alt={team.code} className="nm-logo" />
              <strong>{team.name}</strong>
              <span className="nm-strength">
                Força <Rating value={teamStrength(game, id)} />
              </span>
              <span className="streak">
                {recentForm(game, id).map((r, j) => (
                  <span key={j} className={r === 'V' ? 'win' : 'loss'}>
                    {r}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
        <div className="nm-vs">
          {series.wins[0] + series.wins[1] > 0 ? (
            <strong>
              {series.a === myTeam ? series.wins[0] : series.wins[1]} – {series.a === myTeam ? series.wins[1] : series.wins[0]}
            </strong>
          ) : (
            <strong>VS</strong>
          )}
        </div>
      </div>
    </section>
  );
}
