import { resolveEvent } from '../game/events';
import type { GameState } from '../game/types';
import { Img } from './common';

interface Props {
  game: GameState;
  onChange: (state: GameState) => void;
}

export function EventCard({ game, onChange }: Props) {
  const ev = game.pendingEvent;
  if (!ev) return null;
  const players = ev.playerIds.map((id) => game.players[id]).filter(Boolean);

  return (
    <section className="panel event-card">
      <div className="event-head">
        <span className="event-badge">Decisão</span>
        <h3>{ev.title}</h3>
      </div>
      <div className="event-body">
        {players.map((p) => (
          <Img key={p.id} src={p.image} alt={p.nick} className="player-thumb big-thumb" />
        ))}
        <p>{ev.text}</p>
      </div>
      <div className="event-options">
        {ev.options.map((o, i) => (
          <button key={o.label} className="btn" onClick={() => onChange(resolveEvent(game, i))}>
            <strong>{o.label}</strong>
            <span className="muted small">{o.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
