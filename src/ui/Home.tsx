import { useEffect, useRef, useState } from 'react';
import { COACH_STYLES, coachStyle, TACTICS } from '../game/coach';
import { countryByCode } from '../game/countries';
import { championIcon, type Champion } from '../game/ddragon';
import { payroll } from '../game/market';
import { STYLE_LABEL } from '../game/meta';
import { currentCompetitions, phaseLabel, PHASES, stageStandings } from '../game/season';
import { focusInfo } from '../game/training';
import type { GameState, Series } from '../game/types';
import { advanceToNextMatch, advanceWeek, myCompetition, mySeriesThisWeek, trainedFocus } from '../game/week';
import { starters, teamStrength } from '../game/world';
import { Flag, Img, money, Rating } from './common';
import { DraftScreen } from './DraftScreen';
import { EventCard } from './EventCard';
import type { Tab } from './Hub';
import { Icon } from './Icon';
import { Inbox } from './Inbox';
import { CountUp } from './motion';
import { SeriesRow } from './MatchRow';
import { NextMatchCard } from './NextMatchCard';
import { Offseason } from './Offseason';
import { PlayerCard } from './PlayerCard';
import { InternationalSummary, ResultSplash } from './ResultSplash';
import { GrowthList } from './TrainingTab';

interface Props {
  game: GameState;
  champions: Champion[];
  onChange: (state: GameState) => void;
  onOpenSeries: (s: Series) => void;
  onTab: (tab: Tab) => void;
}

export function Home({ game, champions, onChange, onOpenSeries, onTab }: Props) {
  const [busy, setBusy] = useState(false);
  const { coach } = game;
  const team = game.teams[coach.teamId!];
  const country = countryByCode(coach.country);
  const lineup = starters(game, team.id);
  const comp = myCompetition(game);
  const upcoming = mySeriesThisWeek(game);
  const report = game.lastReport;
  const phaseIdx = PHASES.findIndex((p) => p.id === game.phase);

  // Situação do time na competição atual.
  let status = '';
  if (comp) {
    const st = comp.stages[comp.stageIndex];
    if (comp.done) status = comp.championId === team.id ? 'Campeão!' : `Terminou em ${comp.ranking!.indexOf(team.id) + 1}º`;
    else if (st.kind === 'rr1' || st.kind === 'rr2' || st.kind === 'swiss') {
      const table = stageStandings(game, st);
      const pos = table.findIndex((r) => r.teamId === team.id);
      status = pos >= 0 ? `${pos + 1}º · ${table[pos].wins}V ${table[pos].losses}D` : 'Eliminado';
    } else {
      // Na eliminação dupla a primeira derrota manda para a chave inferior; a segunda elimina.
      const losses = st.rounds.flat().filter((id) => {
        const s = game.series[id];
        return s.winner && (s.a === team.id || s.b === team.id) && s.winner !== team.id;
      }).length;
      const lives = st.kind === 'double' || st.kind === 'groups' ? 2 : 1;
      const alive = st.teamIds.includes(team.id) && losses < lives;
      status = !alive
        ? 'Eliminado'
        : st.kind === 'double' && losses === 1
          ? `${st.name} · chave inferior`
          : `${st.name} · vivo na disputa`;
    }
  }

  const act = (fn: typeof advanceWeek) => {
    setBusy(true);
    // Deixa o botão mostrar "simulando" antes do cálculo travar a tela.
    setTimeout(() => {
      onChange(fn(game, champions));
      setBusy(false);
    }, 20);
  };

  // Draft: cada série do coach nesta semana passa pela tela de draft antes do resto da rodada.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [resume, setResume] = useState(false);
  const manualDraft = game.manualDraft ?? true;
  const pending = upcoming.filter((s) => !s.winner);

  const trained = trainedFocus(game);
  /** Sem treino o time não evolui nem recebe o bônus do foco: confirma antes de seguir. */
  const okWithoutTraining = () =>
    !!trained ||
    confirm('Avançar sem treinar? O time não evolui e não recebe o bônus do foco nos jogos desta semana.');

  const advance = () => {
    if (!okWithoutTraining()) return;
    if (manualDraft && pending.length) setDraftId(pending[0].id);
    else act(advanceWeek);
  };

  useEffect(() => {
    if (!resume) return;
    setResume(false);
    const next = mySeriesThisWeek(game).filter((s) => !s.winner);
    if (next.length) setDraftId(next[0].id);
    else act(advanceWeek);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, game]);

  // Tela de vitória/derrota quando uma semana com jogos do seu time termina.
  const shownWeek = useRef(game.lastReport?.week ?? 0);
  // Séries jogadas pelo draft já tiveram tela de resultado; não repetem no resumo da semana.
  const draftedSeries = useRef(new Set<string>());
  const [splash, setSplash] = useState<Series[] | null>(null);
  useEffect(() => {
    const r = game.lastReport;
    if (!r || r.week === shownWeek.current) return;
    shownWeek.current = r.week;
    const played = r.seriesIds
      .map((id) => game.series[id])
      .filter((s) => s?.winner && !draftedSeries.current.has(s.id));
    if (played.length) setSplash(played);
  }, [game.lastReport, game.series]);

  const otherEvents = currentCompetitions(game).filter((c) => c.kind === 'international' && c !== comp);
  const myLeague = game.leagues[team.leagueSlug];
  const regional = new Set([myLeague.slug, myLeague.parentSlug, myLeague.academySlug]);
  const finished = game.competitions.filter(
    (c) => c.done && (c.kind === 'international' || regional.has(c.leagueSlug)),
  );

  return (
    <>
      {splash && <ResultSplash game={game} series={splash} onClose={() => setSplash(null)} />}
      {!splash && game.skipped?.length ? (
        <InternationalSummary
          game={game}
          items={game.skipped}
          nextLabel={phaseLabel(game.phase)}
          onClose={() => onChange({ ...game, skipped: undefined })}
        />
      ) : null}
      {draftId && (
        <DraftScreen
          // Cada série abre um draft novo (sem herdar picks e resultado da série anterior).
          key={draftId}
          game={game}
          seriesId={draftId}
          champions={champions}
          onGamePlayed={(state) => {
            draftedSeries.current.add(draftId);
            onChange(state);
          }}
          onFinish={() => {
            setDraftId(null);
            setResume(true);
          }}
        />
      )}
      <section className="home-hero">
        <div className="home-hero-bg logo-bg" style={{ backgroundImage: `url(${team.image.replace(/^http:/, 'https:')})` }} />
        <div className="home-hero-content">
          <Img src={team.image} alt={team.code} className="team-logo" />
          <div>
            <span className="hero-sub">
              {myLeague.name} · {phaseLabel(game.phase)} · Semana {game.week}
            </span>
            <h1>{team.name}</h1>
            <div className="hero-meta">
              <span>Coach {coach.name}</span>
              <span>
                Força <Rating value={teamStrength(game, team.id)} />
              </span>
              {comp && <span className="up">{status}</span>}
            </div>
          </div>
        </div>
      </section>

      <div className="phase-track">
        {PHASES.map((p, i) => (
          <span key={p.id} className={`phase-step ${i < phaseIdx ? 'done' : i === phaseIdx ? 'current' : ''}`}>
            {p.label}
          </span>
        ))}
      </div>

      <EventCard game={game} onChange={onChange} />
      <div className="stat-row">
        <div className="panel stat">
          <span className="muted small">Coach</span>
          <strong>
            {country && <Flag code={country.code} />} {coach.name}
          </strong>
          <span className="muted small">
            Reputação {coach.reputation}/100 · {money(coach.salary)}/mês até {coach.contractEnd}
          </span>
          {coach.objective && <span className="muted small">Objetivo: {coach.objective.text}</span>}
          <span className="muted small">Estilo: {COACH_STYLES[coachStyle(game)].label} · Tática: {TACTICS[game.tactic ?? 'balanced'].label}</span>
        </div>
        <div className="panel stat">
          <span className="muted small">{comp?.name ?? phaseLabel(game.phase)}</span>
          <strong>{comp ? status : 'Fora do evento'}</strong>
          <span className="muted small">{phaseLabel(game.phase)}</span>
        </div>
        <div className="panel stat">
          <span className="muted small">Força do time</span>
          <strong>
            <Rating value={teamStrength(game, team.id)} />
          </strong>
          <span className="muted small">
            química {Math.round(team.chemistry ?? 60)}/100
          </span>
        </div>
        <div className="panel stat">
          <span className="muted small">Folha salarial</span>
          <strong>
            <CountUp value={payroll(game, team.id)} format={(n) => money(Math.round(n))} /> / {money(team.budget)}
          </strong>
          <span className="muted small">
            caixa <CountUp value={team.cash} format={(n) => money(Math.round(n))} />
          </span>
        </div>
      </div>

      {game.phase === 'offseason' && <Offseason game={game} champions={champions} onChange={onChange} onTab={onTab} />}
      {game.phase !== 'offseason' && <NextMatchCard game={game} />}

      {game.phase !== 'offseason' && (
        <section className="panel week-panel">
            <div className="week-info">
              <h3>
                Semana {game.week} · {phaseLabel(game.phase)}
              </h3>
              {!upcoming.length && (
                <p className="muted">
                  {comp
                    ? 'Sem jogos do seu time nesta semana.'
                    : `Seu time não disputa ${otherEvents.map((c) => c.name).join(', ') || 'esta fase'}. Acompanhe pela aba Competições.`}
                </p>
              )}
              {trained ? (
                <p className="up small warn-line"><Icon name="check" size={15} /> Treino da semana concluído: {focusInfo(trained).label}</p>
              ) : (
                <p className="down small warn-line">
                  <Icon name="warning" size={15} /> Você ainda não treinou nesta semana.{' '}
                  <button className="link" onClick={() => onTab('training')}>
                    Ir para o treino
                  </button>
                </p>
              )}
            </div>
            <div className="week-actions">
              <button className="btn primary big" disabled={busy || !!game.pendingEvent} onClick={advance}>
                {busy ? 'Simulando…' : manualDraft && pending.length ? 'Ir para o draft' : 'Avançar semana'}
                {!busy && <Icon name="play" />}
              </button>
              <label className="inline small">
                <input
                  type="checkbox"
                  checked={manualDraft}
                  onChange={() => onChange({ ...game, manualDraft: !manualDraft })}
                />
                Fazer o draft dos meus jogos
              </label>
              {!upcoming.length && (
                <button className="btn small" disabled={busy || !!game.pendingEvent} onClick={() => okWithoutTraining() && act(advanceToNextMatch)}>
                  Avançar até meu próximo jogo <Icon name="skip" size={14} />
                </button>
              )}
            </div>
        </section>
      )}

      {game.phase !== 'offseason' && game.meta && <PatchPanel game={game} />}

      {game.phase !== 'offseason' && <Inbox game={game} onTab={onTab} />}

      {report && game.phase !== 'offseason' && (
        <section className="panel">
          <h3>Resumo da semana {report.week}</h3>
          {report.seriesIds.map((id) => {
            const s = game.series[id];
            return (
              <SeriesRow
                key={id}
                game={game}
                series={s}
                teamId={team.id}
                onClick={s.gameIds.length ? () => onOpenSeries(s) : undefined}
              />
            );
          })}
          {report.focus ? (
            <>
              <p className="muted small">Treino de {focusInfo(report.focus).label.toLowerCase()}:</p>
              <GrowthList game={game} growth={report.growth} />
            </>
          ) : (
            <p className="muted small">Sem treino nesta semana.</p>
          )}
        </section>
      )}

      {finished.length > 0 && (
        <section className="panel">
          <h3>Campeões da temporada</h3>
          <div className="titles">
            {finished.map((c) => {
              const champ = game.teams[c.championId!];
              return (
                <div key={c.id} className={`title-card ${champ.id === team.id ? 'mine' : ''}`}>
                  <Img src={champ.image} alt={champ.code} className="team-logo" />
                  <div>
                    <span className="muted small">{c.name}</span>
                    <strong>{champ.name}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel">
        <h3>Titulares</h3>
        <div className="card-row">
          {lineup.map((p) => (
            <PlayerCard key={p.id} game={game} player={p} compact />
          ))}
        </div>
      </section>
    </>
  );
}

function PatchPanel({ game }: { game: GameState }) {
  const meta = game.meta!;
  return (
    <section className="panel patch">
      <h3>
        Patch {meta.name} · meta {STYLE_LABEL[meta.style].toLowerCase()}
      </h3>
      <div className="patch-row">
        <span className="up small">Fortes</span>
        {meta.buffed.map((c) => (
          <img key={c} src={championIcon(c)} alt={c} title={c} />
        ))}
      </div>
      <div className="patch-row">
        <span className="down small">Fracos</span>
        {meta.nerfed.map((c) => (
          <img key={c} src={championIcon(c)} alt={c} title={c} />
        ))}
      </div>
    </section>
  );
}
