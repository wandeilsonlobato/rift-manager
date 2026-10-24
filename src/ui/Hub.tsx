import { useState } from 'react';
import logo from '../assets/logo-160.png';
import type { Champion } from '../game/ddragon';
import { phaseLabel } from '../game/season';
import type { GameState, Series } from '../game/types';
import { Img } from './common';
import { ClubTab } from './ClubTab';
import { CompetitionsTab } from './CompetitionsTab';
import { HistoryTab } from './HistoryTab';
import { Home } from './Home';
import { PlayerLink, PlayerModal } from './PlayerModal';
import { ChampionCeremony } from './ResultSplash';
import { MarketTab } from './MarketTab';
import { SeriesModal } from './MatchModal';
import { Roster } from './Roster';
import { TrainingTab } from './TrainingTab';
import { Icon, type IconName } from './Icon';

export type Tab = 'home' | 'roster' | 'training' | 'competitions' | 'market' | 'club' | 'history';

const TABS: { id: Tab; label: string; icon: IconName; soon?: boolean }[] = [
  { id: 'home', label: 'Início', icon: 'home' },
  { id: 'roster', label: 'Elenco', icon: 'users' },
  { id: 'training', label: 'Treino', icon: 'dumbbell' },
  { id: 'competitions', label: 'Competições', icon: 'bracket' },
  { id: 'market', label: 'Mercado', icon: 'coins' },
  { id: 'club', label: 'Clube', icon: 'building' },
  { id: 'history', label: 'História', icon: 'book' },
];

interface Props {
  game: GameState;
  champions: Champion[];
  onChange: (state: GameState) => void;
  onExit: () => void;
}

export function Hub({ game, champions, onChange, onExit }: Props) {
  const [tab, setTab] = useState<Tab>('home');
  const [openSeries, setOpenSeries] = useState<Series | null>(null);
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  // Título conquistado e ainda não comemorado abre a cerimônia.
  const celebration = game.competitions.find(
    (c) => c.done && c.championId === game.coach.teamId && !(game.celebrated ?? []).includes(c.id),
  );
  const team = game.teams[game.coach.teamId!];
  const league = game.leagues[team.leagueSlug];

  return (
    <PlayerLink.Provider value={setOpenPlayer}>
    <div className="hub">
      <aside className="sidebar">
        <div className="brand">
          <img src={logo} alt="Rift Manager" />
          <span>RIFT MANAGER</span>
        </div>
        <div className="sidebar-team">
          <Img src={team.image} alt={team.code} className="team-logo" />
          <div>
            <strong>{team.name}</strong>
            <span className="muted small">{league.name}</span>
          </div>
        </div>
        {game.pendingEvent && (
          <button className="event-alert" onClick={() => setTab('home')}>
            <Icon name="warning" size={16} /> Decisão pendente
          </button>
        )}
        <nav>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? 'active' : ''}`}
              disabled={t.soon}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} />
              <span>{t.label}</span>
              {t.soon && <span className="badge">em breve</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="muted small">
            Temporada {game.season} · Semana {game.week}
            <br />
            {phaseLabel(game.phase)}
          </span>
          <button className="btn ghost small" onClick={onExit}>
            Menu principal
          </button>
        </div>
      </aside>
      <main className="hub-main">
        {tab === 'home' && (
          <Home game={game} champions={champions} onChange={onChange} onOpenSeries={setOpenSeries} onTab={setTab} />
        )}
        {tab === 'roster' && <Roster game={game} teamId={team.id} onChange={onChange} />}
        {tab === 'training' && <TrainingTab game={game} champions={champions} onChange={onChange} />}
        {tab === 'competitions' && <CompetitionsTab game={game} onOpenSeries={setOpenSeries} />}
        {tab === 'market' && <MarketTab game={game} onChange={onChange} />}
        {tab === 'club' && <ClubTab game={game} onChange={onChange} />}
        {tab === 'history' && <HistoryTab game={game} />}
      </main>
      {openSeries && <SeriesModal game={game} series={openSeries} onClose={() => setOpenSeries(null)} />}
      {openPlayer && <PlayerModal game={game} playerId={openPlayer} onClose={() => setOpenPlayer(null)} />}
      {celebration && (
        <ChampionCeremony
          game={game}
          comp={celebration}
          onClose={() => onChange({ ...game, celebrated: [...(game.celebrated ?? []), celebration.id] })}
        />
      )}
    </div>
    </PlayerLink.Provider>
  );
}
