import { useEffect, useState } from 'react';
import { countryByCode } from '../game/countries';
import { championIcon, type Champion } from '../game/ddragon';
import { currentCompetitions, phaseLabel, PHASES, stageStandings } from '../game/season';
import { focusInfo } from '../game/training';
import { ROLE_LABEL, type GameState, type Series } from '../game/types';
import { advanceToNextMatch, advanceWeek, myCompetition, mySeriesThisWeek, trainedFocus } from '../game/week';
import { overall, starters, teamStrength } from '../game/world';
import { payroll } from '../game/market';
import { Img, money, Rating } from './common';
import { News, Offseason } from './Offseason';
import type { Tab } from './Hub';
import { DraftScreen } from './DraftScreen';
import { PlayerName } from './PlayerModal';
import { GrowthList } from './TrainingTab';
import { EventCard } from './EventCard';
import { Flag, FormBadge } from './common';
import { STYLE_LABEL } from '../game/meta';
import { hasSoloq, soloqInfo } from '../game/soloq';
import { COACH_STYLES, coachStyle, TACTICS } from '../game/coach';
import { SeriesRow } from './MatchRow';

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
    if (comp.done) status = comp.championId === team.id ? 'Campeão! 🏆' : `Terminou em ${comp.ranking!.indexOf(team.id) + 1}º`;
    else if (st.kind === 'rr1' || st.kind === 'rr2' || st.kind === 'swiss') {
      const table = stageStandings(game, st);
      const pos = table.findIndex((r) => r.teamId === team.id);
      status = pos >= 0 ? `${pos + 1}º · ${table[pos].wins}V ${table[pos].losses}D` : 'Eliminado';
    } else {
      const alive = st.teamIds.includes(team.id) && !st.rounds.flat().some((id) => {
        const s = game.series[id];
        return s.winner && (s.a === team.id || s.b === team.id) && s.winner !== team.id;
      });
      status = alive ? `${st.name} · vivo na disputa` : 'Eliminado';
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

  const otherEvents = currentCompetitions(game).filter((c) => c.kind === 'international' && c !== comp);
  const myLeague = game.leagues[team.leagueSlug];
  const regional = new Set([myLeague.slug, myLeague.parentSlug, myLeague.academySlug]);
  const finished = game.competitions.filter(
    (c) => c.done && (c.kind === 'international' || regional.has(c.leagueSlug)),
  );

  return (
    <>
      {draftId && (
        <DraftScreen
          game={game}
          seriesId={draftId}
          champions={champions}
          onGamePlayed={onChange}
          onFinish={() => {
            setDraftId(null);
            setResume(true);
          }}
        />
      )}
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
            {money(payroll(game, team.id))} / {money(team.budget)}
          </strong>
          <span className="muted small">caixa {money(team.cash)}</span>
        </div>
      </div>

      {game.phase === 'offseason' && <Offseason game={game} champions={champions} onChange={onChange} onTab={onTab} />}
      {game.phase !== 'offseason' && game.week <= 2 && game.news.length > 0 && <News news={game.news} />}

      {game.phase !== 'offseason' && (
        <section className="panel week-panel">
            <div className="week-info">
              <h3>
                Semana {game.week} · {phaseLabel(game.phase)}
              </h3>
              {upcoming.length ? (
                upcoming.map((s) => <SeriesRow key={s.id} game={game} series={s} teamId={team.id} />)
              ) : (
                <p className="muted">
                  {comp
                    ? 'Sem jogos do seu time nesta semana.'
                    : `Seu time não disputa ${otherEvents.map((c) => c.name).join(', ') || 'esta fase'}. Acompanhe pela aba Competições.`}
                </p>
              )}
              {trained ? (
                <p className="up small">✓ Treino da semana concluído: {focusInfo(trained).label}</p>
              ) : (
                <p className="down small">
                  ⚠ Você ainda não treinou nesta semana.{' '}
                  <button className="link" onClick={() => onTab('training')}>
                    Ir para o treino
                  </button>
                </p>
              )}
            </div>
            <div className="week-actions">
              <button className="btn primary big" disabled={busy || !!game.pendingEvent} onClick={advance}>
                {busy ? 'Simulando…' : manualDraft && pending.length ? 'Ir para o draft ▶' : 'Avançar semana ▶'}
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
                  Avançar até meu próximo jogo ⏭
                </button>
              )}
            </div>
        </section>
      )}

      {game.phase !== 'offseason' && game.meta && <PatchPanel game={game} />}

      {(game.eventLog ?? []).length > 0 && game.phase !== 'offseason' && (
        <section className="panel">
          <h3>Bastidores</h3>
          <ul className="news">
            {game.eventLog!.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </section>
      )}

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
        <div className="lineup">
          {lineup.map((p) => (
            <div key={p.id} className="lineup-card">
              <Img src={p.image} alt={p.nick} className="player-photo" />
              <span className="role-tag">{ROLE_LABEL[p.role]}</span>
              <PlayerName id={p.id} nick={p.nick} />
              <span>
                <Rating value={overall(p)} /> <FormBadge form={p.form ?? 0} />
              </span>
              <div className="bar" title={`Moral ${p.morale}`}>
                <div style={{ width: `${p.morale}%` }} />
              </div>
            </div>
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
      {hasSoloq() && (
        <p className="muted small">
          Fortes e fracos pela taxa de vitória real: {soloqInfo().matches} partidas de Challenger {soloqInfo().platform} (patch{' '}
          {soloqInfo().patch}).
        </p>
      )}
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
