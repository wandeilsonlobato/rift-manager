import { useState } from 'react';
import type { Champion } from '../game/ddragon';
import { startBlockers, startNewSeason } from '../game/market';
import type { GameState } from '../game/types';
import { acceptProposal, teamStrength } from '../game/world';
import { Img, money, Rating } from './common';
import type { Tab } from './Hub';

interface Props {
  game: GameState;
  champions: Champion[];
  onChange: (state: GameState) => void;
  onTab: (tab: Tab) => void;
}

export function Offseason({ game, champions, onChange, onTab }: Props) {
  const [busy, setBusy] = useState(false);
  const review = game.review;
  const blockers = startBlockers(game);
  const myTeam = game.coach.teamId!;

  const start = () => {
    setBusy(true);
    setTimeout(() => {
      onChange(startNewSeason(game, champions));
      setBusy(false);
    }, 20);
  };

  return (
    <>
      {review && (
        <section className="panel">
          <h3>Balanço da temporada {review.season}</h3>
          <p>{review.verdict}</p>
          <div className="review-grid">
            {review.results.map((r) => (
              <div key={r.compName} className="review-item">
                <span className="muted small">{r.compName}</span>
                <strong>{r.rank}º</strong>
              </div>
            ))}
            <div className="review-item">
              <span className="muted small">Reputação</span>
              <strong className={review.reputationDelta >= 0 ? 'up' : 'down'}>
                {review.reputationDelta >= 0 ? '+' : ''}
                {review.reputationDelta} → {game.coach.reputation}
              </strong>
            </div>
          </div>
          {review.titles.length > 0 && <p>🏆 Títulos: {review.titles.join(', ')}</p>}
        </section>
      )}

      {game.proposals.length > 0 && (
        <section className="panel">
          <h3>Propostas para você</h3>
          <div className="proposal-grid">
            {game.proposals.map((p) => {
              const team = game.teams[p.teamId];
              const league = game.leagues[team.leagueSlug];
              return (
                <div key={p.teamId} className="proposal offer-card">
                  <Img src={team.image} alt={team.code} className="team-logo big" />
                  <strong>{team.name}</strong>
                  <span className="muted small">
                    {p.renewal ? 'Renovação' : league.name} · força <Rating value={teamStrength(game, team.id)} />
                  </span>
                  <span className="small">
                    {p.objective.text} · {money(p.salary)}/mês · {p.years} {p.years === 1 ? 'temporada' : 'temporadas'}
                  </span>
                  <button
                    className="btn small primary"
                    onClick={() => onChange(acceptProposal(game, p))}
                  >
                    {p.teamId === myTeam ? 'Renovar' : 'Aceitar'}
                  </button>
                </div>
              );
            })}
          </div>
          {game.coach.contractEnd > game.season && (
            <p className="muted small">Seu contrato vai até {game.coach.contractEnd}. Aceitar é opcional.</p>
          )}
        </section>
      )}

      <section className="panel week-panel">
        <div className="week-info">
          <h3>Mercado aberto</h3>
          <p className="muted">
            Renove contratos, dispense jogadores e contrate reforços antes da temporada {game.season + 1}.{' '}
            <button className="link" onClick={() => onTab('market')}>
              Ir para o mercado
            </button>
          </p>
          {blockers.map((b) => (
            <p key={b} className="down small">
              ⚠ {b}
            </p>
          ))}
        </div>
        <button className="btn primary big" disabled={busy || blockers.length > 0} onClick={start}>
          {busy ? 'Preparando…' : `Iniciar temporada ${game.season + 1} ▶`}
        </button>
      </section>

      {game.news.length > 0 && <News news={game.news} />}
    </>
  );
}

export function News({ news }: { news: string[] }) {
  return (
    <section className="panel">
      <h3>Notícias do mercado</h3>
      <ul className="news">
        {news.slice(0, 15).map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </section>
  );
}
