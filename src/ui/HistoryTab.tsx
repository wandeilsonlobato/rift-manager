import { useState } from 'react';
import { COACH_STYLES, coachStyle } from '../game/coach';
import { countryByCode } from '../game/countries';
import type { GameState } from '../game/types';
import { overall } from '../game/world';
import { Flag, Img, Rating } from './common';
import { PlayerName } from './PlayerModal';
import { Icon } from './Icon';

const INTERNATIONAL = ['First Stand', 'Mid-Season Invitational', 'Esports World Cup', 'Worlds'];

export function HistoryTab({ game }: { game: GameState }) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const { coach } = game;
  const country = countryByCode(coach.country);
  const myLeague = game.leagues[game.teams[coach.teamId!].leagueSlug];
  const regionLeagues = Object.values(game.leagues).filter((l) => l.region === myLeague.region);
  // Nomes de competição da região (copas e splits das ligas da região).
  const regionNames = (name: string) =>
    regionLeagues.some((l) => name.startsWith(l.name) || name.includes(`do ${l.name} `)) || name.startsWith('Copa');

  const titles = game.titles.filter((t) => scope === 'all' || INTERNATIONAL.includes(t.compName) || regionNames(t.compName));
  const seasons = [...new Set(titles.map((t) => t.season))].sort((a, b) => b - a);

  const legends = Object.values(game.players)
    .filter((p) => p.titles?.length)
    .sort((a, b) => b.titles!.length - a.titles!.length || overall(b) - overall(a))
    .slice(0, 10);

  return (
    <>
      <h2>História</h2>

      <section className="panel">
        <h3>Carreira do coach</h3>
        <p>
          {country && <Flag code={country.code} />} <strong>{coach.name}</strong> · {COACH_STYLES[coachStyle(game)].label} ·
          reputação {coach.reputation}/100
        </p>
        {game.career.length ? (
          <table>
            <thead>
              <tr>
                <th>Temporada</th>
                <th>Time</th>
                <th>Splits</th>
                <th>Títulos</th>
              </tr>
            </thead>
            <tbody>
              {[...game.career].reverse().map((c) => (
                <tr key={c.season}>
                  <td>{c.season}</td>
                  <td>{c.teamName}</td>
                  <td>{c.results.map((r) => `${r.rank}º`).join(' · ')}</td>
                  <td>{c.titles.length ? (<><Icon name="trophy" size={14} /> {c.titles.join(', ')}</>) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small">A primeira temporada ainda está em andamento.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Galeria de campeões</h3>
          <select value={scope} onChange={(e) => setScope(e.target.value as 'mine' | 'all')}>
            <option value="mine">Internacionais e minha região</option>
            <option value="all">Todas as competições</option>
          </select>
        </div>
        {seasons.length ? (
          seasons.map((season) => (
            <div key={season} className="hof-season">
              <h4>{season}</h4>
              <div className="titles">
                {titles
                  .filter((t) => t.season === season)
                  .map((t) => {
                    const champ = game.teams[t.championId];
                    return (
                      <div
                        key={t.compName}
                        className={`title-card ${INTERNATIONAL.includes(t.compName) ? 'intl' : ''} ${champ?.id === coach.teamId ? 'mine' : ''}`}
                      >
                        {champ && <Img src={champ.image} alt={champ.code} className="team-logo" />}
                        <div>
                          <span className="muted small">{t.compName}</span>
                          <strong>{champ?.name ?? '—'}</strong>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))
        ) : (
          <p className="muted small">Nenhuma competição terminou ainda.</p>
        )}
      </section>

      <section className="panel">
        <h3>Lendas: mais títulos</h3>
        {legends.length ? (
          <table>
            <thead>
              <tr>
                <th>Jogador</th>
                <th>Time atual</th>
                <th>OVR</th>
                <th>Títulos</th>
              </tr>
            </thead>
            <tbody>
              {legends.map((p) => (
                <tr key={p.id}>
                  <td>
                    <PlayerName id={p.id} nick={p.nick} />
                  </td>
                  <td>{p.teamId ? game.teams[p.teamId].code : 'Livre'}</td>
                  <td>
                    <Rating value={overall(p)} />
                  </td>
                  <td><Icon name="trophy" size={14} /> {p.titles!.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small">Os primeiros campeões aparecem aqui ao fim de cada competição.</p>
        )}
      </section>
    </>
  );
}
