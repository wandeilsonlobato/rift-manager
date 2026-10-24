import { tacticMetaBonus, TACTICS } from '../game/coach';
import { ROLE_LABEL, ROLES, type GameState, type Role, type Tactic } from '../game/types';
import { overall, starters } from '../game/world';
import { FormBadge, Img, Rating } from './common';

interface Props {
  game: GameState;
  onChange: (state: GameState) => void;
  onOpenPlayer: (id: string) => void;
}

export function LineupPanel({ game, onChange, onOpenPlayer }: Props) {
  const teamId = game.coach.teamId!;
  const team = game.teams[teamId];
  const lineup = starters(game, teamId);
  const roster = team.playerIds.map((id) => game.players[id]);
  const manual = !!team.lineup && Object.keys(team.lineup).length > 0;
  const tactic = game.tactic ?? 'balanced';

  const setTeam = (patch: Partial<typeof team>) =>
    onChange({ ...game, teams: { ...game.teams, [teamId]: { ...team, ...patch } } });
  const choose = (role: Role, id: string) => setTeam({ lineup: { ...team.lineup, [role]: id } });

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h3>Escalação</h3>
          <button className="btn small" disabled={!manual} onClick={() => setTeam({ lineup: undefined })}>
            Escalação automática (maior OVR)
          </button>
        </div>
        <p className="muted small">
          {manual ? 'Escalação definida por você.' : 'Automática: joga quem tem o maior OVR em cada rota.'} Considere
          forma, moral e doença na hora de escolher.
        </p>
        <div className="lineup-grid">
          {ROLES.map((role) => {
            const starter = lineup.find((p) => p.role === role);
            const options = roster.filter((p) => p.role === role);
            return (
              <div key={role} className="lineup-slot">
                <span className="role-tag">{ROLE_LABEL[role]}</span>
                {starter && (
                  <button className="lineup-player" onClick={() => onOpenPlayer(starter.id)}>
                    <Img src={starter.image} alt={starter.nick} className="player-thumb big-thumb" />
                    <strong>{starter.nick}</strong>
                    <span>
                      <Rating value={overall(starter)} /> <FormBadge form={starter.form ?? 0} />
                    </span>
                    <span className="muted small">
                      moral {starter.morale}
                      {starter.sick ? ' · doente' : ''}
                    </span>
                  </button>
                )}
                {options.length > 1 ? (
                  <select value={starter?.id} onChange={(e) => choose(role, e.target.value)}>
                    {options.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nick} · OVR {overall(p)} · forma {(p.form ?? 0) >= 0 ? '+' : ''}
                        {p.form ?? 0}
                        {p.sick ? ' · doente' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="muted small">sem reserva na rota</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h3>Tática de jogo</h3>
        <p className="muted small">
          Vale para todas as partidas do time. Combinar a tática com o estilo do patch atual dá um bônus extra.
        </p>
        <div className="choice-grid">
          {(Object.keys(TACTICS) as Tactic[]).map((t) => {
            const info = TACTICS[t];
            const meta = tacticMetaBonus(game, t);
            return (
              <button
                key={t}
                className={`choice-card ${tactic === t ? 'selected' : ''}`}
                onClick={() => onChange({ ...game, tactic: t })}
              >
                <strong>{info.label}</strong>
                <span className="muted small">{info.description}</span>
                <span className="choice-attr">
                  {phase('Early', info.early)} · {phase('Mid', info.mid)} · {phase('Late', info.late)}
                </span>
                {meta > 0 && <span className="up small">Combina com o patch atual</span>}
                {meta < 0 && <span className="down small">Vai contra o patch atual</span>}
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function phase(label: string, value: number): string {
  return `${label} ${value > 0 ? '+' : ''}${value}`;
}
