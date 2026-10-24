import { useState } from 'react';
import { championIcon, type Champion } from '../game/ddragon';
import { focusInfo, FOCUSES, INTENSITIES } from '../game/training';
import { ATTR_LABEL, type GameState, type GrowthEntry } from '../game/types';
import { trainedFocus, trainThisWeek } from '../game/week';

interface Props {
  game: GameState;
  champions: Champion[];
  onChange: (state: GameState) => void;
}

export function TrainingTab({ game, champions, onChange }: Props) {
  const { focus, intensity } = game.training;
  const [justTrained, setJustTrained] = useState(false);
  const trained = trainedFocus(game);
  const offseason = game.phase === 'offseason';
  const locked = !!trained || offseason;
  const set = (patch: Partial<GameState['training']>) =>
    onChange({ ...game, training: { ...game.training, ...patch } });

  const train = () => {
    onChange(trainThisWeek(game, champions));
    setJustTrained(true);
  };

  return (
    <>
      <h2>Treino da semana</h2>
      <p className="muted">
        Escolha o foco das scrims e a intensidade e aperte <strong>Treinar</strong>. É um treino por semana: ele libera
        de novo depois que a semana é jogada. O foco treinado também dá bônus nos jogos da semana.
      </p>

      {trained && game.trainingResult && (
        <section className={`panel training-result ${justTrained ? 'fresh' : ''}`}>
          <h3>✓ Treino concluído · {focusInfo(trained).label}</h3>
          <GrowthList game={game} growth={game.trainingResult.growth} />
          <p className="muted small">O próximo treino libera após os jogos desta semana.</p>
        </section>
      )}
      {offseason && (
        <section className="panel">
          <p className="muted">Sem treinos durante o mercado. Eles voltam na próxima temporada.</p>
        </section>
      )}

      <section className={`panel ${locked ? 'locked' : ''}`}>
        <h3>Foco das scrims</h3>
        <div className="choice-grid">
          {FOCUSES.map((f) => (
            <button
              key={f.id}
              disabled={locked}
              className={`choice-card ${focus === f.id ? 'selected' : ''}`}
              onClick={() => set({ focus: f.id })}
            >
              <strong>{f.label}</strong>
              <span className="muted small">{f.description}</span>
              {f.id === 'draft' ? (
                <span className="choice-attr">Aprende campeões</span>
              ) : f.id === 'rest' ? (
                <span className="choice-attr">+ Moral</span>
              ) : (
                f.attr && <span className="choice-attr">Evolui {ATTR_LABEL[f.attr]}</span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className={`panel ${locked ? 'locked' : ''}`}>
        <h3>Intensidade</h3>
        <div className="choice-grid three">
          {INTENSITIES.map((i) => (
            <button
              key={i.id}
              disabled={locked || focus === 'rest'}
              className={`choice-card ${intensity === i.id && focus !== 'rest' ? 'selected' : ''}`}
              onClick={() => set({ intensity: i.id })}
            >
              <strong>{i.label}</strong>
              <span className="muted small">{i.description}</span>
              <span className="choice-attr">
                Evolução ×{i.growth} · Moral {i.morale >= 0 ? '+' : ''}
                {i.morale}/semana
              </span>
            </button>
          ))}
        </div>
      </section>

      {!locked && (
        <div className="train-action">
          <button className="btn primary big" onClick={train}>
            Treinar: {focusInfo(focus).label} ▶
          </button>
        </div>
      )}
    </>
  );
}

export function GrowthList({ game, growth }: { game: GameState; growth: GrowthEntry[] }) {
  if (!growth.length) return <p className="muted small">Ninguém evoluiu desta vez.</p>;
  return (
    <ul className="growth">
      {growth.map((g, i) => {
        const p = game.players[g.playerId];
        if (!p) return null;
        return (
          <li key={i}>
            <strong>{p.nick}</strong>{' '}
            {g.attr === 'champion' ? (
              <>
                aprendeu <img className="inline-champ" src={championIcon(g.value!)} alt="" /> {g.value}
              </>
            ) : (
              <span className="up">
                +{g.value ?? 1} {ATTR_LABEL[g.attr]}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
