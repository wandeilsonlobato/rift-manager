import { createContext, useContext } from 'react';
import { championIcon, roleIcon } from '../game/ddragon';
import { kda, totalStats } from '../game/stats';
import { ATTR_LABEL, ROLE_LABEL, type Attributes, type GameState } from '../game/types';
import { overall } from '../game/world';
import { FormBadge, Img, money, Rating } from './common';

/** Abre o perfil de um jogador a partir de qualquer tela. */
export const PlayerLink = createContext<(id: string) => void>(() => {});

export function PlayerName({ id, nick }: { id: string; nick: string }) {
  const open = useContext(PlayerLink);
  return (
    <button className="player-link" onClick={() => open(id)}>
      {nick}
    </button>
  );
}

interface Props {
  game: GameState;
  playerId: string;
  onClose: () => void;
}

export function PlayerModal({ game, playerId, onClose }: Props) {
  const p = game.players[playerId];
  if (!p) return null;
  const team = p.teamId ? game.teams[p.teamId] : null;
  const seasons = Object.entries(game.playerStats?.[playerId] ?? {}).sort(([a], [b]) => Number(b) - Number(a));
  const total = totalStats(game, playerId);
  const topChamps = Object.entries(total.champions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const history = [...(p.history ?? []), { season: game.season, ovr: overall(p), team: team?.code ?? 'Livre' }];
  const maxOvr = Math.max(...history.map((h) => h.ovr), 60);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal player-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <div className="pm-head">
          <Img src={p.image} alt={p.nick} className="player-photo pm-photo" />
          <div className="pm-info">
            <h2>
              <img src={roleIcon(p.role)} alt="" className="pm-role" /> {p.nick}
            </h2>
            <span className="muted">
              {p.firstName} {p.lastName} · {p.age} anos · {ROLE_LABEL[p.role]}
            </span>
            <div className="pm-team">
              {team ? (
                <>
                  <Img src={team.image} alt={team.code} className="team-logo small" /> {team.name}
                  <span className="muted small">
                    · {money(p.salary)}/mês até {p.contractEnd}
                  </span>
                </>
              ) : (
                <span className="muted">Agente livre{p.region ? ` · ${p.region}` : ''}</span>
              )}
            </div>
            <div className="pm-badges">
              <span>
                OVR <Rating value={overall(p)} />
              </span>
              <span className="muted">POT {p.potential}</span>
              <span>
                Forma <FormBadge form={p.form ?? 0} />
              </span>
              <span className="muted">Moral {p.morale}</span>
              {p.sick ? <span className="down">Doente</span> : null}
            </div>
          </div>
        </div>

        <div className="pm-grid">
          <section>
            <h3>Atributos</h3>
            {(Object.keys(ATTR_LABEL) as (keyof Attributes)[]).map((k) => (
              <div key={k} className="attr-row">
                <span>{ATTR_LABEL[k]}</span>
                <div className="attr-bar">
                  <div style={{ width: `${p.attrs[k]}%` }} className={p.attrs[k] >= 80 ? 'elite' : p.attrs[k] >= 65 ? 'good' : ''} />
                </div>
                <strong>{p.attrs[k]}</strong>
              </div>
            ))}
          </section>
          <section>
            <h3>Evolução</h3>
            <div className="ovr-chart">
              {history.map((h) => (
                <div key={h.season} className="ovr-col" title={`${h.season} · ${h.team} · OVR ${h.ovr}`}>
                  <span className="small">{h.ovr}</span>
                  <div style={{ height: `${(h.ovr / maxOvr) * 100}%` }} />
                  <span className="muted small">{String(h.season).slice(2)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section>
          <h3>Estatísticas</h3>
          {seasons.length ? (
            <table>
              <thead>
                <tr>
                  <th>Temporada</th>
                  <th>Jogos</th>
                  <th>Vitórias</th>
                  <th>K/D/A</th>
                  <th>KDA</th>
                  <th>MVPs</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map(([season, s]) => (
                  <tr key={season}>
                    <td>{season}</td>
                    <td>{s.games}</td>
                    <td>{Math.round((s.wins / Math.max(1, s.games)) * 100)}%</td>
                    <td>
                      {s.kills}/{s.deaths}/{s.assists}
                    </td>
                    <td>{kda(s)}</td>
                    <td>{s.mvps}</td>
                  </tr>
                ))}
                {seasons.length > 1 && (
                  <tr className="total-row">
                    <td>Carreira</td>
                    <td>{total.games}</td>
                    <td>{Math.round((total.wins / Math.max(1, total.games)) * 100)}%</td>
                    <td>
                      {total.kills}/{total.deaths}/{total.assists}
                    </td>
                    <td>{kda(total)}</td>
                    <td>{total.mvps}</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <p className="muted small">Sem partidas registradas (só contam jogos da sua região e internacionais).</p>
          )}
        </section>

        <div className="pm-grid">
          <section>
            <h3>Campeões</h3>
            {topChamps.length > 0 && (
              <div className="pm-champs">
                {topChamps.map(([c, n]) => (
                  <span key={c} title={`${c}: ${n} jogos`}>
                    <img src={championIcon(c)} alt={c} />
                    <em>{n}</em>
                  </span>
                ))}
              </div>
            )}
            <span className="muted small">Pool:</span>
            <div className="champ-pool">
              {p.champions.map((c) => (
                <img key={c} src={championIcon(c)} alt={c} title={c} />
              ))}
            </div>
          </section>
          <section>
            <h3>Títulos</h3>
            {p.titles?.length ? (
              <ul className="news">
                {[...p.titles].reverse().map((t, i) => (
                  <li key={i}>
                    🏆 {t.comp} ({t.season})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Nenhum título como titular ainda.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
