import { COLLECTIVE_KEYS, collectiveOf } from '../game/collective';
import { COLLECTIVE_LABEL, type GameState } from '../game/types';

/** Atributos coletivos do time comparados com a média da liga. */
export function CollectivePanel({ game, teamId }: { game: GameState; teamId: string }) {
  const mine = collectiveOf(game, teamId);
  const league = game.leagues[game.teams[teamId].leagueSlug];
  const average = (key: (typeof COLLECTIVE_KEYS)[number]) =>
    league.teamIds.reduce((sum, id) => sum + collectiveOf(game, id)[key], 0) / league.teamIds.length;

  return (
    <section className="panel">
      <h3>Time</h3>
      <p className="muted small">
        Como os cinco jogam juntos. Sobe com os treinos coletivos, cai devagar sem treino e cai com contratações. A marca
        mostra a média da {league.name}.
      </p>
      {COLLECTIVE_KEYS.map((key) => {
        const value = mine[key];
        const avg = average(key);
        return (
          <div key={key} className="attr-row collective-row">
            <span>{COLLECTIVE_LABEL[key]}</span>
            <div className="attr-bar">
              <div style={{ width: `${value}%` }} className={value >= 75 ? 'elite' : value >= 60 ? 'good' : ''} />
              <i className="avg-mark" style={{ left: `${avg}%` }} title={`Média da liga: ${Math.round(avg)}`} />
            </div>
            <strong className={value >= avg ? 'up' : 'down'}>{Math.round(value)}</strong>
          </div>
        );
      })}
    </section>
  );
}
