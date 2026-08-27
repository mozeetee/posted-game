import { useEffect } from 'react'
import { BZ, PLAYER_COLORS } from './board'

// Money formatting with a thin space so big numbers stay readable.
export const money = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US')

export const playerColor = (players, id) => {
  const i = players.findIndex(p => p.player_id === id)
  return i >= 0 ? PLAYER_COLORS[i % PLAYER_COLORS.length] : BZ.muted
}
export const playerName = (players, id) => players.find(p => p.player_id === id)?.name || '—'

// ── Teams ─────────────────────────────────────────────────────────────────
// A game is in team mode when config.settings.teams has names. Score stays
// per player; a team's total is the sum of its members.
export const teamOf = (players, id) => players.find(p => p.player_id === id)?.team || null
export const teamColor = (teams, team) => {
  const i = teams ? teams.indexOf(team) : -1
  return i >= 0 ? PLAYER_COLORS[i % PLAYER_COLORS.length] : BZ.muted
}
export function teamStandings(players, teams) {
  return teams.map(t => {
    const members = players.filter(p => (p.team || null) === t)
    return { team: t, total: members.reduce((s, p) => s + (p.score || 0), 0), members }
  })
}
// What to call whoever holds board control (a team name, or a player's name).
export const controlLabel = (players, control, teams) => {
  if (!control || control === 'host') return null
  const t = teamOf(players, control)
  return teams && teams.length && t ? t : playerName(players, control)
}

// One-time stylesheet for the board grid, card-flip reveal, buzz pulse, and
// lockout bar. Respects prefers-reduced-motion. Fonts come from the app's
// existing Fredoka/Nunito setup.
export function injectBuzzerCss() {
  useEffect(() => {
    if (document.getElementById('bz-css')) return
    const el = document.createElement('style')
    el.id = 'bz-css'
    el.textContent = CSS
    document.head.appendChild(el)
  }, [])
}

const CSS = `
.bz{--paper:${BZ.paper};--ink:${BZ.ink};--muted:${BZ.muted};--gold:${BZ.gold};--screen:${BZ.screen};--cream:${BZ.cream};
  font-family:'Nunito Sans',system-ui,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.bz-fd{font-family:'Fredoka','Nunito Sans',system-ui,sans-serif}
.bz-num{font-variant-numeric:tabular-nums}
.bz-board{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
.bz-col{display:flex;flex-direction:column;gap:10px;min-width:0}
.bz-cat{font-family:'Fredoka',sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:.02em;
  text-align:center;color:var(--cream);background:${BZ.sageDeep};border-radius:12px;padding:12px 6px;
  line-height:1.1;display:flex;align-items:center;justify-content:center;min-height:64px}
.bz-tile{font-family:'Fredoka',sans-serif;font-weight:600;text-align:center;color:${BZ.gold};
  background:linear-gradient(160deg,${BZ.screen2},${BZ.screen});border:1px solid ${BZ.screenLine};
  border-radius:12px;display:flex;align-items:center;justify-content:center;min-height:74px;
  text-shadow:0 1px 0 rgba(0,0,0,.4)}
.bz-tile.done{background:#241b28;border-color:#33283a;color:transparent;box-shadow:none}
.bz-tile.live{cursor:pointer;transition:transform .1s ease,box-shadow .1s ease}
.bz-tile.live:hover{transform:translateY(-2px);box-shadow:0 8px 20px -10px rgba(0,0,0,.6)}
.bz-tile:focus-visible{outline:3px solid ${BZ.gold};outline-offset:2px}
.bz-flip{animation:bzflip .38s cubic-bezier(.2,.7,.2,1) both}
@keyframes bzflip{from{transform:perspective(900px) rotateX(88deg);opacity:0}to{transform:none;opacity:1}}
.bz-buzz{animation:bzpulse 1s ease-in-out infinite}
@keyframes bzpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
.bz-lockbar{height:6px;border-radius:6px;background:#4d3a54;overflow:hidden}
.bz-lockbar>i{display:block;height:100%;background:${BZ.gold};animation:bzlock var(--ms,1000ms) linear forwards}
@keyframes bzlock{from{width:0}to{width:100%}}
@media (prefers-reduced-motion: reduce){
  .bz-flip,.bz-buzz{animation:none}
  .bz-lockbar>i{animation:none;width:100%}
}
`

// Compact live scoreboard used on the TV + host screens. The current
// board-controller gets a gold ring + a small "picks next" tag.
export function Scoreboard({ players, control, dark = false, teams = null }) {
  // Team mode: one chip per team, showing its total and members' initials.
  if (teams && teams.length) {
    const controlTeam = teamOf(players, control)
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {teamStandings(players, teams).map(({ team, total, members }) => {
          const col = teamColor(teams, team)
          const inControl = team === controlTeam
          return (
            <div key={team} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px 9px 12px', borderRadius: 30,
              background: dark ? '#3a2b42' : '#fff', border: `2px solid ${inControl ? BZ.gold : (dark ? '#4d3a54' : BZ.line)}` }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: col, flex: 'none' }} />
              <span style={{ fontWeight: 800, color: dark ? BZ.cream : BZ.ink }}>{team}</span>
              <span style={{ display: 'flex' }}>
                {members.map(m => (
                  <span key={m.player_id} title={m.name} style={{ width: 22, height: 22, borderRadius: '50%',
                    background: col, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 11,
                    marginLeft: -6, border: `1.5px solid ${dark ? '#3a2b42' : '#fff'}` }}>
                    {m.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </span>
              <span className="bz-num bz-fd" style={{ fontWeight: 600, fontSize: 18, marginLeft: 4,
                color: total < 0 ? BZ.clay : (dark ? BZ.gold : BZ.goldDeep) }}>{money(total)}</span>
              {inControl && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em',
                textTransform: 'uppercase', color: BZ.goldDeep }}>picks</span>}
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
      {players.length === 0 && (
        <div style={{ color: dark ? '#b7a9c0' : BZ.muted, fontSize: 15 }}>Waiting for players to join…</div>
      )}
      {players.map((p, i) => {
        const col = PLAYER_COLORS[i % PLAYER_COLORS.length]
        const inControl = control === p.player_id
        return (
          <div key={p.player_id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 15px 9px 11px',
            borderRadius: 30, background: dark ? '#3a2b42' : '#fff',
            border: `2px solid ${inControl ? BZ.gold : (dark ? '#4d3a54' : BZ.line)}`,
          }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', background: col, color: '#fff',
              display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, flex: 'none' }}>
              {p.name.trim().slice(0, 1).toUpperCase()}
            </span>
            <span style={{ fontWeight: 700, color: dark ? BZ.cream : BZ.ink }}>{p.name}</span>
            <span className="bz-num bz-fd" style={{ fontWeight: 600, fontSize: 18,
              color: p.score < 0 ? BZ.clay : (dark ? BZ.gold : BZ.goldDeep) }}>{money(p.score)}</span>
            {inControl && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em',
              textTransform: 'uppercase', color: BZ.goldDeep }}>picks</span>}
          </div>
        )
      })}
    </div>
  )
}
