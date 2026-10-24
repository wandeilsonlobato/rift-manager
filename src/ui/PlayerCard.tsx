import { useContext } from 'react';
import { roleIcon } from '../game/ddragon';
import { ROLE_LABEL, type GameState, type Player } from '../game/types';
import { overall } from '../game/world';
import { FormBadge, Img } from './common';
import { PlayerLink } from './PlayerModal';

/** Nível da carta pelo OVR: muda a cor da moldura. */
export function cardTier(ovr: number): 'elite' | 'gold' | 'silver' | 'bronze' {
  if (ovr >= 80) return 'elite';
  if (ovr >= 72) return 'gold';
  if (ovr >= 62) return 'silver';
  return 'bronze';
}

const ATTRS: [keyof Player['attrs'], string][] = [
  ['mechanics', 'MEC'],
  ['laning', 'LAN'],
  ['teamfight', 'TF'],
  ['macro', 'MAC'],
  ['mental', 'MEN'],
];

interface Props {
  game: GameState;
  player: Player;
  /** versão menor, sem atributos (Início, cerimônia) */
  compact?: boolean;
  bench?: boolean;
}

/** Carta de jogador no estilo dos jogos de futebol: OVR, rota, foto, atributos e time. */
export function PlayerCard({ game, player, compact, bench }: Props) {
  const open = useContext(PlayerLink);
  const ovr = overall(player);
  const team = player.teamId ? game.teams[player.teamId] : null;

  return (
    <button
      className={`pcard tier-${cardTier(ovr)} ${compact ? 'compact' : ''} ${bench ? 'bench' : ''}`}
      onClick={() => open(player.id)}
      title={`${player.nick} · ${ROLE_LABEL[player.role]}`}
    >
      <div className="pcard-head">
        <div className="pcard-ovr">
          <strong>{ovr}</strong>
          <img src={roleIcon(player.role)} alt={ROLE_LABEL[player.role]} />
        </div>
        {team && <Img src={team.image} alt={team.code} className="pcard-team" />}
      </div>
      <div className="pcard-photo-wrap">
        <Img src={player.image} alt={player.nick} className="pcard-photo" />
      </div>
      <div className="pcard-name">{player.nick}</div>
      {!compact && (
        <div className="pcard-attrs">
          {ATTRS.map(([k, label]) => (
            <span key={k}>
              <em>{label}</em>
              {player.attrs[k]}
            </span>
          ))}
        </div>
      )}
      <div className="pcard-foot">
        <span>{player.age} anos</span>
        <FormBadge form={player.form ?? 0} />
        {player.sick ? <span className="down">doente</span> : bench ? <span className="muted">reserva</span> : null}
      </div>
    </button>
  );
}
