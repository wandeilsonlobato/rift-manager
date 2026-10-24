import logo from '../assets/logo-160.png';
import { useState } from 'react';
import { COUNTRIES, countryByCode } from '../game/countries';
import type { Champion } from '../game/ddragon';
import { COACH_STYLES } from '../game/coach';
import type { CoachStyle, GameState } from '../game/types';
import { academyName, createCareer, RAW_LEAGUES } from '../game/world';
import { Flag, Img, Stars } from './common';

interface Props {
  champions: Champion[];
  onBack: () => void;
  onCreate: (state: GameState) => void;
}

export function NewCareer({ champions, onBack, onCreate }: Props) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('BR');
  const [league, setLeague] = useState('cblol-brazil');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [style, setStyle] = useState<CoachStyle>('tactical');

  const ready = name.trim().length >= 2 && !!league;
  const selectedLeague = RAW_LEAGUES.find((l) => l.slug === league);
  const selectedCountry = countryByCode(country);
  const q = search.trim().toLowerCase();
  const countries = COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q));

  const create = () => {
    setCreating(true);
    // Gerar o mundo leva um instante; deixa a tela mostrar o "carregando" antes.
    setTimeout(() => onCreate(createCareer(name.trim(), country, league, champions, style)), 20);
  };

  return (
    <div className="page">
      <header className="page-header">
        <img src={logo} alt="Rift Manager" className="header-logo" />
        <button className="btn ghost" onClick={onBack}>
          ← Voltar
        </button>
        <h2>Nova carreira</h2>
      </header>

      <div className="creation">
        <div className="creation-form">
          <section className="panel">
            <h3>1 · Nome do coach</h3>
            <input
              value={name}
              maxLength={24}
              placeholder="Ex.: Turtle"
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </section>

          <section className="panel">
            <h3>2 · País de origem</h3>
            <input placeholder="Buscar país…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="country-grid">
              {countries.map((c) => (
                <button
                  key={c.code}
                  className={`country-card ${country === c.code ? 'selected' : ''}`}
                  onClick={() => setCountry(c.code)}
                >
                  <Flag code={c.code} />
                  <span>{c.name}</span>
                </button>
              ))}
              {!countries.length && <p className="muted small">Nenhum país encontrado.</p>}
            </div>
          </section>
          <section className="panel">
            <h3>3 · Estilo de coach</h3>
            <div className="choice-grid three">
              {(Object.keys(COACH_STYLES) as CoachStyle[]).map((s) => (
                <button key={s} className={`choice-card ${style === s ? 'selected' : ''}`} onClick={() => setStyle(s)}>
                  <strong>{COACH_STYLES[s].label}</strong>
                  <span className="muted small">{COACH_STYLES[s].description}</span>
                  <span className="choice-attr">{COACH_STYLES[s].bonus}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="panel coach-preview">
          <span className="muted small">Prévia</span>
          {selectedCountry && <Flag code={selectedCountry.code} className="flag-big" />}
          <h2>{name.trim() || 'Seu nome'}</h2>
          <span className="muted">
            Coach {COACH_STYLES[style].label.toLowerCase()} {selectedCountry ? `· ${selectedCountry.name}` : ''}
          </span>
          <div className="preview-rep">
            <span className="muted small">Reputação inicial</span>
            <div className="bar wide">
              <div style={{ width: '15%' }} />
            </div>
          </div>
          {selectedLeague && (
            <div className="career-path">
              <span className="muted small">Caminho da carreira</span>
              <div className="path-step current">
                <Img src={selectedLeague.academy?.image ?? selectedLeague.image} alt="" className="path-logo" />
                <div>
                  <strong>{academyName(selectedLeague)}</strong>
                  <span className="muted small">você começa aqui</span>
                </div>
              </div>
              <div className="path-arrow">↓</div>
              <div className="path-step">
                <Img src={selectedLeague.image} alt="" className="path-logo" />
                <div>
                  <strong>{selectedLeague.name}</strong>
                  <span className="muted small">liga principal</span>
                </div>
              </div>
              <div className="path-arrow">↓</div>
              <div className="path-step">
                <span className="path-logo trophy">🏆</span>
                <div>
                  <strong>First Stand · MSI · Worlds</strong>
                  <span className="muted small">o topo do mundo</span>
                </div>
              </div>
            </div>
          )}
          <button className="btn primary big" disabled={!ready || creating} onClick={create}>
            {creating ? 'Montando o mundo…' : 'Começar carreira'}
          </button>
          {!ready && <span className="muted small">Digite um nome com pelo menos 2 letras.</span>}
        </aside>
      </div>

      <section className="panel">
        <h3>4 · Liga</h3>
        <p className="muted">
          Todo coach começa por baixo: você inicia na <strong>2ª divisão</strong> da liga escolhida e recebe propostas
          dos times de lá. Faça sucesso para chegar à liga principal.
        </p>
        <div className="league-grid">
          {RAW_LEAGUES.map((l) => (
            <button
              key={l.slug}
              className={`league-card ${league === l.slug ? 'selected' : ''}`}
              onClick={() => setLeague(l.slug)}
            >
              <span className="logo-plate">
                <Img src={l.image} alt={l.name} className="league-logo" />
              </span>
              <strong>{l.name}</strong>
              <span className="muted small">{l.region}</span>
              <Stars value={l.prestige} />
              <span className="academy-tag">Início: {academyName(l)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
