import { weeklyCosts, weeklySponsor } from '../game/finance';
import { payroll } from '../game/market';
import { fireStaff, hireStaff, STAFF_INFO, staffPayroll } from '../game/staff';
import type { GameState, StaffRole } from '../game/types';
import { money } from './common';
import { CountUp } from './motion';
import { InfoTip } from './Icon';

interface Props {
  game: GameState;
  onChange: (state: GameState) => void;
}

export function ClubTab({ game, onChange }: Props) {
  const team = game.teams[game.coach.teamId!];
  const sponsor = weeklySponsor(game);
  const costs = weeklyCosts(game);
  const balance = sponsor - costs.players - costs.staff;
  const roles = Object.keys(STAFF_INFO) as StaffRole[];

  return (
    <>
      <h2>Clube</h2>
      <div className="stat-row">
        <div className="panel stat">
          <span className="muted small">Caixa</span>
          <strong className={team.cash < 0 ? 'down' : ''}>
            <CountUp value={team.cash} format={(n) => money(Math.round(n))} />
          </strong>
          <span className="muted small">{team.cash < 0 ? 'negativo: a diretoria cobra' : 'disponível'}</span>
        </div>
        <div className="panel stat">
          <span className="muted small">Patrocínio semanal</span>
          <strong className="up">+{money(sponsor)}</strong>
          <span className="muted small">cresce com sua reputação</span>
        </div>
        <div className="panel stat">
          <span className="muted small">Custos semanais</span>
          <strong className="down">-{money(costs.players + costs.staff)}</strong>
          <span className="muted small">
            jogadores {money(costs.players)} · staff {money(costs.staff)}
          </span>
        </div>
        <div className="panel stat">
          <span className="muted small">Saldo por semana</span>
          <strong className={balance >= 0 ? 'up' : 'down'}>
            {balance >= 0 ? '+' : '-'}
            {money(Math.abs(balance))}
          </strong>
          <span className="muted small">
            folha {money(payroll(game, team.id))}/{money(team.budget)} por mês
          </span>
        </div>
      </div>

      <section className="panel">
        <h3>
          Staff · {money(staffPayroll(game))}/mês
          <InfoTip>Um profissional por função. O salário sai do caixa. Demitir custa um mês de salário.</InfoTip>
        </h3>
        <div className="staff-grid">
          {roles.map((role) => {
            const current = game.staff?.find((s) => s.role === role);
            const candidates = (game.staffMarket ?? []).filter((s) => s.role === role).sort((a, b) => b.level - a.level);
            return (
              <div key={role} className="staff-col">
                <h4>{STAFF_INFO[role].label}</h4>
                {current ? (
                  <div className="staff-card hired">
                    <strong>{current.name}</strong>
                    <span className="stars">{'★'.repeat(current.level)}</span>
                    <span className="muted small">{STAFF_INFO[role].effect(current.level)}</span>
                    <span className="small">{money(current.salary)}/mês</span>
                    <button className="btn small" onClick={() => onChange(fireStaff(game, current.id))}>
                      Demitir ({money(current.salary)})
                    </button>
                  </div>
                ) : (
                  <p className="muted small">Vaga aberta.</p>
                )}
                <span className="muted small">Disponíveis:</span>
                {candidates.map((c) => (
                  <div key={c.id} className="staff-card">
                    <strong>{c.name}</strong>
                    <span className="stars">{'★'.repeat(c.level)}</span>
                    <span className="muted small">{STAFF_INFO[role].effect(c.level)}</span>
                    <button className="btn small primary" onClick={() => onChange(hireStaff(game, c.id))}>
                      {current ? 'Substituir' : 'Contratar'} · {money(c.salary)}/mês
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h3>Movimentações</h3>
        {(game.finances ?? []).length ? (
          <table>
            <tbody>
              {(game.finances ?? []).map((f, i) => (
                <tr key={i}>
                  <td className="muted small">
                    {f.season} · S{f.week}
                  </td>
                  <td>{f.label}</td>
                  <td className={f.amount >= 0 ? 'up' : 'down'}>
                    {f.amount >= 0 ? '+' : '-'}
                    {money(Math.abs(f.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small">Nenhuma movimentação ainda.</p>
        )}
      </section>
    </>
  );
}
