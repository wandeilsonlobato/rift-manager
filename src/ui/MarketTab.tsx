import { useMemo, useState } from 'react';
import {
  interest,
  isExpiring,
  makeOffer,
  marketAsk,
  MAX_ROSTER,
  committedPayroll,
  committedRoster,
  releaseCost,
  releasePlayer,
  signBlocker,
  transferFee,
} from '../game/market';
import { ROLE_LABEL, ROLES, type GameState, type Player, type Role } from '../game/types';
import { overall, starters } from '../game/world';
import { Img, money, Rating } from './common';
import { PlayerName } from './PlayerModal';

type View = 'roster' | 'free' | 'others';
type Sort = 'ovr' | 'pot' | 'age' | 'salary';

interface Props {
  game: GameState;
  onChange: (state: GameState) => void;
}

export function MarketTab({ game, onChange }: Props) {
  const [view, setView] = useState<View>('free');
  const [negotiating, setNegotiating] = useState<Player | null>(null);
  const [toast, setToast] = useState('');
  const teamId = game.coach.teamId!;
  const team = game.teams[teamId];
  const open = game.phase === 'offseason';

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  return (
    <>
      <h2>Mercado</h2>
      <div className="stat-row">
        <div className="panel stat">
          <span className="muted small">Janela de transferências</span>
          <strong className={open ? 'up' : 'down'}>{open ? 'Aberta' : 'Fechada'}</strong>
          <span className="muted small">{open ? 'até o início da temporada' : 'abre após o Worlds'}</span>
        </div>
        <div className="panel stat">
          <span className="muted small">{open ? `Folha de ${game.season + 1}` : 'Folha salarial'}</span>
          <strong>
            {money(committedPayroll(game, teamId))} / {money(team.budget)}
          </strong>
          <span className="muted small">{open ? 'só contratos que seguem' : 'por mês (teto)'}</span>
        </div>
        <div className="panel stat">
          <span className="muted small">Caixa</span>
          <strong>{money(team.cash)}</strong>
          <span className="muted small">para multas e rescisões</span>
        </div>
        <div className="panel stat">
          <span className="muted small">Elenco</span>
          <strong>
            {committedRoster(game, teamId).length}/{MAX_ROSTER}
          </strong>
          <span className="muted small">{open ? `com contrato para ${game.season + 1}` : 'jogadores'}</span>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="tabs">
        {(
          [
            ['roster', 'Meu elenco'],
            ['free', 'Agentes livres'],
            ['others', 'Jogadores de outros times'],
          ] as [View, string][]
        ).map(([id, label]) => (
          <button key={id} className={`tab ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'roster' ? (
        <MyRoster
          game={game}
          onNegotiate={setNegotiating}
          onRelease={(p) => {
            const cost = releaseCost(game, p);
            if (!confirm(`Dispensar ${p.nick}?${cost ? ` A rescisão custa ${money(cost)}.` : ''}`)) return;
            const r = releasePlayer(game, p.id);
            onChange(r.state);
            notify(r.message);
          }}
        />
      ) : (
        <PlayerSearch game={game} free={view === 'free'} onNegotiate={setNegotiating} />
      )}

      {negotiating && (
        <Negotiation
          game={game}
          player={negotiating}
          onClose={() => setNegotiating(null)}
          onSend={(salary, years) => {
            const r = makeOffer(game, negotiating.id, salary, years);
            onChange(r.state);
            notify(r.message);
            setNegotiating(null);
          }}
        />
      )}
    </>
  );
}

function MyRoster({ game, onNegotiate, onRelease }: { game: GameState; onNegotiate: (p: Player) => void; onRelease: (p: Player) => void }) {
  const teamId = game.coach.teamId!;
  const lineup = new Set(starters(game, teamId).map((p) => p.id));
  const roster = game.teams[teamId].playerIds.map((id) => game.players[id]);
  const open = game.phase === 'offseason';

  return (
    <div className="panel table-wrap">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Jogador</th>
            <th>Rota</th>
            <th>Idade</th>
            <th>OVR</th>
            <th>POT</th>
            <th>Salário</th>
            <th>Contrato</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {roster.map((p) => {
            const expiring = isExpiring(game, p);
            return (
              <tr key={p.id}>
                <td>
                  <Img src={p.image} alt={p.nick} className="player-thumb" />
                </td>
                <td>
                  <PlayerName id={p.id} nick={p.nick} />
                  <div className="muted small">{lineup.has(p.id) ? 'titular' : 'reserva'}</div>
                </td>
                <td>{ROLE_LABEL[p.role]}</td>
                <td>{p.age}</td>
                <td>
                  <Rating value={overall(p)} />
                </td>
                <td className="muted">{p.potential}</td>
                <td>{money(p.salary)}</td>
                <td>{expiring ? <span className="down">vence agora</span> : `até ${p.contractEnd}`}</td>
                <td className="actions">
                  {expiring && open && (
                    <button className="btn small primary" disabled={game.refused.includes(p.id)} onClick={() => onNegotiate(p)}>
                      {game.refused.includes(p.id) ? 'Recusou' : 'Renovar'}
                    </button>
                  )}
                  <button className="btn small" onClick={() => onRelease(p)}>
                    Dispensar{releaseCost(game, p) ? ` (${money(releaseCost(game, p))})` : ''}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlayerSearch({ game, free, onNegotiate }: { game: GameState; free: boolean; onNegotiate: (p: Player) => void }) {
  const teamId = game.coach.teamId!;
  const myRegion = game.leagues[game.teams[teamId].leagueSlug].region;
  const [role, setRole] = useState<Role | ''>('');
  const [region, setRegion] = useState(myRegion);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('ovr');
  const [maxAge, setMaxAge] = useState(35);

  const regions = useMemo(
    () => [...new Set(Object.values(game.leagues).map((l) => l.region))].sort(),
    [game.leagues],
  );

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const key: Record<Sort, (p: Player) => number> = {
      ovr: (p) => -overall(p),
      pot: (p) => -p.potential,
      age: (p) => p.age,
      salary: (p) => p.salary,
    };
    return Object.values(game.players)
      .filter((p) => (free ? !p.teamId : p.teamId && p.teamId !== teamId))
      .filter((p) => !role || p.role === role)
      .filter((p) => !region || (free ? p.region === region : game.leagues[game.teams[p.teamId!].leagueSlug].region === region))
      .filter((p) => p.age <= maxAge)
      .filter((p) => !q || p.nick.toLowerCase().includes(q))
      .sort((a, b) => key[sort](a) - key[sort](b))
      .slice(0, 60);
  }, [game, free, role, region, search, sort, maxAge, teamId]);

  return (
    <>
      <div className="filters">
        <input placeholder="Buscar por nick…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
          <option value="">Todas as rotas</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">Todas as regiões</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="ovr">Maior OVR</option>
          <option value="pot">Maior potencial</option>
          <option value="age">Mais jovens</option>
          <option value="salary">Mais baratos</option>
        </select>
        <label className="inline">
          Idade até
          <input type="number" min={16} max={35} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} />
        </label>
      </div>

      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Jogador</th>
              <th>Rota</th>
              <th>Idade</th>
              <th>OVR</th>
              <th>POT</th>
              <th>{free ? 'Região' : 'Time'}</th>
              <th>Pede</th>
              {!free && <th>Multa</th>}
              <th>Interesse</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const ask = marketAsk(game, p, teamId);
              const chance = interest(game, p, teamId, ask);
              const refused = game.refused.includes(p.id);
              return (
                <tr key={p.id}>
                  <td>
                    <Img src={p.image} alt={p.nick} className="player-thumb" />
                  </td>
                  <td>
                    <PlayerName id={p.id} nick={p.nick} />
                    <div className="muted small">
                      {p.firstName} {p.lastName}
                    </div>
                  </td>
                  <td>{ROLE_LABEL[p.role]}</td>
                  <td>{p.age}</td>
                  <td>
                    <Rating value={overall(p)} />
                  </td>
                  <td className="muted">{p.potential}</td>
                  <td className="muted small">{free ? (p.region ?? '—') : game.teams[p.teamId!].code}</td>
                  <td>{money(ask)}/mês</td>
                  {!free && <td>{money(transferFee(game, p))}</td>}
                  <td>
                    <InterestBar value={chance} />
                  </td>
                  <td>
                    <button className="btn small" disabled={refused} onClick={() => onNegotiate(p)}>
                      {refused ? 'Recusou' : 'Negociar'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && <p className="muted center">Nenhum jogador encontrado com esses filtros.</p>}
      </div>
    </>
  );
}

function InterestBar({ value }: { value: number }) {
  const tier = value >= 65 ? 'high' : value >= 35 ? 'mid' : 'low';
  return (
    <span className={`interest ${tier}`}>
      <span style={{ width: `${value}%` }} />
      <em>{value}%</em>
    </span>
  );
}

interface NegotiationProps {
  game: GameState;
  player: Player;
  onClose: () => void;
  onSend: (salary: number, years: number) => void;
}

function Negotiation({ game, player, onClose, onSend }: NegotiationProps) {
  const teamId = game.coach.teamId!;
  const ask = marketAsk(game, player, teamId);
  const [salary, setSalary] = useState(ask);
  const [years, setYears] = useState(2);
  const renewal = player.teamId === teamId;
  const chance = interest(game, player, teamId, salary);
  const fee = transferFee(game, player);
  const currentSalary = renewal ? player.salary : 0;
  const newPayroll = committedPayroll(game, teamId) - (renewal && !isExpiring(game, player) ? currentSalary : 0) + salary;
  const blocker = signBlocker(game, player, salary);
  // Rotas que ficariam sem jogador com contrato depois desta proposta.
  const committed = committedRoster(game, teamId);
  const emptyRoles = ROLES.filter((r) => r !== player.role && !committed.some((p) => p.role === r));
  const room = game.teams[teamId].budget - newPayroll;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <div className="nego-head">
          <Img src={player.image} alt={player.nick} className="player-photo nego-photo" />
          <div>
            <h3>{renewal ? 'Renovação' : 'Proposta'}</h3>
            <h2>{player.nick}</h2>
            <span className="muted small">
              {ROLE_LABEL[player.role]} · {player.age} anos · OVR {overall(player)} · POT {player.potential}
            </span>
            {player.teamId && !renewal && (
              <div className="muted small">
                Time atual: {game.teams[player.teamId].name} · multa {money(fee)}
              </div>
            )}
          </div>
        </div>

        <label>
          Salário mensal: <strong>{money(salary)}</strong> <span className="muted small">(pede {money(ask)})</span>
          <input
            type="range"
            min={Math.max(1, Math.round(ask * 0.5))}
            max={Math.round(ask * 2) + 2}
            value={salary}
            onChange={(e) => setSalary(Number(e.target.value))}
          />
        </label>
        <label>
          Duração
          <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {[1, 2, 3].map((y) => (
              <option key={y} value={y}>
                {y} {y === 1 ? 'temporada' : 'temporadas'} (até {game.season + y})
              </option>
            ))}
          </select>
        </label>

        <div className="nego-summary">
          <span>Chance de aceitar</span>
          <InterestBar value={chance} />
          <span>Folha após a proposta</span>
          <strong className={newPayroll > game.teams[teamId].budget ? 'down' : ''}>
            {money(newPayroll)} / {money(game.teams[teamId].budget)}
          </strong>
        </div>
        {emptyRoles.length > 0 && (
          <p className={`small ${room < emptyRoles.length * 3 ? 'down' : 'muted'}`}>
            Depois desta proposta sobram {money(Math.max(0, room))}/mês para {emptyRoles.length}{' '}
            {emptyRoles.length === 1 ? 'rota vazia' : 'rotas vazias'} ({emptyRoles.map((r) => ROLE_LABEL[r]).join(', ')}).
          </p>
        )}
        {blocker && <p className="down small">{blocker}</p>}
        <p className="muted small">Se o jogador recusar, ele não negocia de novo nesta janela.</p>
        <button className="btn primary" disabled={!!blocker} onClick={() => onSend(salary, years)}>
          Enviar proposta
        </button>
      </div>
    </div>
  );
}
