import { useEffect, useMemo, useState } from 'react';
import { championIcon } from '../game/ddragon';
import type { Game, GameState, MatchSnapshot, PlayerLine } from '../game/types';
import { Img } from './common';
import { EventIcon, StatIcon } from './icons';

interface Props {
  game: GameState;
  match: Game;
  onEnd: () => void;
}


/** Minutos de jogo por segundo real na velocidade 1x. */
const MINUTES_PER_SECOND = 1;
const TICK_MS = 100;
const START: MatchSnapshot = { kills: [0, 0], gold: [2500, 2500], towers: [0, 0], dragons: [0, 0], barons: [0, 0] };

const clock = (min: number) => {
  const m = Math.floor(min);
  const s = Math.floor((min - m) * 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const k = (n: number) => `${(n / 1000).toFixed(1)}k`;

export function LiveMatch({ game, match, onEnd }: Props) {
  const d = match.detail!;
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const over = t >= d.duration;

  useEffect(() => {
    if (!playing || over) return;
    const id = setInterval(() => {
      setT((x) => Math.min(d.duration, x + (speed * MINUTES_PER_SECOND * TICK_MS) / 1000));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, speed, over, d.duration]);

  const visible = d.events.filter((e) => e.time <= t);
  const last = visible[visible.length - 1];
  const snap = last?.snapshot ?? START;
  // Ouro sobe com a renda passiva entre um lance e outro.
  const passive = (t - (last?.time ?? 0)) * 1700;
  const gold: [number, number] = [snap.gold[0] + passive, snap.gold[1] + passive];
  const goldDiff = gold[0] - gold[1];

  // KDA ao vivo a partir dos abates já mostrados.
  const kda = useMemo(() => {
    const out = new Map<string, [number, number, number]>();
    const get = (id: string) => out.get(id) ?? out.set(id, [0, 0, 0]).get(id)!;
    for (const e of visible) {
      for (const [killer, victim, assists] of e.kills ?? []) {
        get(killer)[0]++;
        get(victim)[1]++;
        for (const a of assists) get(a)[2]++;
      }
    }
    return out;
  }, [visible.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const blue = game.teams[match.blue];
  const red = game.teams[match.red];
  const champOf = new Map([...d.blueLines, ...d.redLines].map((l) => [l.playerId, l.champion]));

  const column = (lines: PlayerLine[], side: 'blue' | 'red') => (
    <div className={`live-col ${side}`}>
      {lines.map((l) => {
        const [kk, dd, aa] = kda.get(l.playerId) ?? [0, 0, 0];
        const p = game.players[l.playerId];
        const justDied = last?.kills?.some(([, victim]) => victim === l.playerId) && t - last.time < 1.5;
        return (
          <div key={l.playerId} className={`live-player ${justDied ? 'dead' : ''}`}>
            <img src={championIcon(l.champion)} alt={l.champion} title={l.champion} />
            <div>
              <strong>{p.nick}</strong>
              <span className="muted small">{l.champion}</span>
            </div>
            <span className="live-kda">
              {kk}/{dd}/{aa}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="live">
      <div className="live-board">
        <div className="live-team blue">
          <Img src={blue.image} alt={blue.code} className="team-logo" />
          <strong>{blue.code}</strong>
        </div>
        <span className="live-kills blue-text">{snap.kills[0]}</span>
        <div className="live-clock">
          <strong>{clock(t)}</strong>
          <span className="muted small">{over ? 'FIM' : playing ? `AO VIVO · ${speed}x` : 'PAUSADO'}</span>
        </div>
        <span className="live-kills red-text">{snap.kills[1]}</span>
        <div className="live-team red">
          <strong>{red.code}</strong>
          <Img src={red.image} alt={red.code} className="team-logo" />
        </div>
      </div>

      <div className="live-stats">
        <span className="live-stat-group blue-text">
          <StatIcon kind="gold" /> {k(gold[0])}
          <StatIcon kind="tower" side="blue" /> {snap.towers[0]}
          <StatIcon kind="dragon" side="blue" /> {snap.dragons[0]}
          <StatIcon kind="baron" side="blue" /> {snap.barons[0]}
        </span>
        <div className="gold-bar" title={`Diferença de ouro: ${k(Math.abs(goldDiff))}`}>
          <div
            className={goldDiff >= 0 ? 'blue' : 'red'}
            style={{
              width: `${Math.min(50, (Math.abs(goldDiff) / 10000) * 50)}%`,
              [goldDiff >= 0 ? 'right' : 'left']: '50%',
            }}
          />
        </div>
        <span className="live-stat-group red red-text">
          {snap.barons[1]} <StatIcon kind="baron" side="red" />
          {snap.dragons[1]} <StatIcon kind="dragon" side="red" />
          {snap.towers[1]} <StatIcon kind="tower" side="red" />
          {k(gold[1])} <StatIcon kind="gold" />
        </span>
      </div>

      <div className="live-body">
        {column(d.blueLines, 'blue')}
        <div className="live-feed">
          {last ? (
            <div key={last.text} className={`live-highlight ${last.side}`}>
              <span className="live-icon">
                <EventIcon event={last} size={44} />
              </span>
              <div>
                <p>{last.text}</p>
                {last.kills?.length ? (
                  <div className="kill-icons">
                    {last.kills.slice(0, 5).map(([killer, victim], i) => (
                      <span key={i}>
                        <img src={championIcon(champOf.get(killer)!)} alt="" />
                        <em>➜</em>
                        <img src={championIcon(champOf.get(victim)!)} alt="" className="victim" />
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="live-highlight">
              <span className="live-icon">
                <img className="event-icon" src="https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/nexus.png" alt="" style={{ width: 44, height: 44 }} />
              </span>
              <p>Os times entram na Summoner&apos;s Rift…</p>
            </div>
          )}
          <ul className="timeline live-list">
            {[...visible].reverse().slice(1).map((e) => (
              <li key={e.text} className={`${e.side} with-icon`}>
                <EventIcon event={e} size={22} />
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </div>
        {column(d.redLines, 'red')}
      </div>

      <div className="live-controls">
        {over ? (
          <>
            <strong className={match.winner === game.coach.teamId ? 'up' : 'down'}>
              {game.teams[match.winner].name} vence!
            </strong>
            <button className="btn primary big" onClick={onEnd}>
              Continuar ▶
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => setPlaying(!playing)}>
              {playing ? '⏸ Pausar' : '▶ Continuar'}
            </button>
            {[1, 2, 4].map((s) => (
              <button key={s} className={`btn small ${speed === s ? 'primary' : ''}`} onClick={() => setSpeed(s)}>
                {s}x
              </button>
            ))}
            <button className="btn small" onClick={() => setT(d.duration)}>
              Pular para o fim ⏭
            </button>
          </>
        )}
      </div>
    </div>
  );
}
