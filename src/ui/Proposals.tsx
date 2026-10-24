import logo from '../assets/logo-160.png';
import { countryByCode } from '../game/countries';
import type { GameState } from '../game/types';
import { acceptProposal, teamStrength } from '../game/world';
import { Flag, Img, money, Rating } from './common';

interface Props {
  game: GameState;
  onChange: (state: GameState) => void;
}

export function Proposals({ game, onChange }: Props) {
  const { coach } = game;
  const league = game.leagues[game.leagueSlug];
  const country = countryByCode(coach.country);

  return (
    <div className="page">
      <header className="page-header">
        <img src={logo} alt="Rift Manager" className="header-logo" />
        <h2>Caixa de entrada</h2>
      </header>
      <section className="panel">
        <p>
          Olá, <strong>{coach.name}</strong> {country && <Flag code={country.code} />}. Seu nome chamou atenção na{' '}
          <strong>{league.name}</strong>, a academy da{' '}
          <strong>{game.leagues[league.parentSlug!].name}</strong>. Você recebeu{' '}
          {game.proposals.length} propostas para a temporada {game.season}:
        </p>
      </section>
      <div className="proposal-grid">
        {game.proposals.map((p) => {
          const team = game.teams[p.teamId];
          return (
            <div key={p.teamId} className="panel proposal">
              <Img src={team.image} alt={team.code} className="team-logo big" />
              <h3>{team.name}</h3>
              {team.parentTeamId && (
                <span className="muted small">
                  Academy do {game.teams[team.parentTeamId].name}
                </span>
              )}
              <dl>
                <dt>Força do elenco</dt>
                <dd>
                  <Rating value={teamStrength(game, team.id)} />
                </dd>
                <dt>Objetivo</dt>
                <dd>{p.objective.text}</dd>
                <dt>Salário</dt>
                <dd>{money(p.salary)}/mês</dd>
                <dt>Contrato</dt>
                <dd>
                  {p.years} {p.years === 1 ? 'temporada' : 'temporadas'}
                </dd>
                <dt>Teto salarial</dt>
                <dd>{money(team.budget)}/mês</dd>
              </dl>
              <button className="btn primary" onClick={() => onChange(acceptProposal(game, p))}>
                Aceitar proposta
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
