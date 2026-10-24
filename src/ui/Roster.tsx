import { useContext } from 'react';
import { championIcon } from '../game/ddragon';
import { ATTR_LABEL, ROLE_LABEL, type Attributes, type GameState } from '../game/types';
import { overall, starters } from '../game/world';
import { FormBadge, Img, money, Rating } from './common';
import { LineupPanel } from './LineupPanel';
import { PlayerLink, PlayerName } from './PlayerModal';

export function Roster({ game, teamId, onChange }: { game: GameState; teamId: string; onChange: (s: GameState) => void }) {
  const openPlayer = useContext(PlayerLink);
  const lineup = new Set(starters(game, teamId).map((p) => p.id));
  const roster = game.teams[teamId].playerIds.map((id) => game.players[id]);
  const attrKeys = Object.keys(ATTR_LABEL) as (keyof Attributes)[];

  return (
    <>
      <h2>Elenco</h2>
      <LineupPanel game={game} onChange={onChange} onOpenPlayer={openPlayer} />
      <p className="muted">Química do elenco: <strong>{Math.round(game.teams[teamId].chemistry ?? 60)}/100</strong>. Cresce com o tempo juntos e cai com contratações e conflitos.</p>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Jogador</th>
              <th>Rota</th>
              <th>Idade</th>
              <th>OVR</th>
              <th>POT</th>
              {attrKeys.map((k) => (
                <th key={k}>{ATTR_LABEL[k]}</th>
              ))}
              <th>Forma</th>
              <th>Moral</th>
              <th>Salário</th>
              <th>Contrato</th>
              <th>Campeões</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => (
              <tr key={p.id} className={lineup.has(p.id) ? '' : 'bench'}>
                <td>
                  <Img src={p.image} alt={p.nick} className="player-thumb" />
                </td>
                <td>
                  <PlayerName id={p.id} nick={p.nick} />
                  <div className="muted small">
                    {p.firstName} {p.lastName} {lineup.has(p.id) ? '' : '· reserva'}
                  </div>
                </td>
                <td>{ROLE_LABEL[p.role]}</td>
                <td>{p.age}</td>
                <td>
                  <Rating value={overall(p)} />
                </td>
                <td className="muted">{p.potential}</td>
                {attrKeys.map((k) => (
                  <td key={k}>{p.attrs[k]}</td>
                ))}
                <td>
                  <FormBadge form={p.form ?? 0} /> {p.sick ? <span className="down small">doente</span> : null}
                </td>
                <td>
                  <div className="bar" title={`Moral ${p.morale}`}>
                    <div style={{ width: `${p.morale}%` }} />
                  </div>
                </td>
                <td>{money(p.salary)}</td>
                <td>{p.contractEnd}</td>
                <td>
                  <div className="champ-pool">
                    {p.champions.map((c) => (
                      <img key={c} src={championIcon(c)} alt={c} title={c} />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
