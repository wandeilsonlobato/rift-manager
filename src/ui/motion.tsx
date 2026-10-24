// Animações e efeitos de reação: números que contam, avisos em sequência e revelação de carta.
import { useEffect, useRef, useState } from 'react';
import logo from '../assets/logo-160.png';
import type { GameState, GrowthEntry, Player } from '../game/types';
import { ATTR_LABEL } from '../game/types';
import { overall } from '../game/world';
import { Icon } from './Icon';
import { cardTier, PlayerCard } from './PlayerCard';

/** Número que sobe (ou desce) contando até o valor novo. */
export function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const initial = from.current;
    const duration = 700;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(initial + (value - initial) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{format(shown)}</>;
}

const TIER_LABEL = { bronze: 'Bronze', silver: 'Prata', gold: 'Ouro', elite: 'Elite' };

export interface TierUp {
  player: Player;
  from: ReturnType<typeof cardTier>;
  to: ReturnType<typeof cardTier>;
}

/** Jogadores cuja carta mudou de nível entre dois momentos do jogo. */
export function tierUps(before: GameState, after: GameState, teamId: string): TierUp[] {
  return after.teams[teamId].playerIds
    .map((id) => ({ old: before.players[id], now: after.players[id] }))
    .filter(({ old, now }) => old && now && cardTier(overall(old)) !== cardTier(overall(now)))
    .map(({ old, now }) => ({ player: now, from: cardTier(overall(old)), to: cardTier(overall(now)) }));
}

/** Avisos de evolução que aparecem um a um depois do treino. */
export function GrowthToasts({ game, growth, ups, onDone }: { game: GameState; growth: GrowthEntry[]; ups: TierUp[]; onDone: () => void }) {
  const items = [
    ...growth.map((g) => ({ kind: 'growth' as const, g })),
    ...ups.map((u) => ({ kind: 'tier' as const, u })),
  ];
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible >= items.length) {
      const t = setTimeout(onDone, 2600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setVisible((v) => v + 1);
    }, visible === 0 ? 150 : 550);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <div className="growth-toasts">
      {items.slice(0, visible).map((item, i) =>
        item.kind === 'tier' ? (
          <div key={i} className={`gtoast tier tier-${item.u.to}`}>
            <Icon name="star" size={18} />
            <span>
              <strong>{item.u.player.nick}</strong> subiu de carta: {TIER_LABEL[item.u.from]} → {TIER_LABEL[item.u.to]}
            </span>
          </div>
        ) : (
          <div key={i} className="gtoast">
            <span className="gtoast-plus">+</span>
            <span>
              {item.g.attr === 'collective' ? (
                <>
                  <strong>Time</strong> {item.g.value}
                </>
              ) : item.g.attr === 'champion' ? (
                <>
                  <strong>{game.players[item.g.playerId]?.nick}</strong> aprendeu {item.g.value}
                </>
              ) : (
                <>
                  <strong>{game.players[item.g.playerId]?.nick}</strong> +{item.g.value ?? 1} {ATTR_LABEL[item.g.attr]}
                </>
              )}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

/** Contratação: a carta aparece de costas e vira mostrando o jogador, como abrir um pacote. */
export function SigningReveal({ game, player, onClose }: { game: GameState; player: Player; onClose: () => void }) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setFlipped(true);
    }, 700);
    return () => clearTimeout(t);
  }, [player]);

  return (
    <div className="splash-overlay" onClick={onClose}>
      <div className="reveal" onClick={(e) => e.stopPropagation()}>
        <span className="hero-sub">Nova contratação</span>
        <div className={`flip-card ${flipped ? 'flipped' : ''}`}>
          <div className="flip-face flip-back">
            <img src={logo} alt="" />
          </div>
          <div className="flip-face flip-front">
            <PlayerCard game={game} player={player} />
          </div>
        </div>
        {flipped && (
          <button className="btn primary" onClick={onClose}>
            Bem-vindo, {player.nick}!
          </button>
        )}
      </div>
    </div>
  );
}
