import type { Competition, GameState, Series } from '../game/types';
import { starters } from '../game/world';
import { Img } from './common';
import { Icon } from './Icon';
import { PlayerCard } from './PlayerCard';

/** Tela de VITÓRIA / DERROTA no estilo do cliente do LoL, depois das séries da semana. */
export function ResultSplash({ game, series, onClose }: { game: GameState; series: Series[]; onClose: () => void }) {
  const myTeam = game.coach.teamId!;
  const wins = series.filter((s) => s.winner === myTeam).length;
  const won = wins >= series.length - wins;
  const last = series[series.length - 1];
  const lastGame = last?.gameIds.length ? game.games[last.gameIds[last.gameIds.length - 1]] : null;
  const mvp = lastGame?.detail && lastGame.winner === myTeam ? game.players[lastGame.detail.mvp] : null;

  return (
    <div className="splash-overlay" onClick={onClose}>
      <div className={`result-splash ${won ? 'victory' : 'defeat'}`} onClick={(e) => e.stopPropagation()}>
        <h1 className="splash-title">{won ? 'Vitória' : 'Derrota'}</h1>
        <div className="splash-series">
          {series.map((s) => {
            const rival = game.teams[s.a === myTeam ? s.b : s.a];
            const [mine, theirs] = s.a === myTeam ? (s.bestOf > 1 ? s.wins : s.kills) : s.bestOf > 1 ? [s.wins[1], s.wins[0]] : [s.kills[1], s.kills[0]];
            return (
              <div key={s.id} className={`splash-row ${s.winner === myTeam ? 'win' : 'loss'}`}>
                <Img src={game.teams[myTeam].image} alt="" className="team-logo" />
                <strong>
                  {mine} – {theirs}
                </strong>
                <Img src={rival.image} alt="" className="team-logo" />
                <span className="muted small">
                  {rival.name} · {s.label}
                </span>
              </div>
            );
          })}
        </div>
        {mvp && (
          <div className="splash-mvp">
            <span className="hero-sub">MVP</span>
            <PlayerCard game={game} player={mvp} compact />
          </div>
        )}
        <button className="btn primary big" onClick={onClose}>
          Continuar <Icon name="next" />
        </button>
      </div>
    </div>
  );
}

/** Cerimônia de título: troféu, confete e o elenco campeão. */
export function ChampionCeremony({ game, comp, onClose }: { game: GameState; comp: Competition; onClose: () => void }) {
  const team = game.teams[comp.championId!];
  const confetti = Array.from({ length: 48 }, (_, i) => i);
  return (
    <div className="splash-overlay ceremony" onClick={onClose}>
      <div className="confetti">
        {confetti.map((i) => (
          <i
            key={i}
            style={{
              left: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 12) * 0.25}s`,
              animationDuration: `${3 + (i % 5) * 0.6}s`,
              background: ['#c8aa6e', '#f0e6d2', '#0ac8b9', '#7b4dff'][i % 4],
            }}
          />
        ))}
      </div>
      <div className="ceremony-box" onClick={(e) => e.stopPropagation()}>
        <div className="ceremony-trophy">
          <Icon name="trophy" size={72} />
        </div>
        <span className="hero-sub">{comp.name}</span>
        <h1 className="splash-title">Campeão</h1>
        <div className="ceremony-team">
          <Img src={team.image} alt={team.code} className="nm-logo" />
          <strong>{team.name}</strong>
        </div>
        <div className="ceremony-cards">
          {starters(game, team.id).map((p) => (
            <PlayerCard key={p.id} game={game} player={p} compact />
          ))}
        </div>
        <button className="btn primary big" onClick={onClose}>
          Comemorar <Icon name="next" />
        </button>
      </div>
    </div>
  );
}

interface Skipped {
  compName: string;
  championId: string;
}

/** Torneio internacional sem o time do coach: mostra só o campeão e segue para o próximo split. */
export function InternationalSummary({
  game,
  items,
  nextLabel,
  onClose,
}: {
  game: GameState;
  items: Skipped[];
  nextLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="splash-overlay" onClick={onClose}>
      <div className="result-splash intl-summary" onClick={(e) => e.stopPropagation()}>
        <span className="hero-sub">Seu time não se classificou</span>
        {items.map((item) => {
          const champ = game.teams[item.championId];
          return (
            <div key={item.compName} className="intl-champion">
              <span className="muted">{item.compName}</span>
              <div className="ceremony-trophy">
                <Icon name="trophy" size={48} />
              </div>
              <Img src={champ.image} alt={champ.code} className="nm-logo" />
              <strong>{champ.name}</strong>
              <span className="hero-sub">Campeão</span>
            </div>
          );
        })}
        <button className="btn primary big" onClick={onClose}>
          Seguir para {nextLabel} <Icon name="next" />
        </button>
      </div>
    </div>
  );
}
