import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { useBuzzerGame, currentClue } from './useBuzzerGame'
import { injectBuzzerCss, Scoreboard, playerColor, playerName, money, teamOf, teamColor, teamStandings, bzTheme, useBzFont } from './bzShared'
import { BZ } from './board'

// The cast-to-TV screen. Display only — no controls, no audio (the host runs
// sound from their controller). Reacts live to state.
export default function BuzzerTV({ gameId }) {
  injectBuzzerCss()
  const { config, state, players, notFound } = useBuzzerGame({ gameId, role: 'tv' })
  const [, force] = useState(0)
  useBzFont(config?.settings?.theme?.font)

  // Flip the "get ready" lockout to "buzzers open" the moment open_at passes.
  useEffect(() => {
    if (state?.phase !== 'reading' || !state.open_at) return
    const ms = new Date(state.open_at).getTime() - Date.now()
    if (ms <= 0) return
    const t = setTimeout(() => force(n => n + 1), ms + 30)
    return () => clearTimeout(t)
  }, [state?.phase, state?.open_at])

  if (notFound) return <Center>That game link isn’t a buzzer game.</Center>
  if (!config || !state) return <Center>Loading the board…</Center>

  const clue = currentClue(config, state)
  const open = state.phase === 'reading' && Date.now() >= new Date(state.open_at).getTime()
  const teams = config.settings?.teams || null
  const theme = bzTheme(config)

  const spooky = theme.decor === 'halloween'

  return (
    <div className="bz" style={{ position: 'relative', minHeight: '100vh', background: BZ.paper, ...theme.vars,
      display: 'flex', flexDirection: 'column', padding: '28px clamp(16px,3vw,44px)', gap: 22, overflow: 'hidden' }}>
      {spooky && state.phase === 'lobby' && <HalloweenDecor />}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div className="bz-fd" style={{ fontWeight: 600, fontSize: 'clamp(26px,3vw,44px)', color: 'var(--bz-accent)' }}>
          {theme.name}
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'grid', placeItems: 'center' }}>
        {state.phase === 'lobby' && <Lobby config={config} players={players} gameId={gameId} spooky={spooky} />}
        {state.phase === 'select' && <Board config={config} state={state} players={players} />}
        {state.phase === 'over' && <GameOver players={players} teams={teams} />}
        {state.phase === 'armed' && clue && (
          <ArmedCard category={config.board.categories[state.cur_cat]?.name} v={clue.v} />
        )}
        {clue && ['reading', 'buzzed'].includes(state.phase) && (
          <ClueCard clue={clue} state={state} players={players} open={open} teams={teams} />
        )}
        {['dd_assign', 'dd_wager', 'dd_answer'].includes(state.phase) && (
          <DailyDouble clue={clue} state={state} players={players} />
        )}
        {state.phase === 'reveal' && <Reveal state={state} players={players} />}
        {['final_wager', 'final_answer', 'final_reveal'].includes(state.phase) && (
          <FinalTV state={state} players={players} final={config.board.final} />
        )}
      </div>

      {/* Scoreboard is hidden in the lobby — players already show as join chips
          there; showing them twice is just noise until the game starts. */}
      {state.phase !== 'lobby' && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Scoreboard players={players} control={state.control} dark={false} teams={teams} />
        </div>
      )}
    </div>
  )
}

// Slow drifting Halloween emoji behind the lobby — some life on the screen
// guests stare at while they join. Hidden under prefers-reduced-motion (CSS).
function HalloweenDecor() {
  const bits = [
    { e: '🎃', left: '6%', size: 54, dur: 15, delay: 0 },
    { e: '👻', left: '20%', size: 40, dur: 19, delay: 4 },
    { e: '🦇', left: '38%', size: 34, dur: 13, delay: 2 },
    { e: '🕸️', left: '52%', size: 44, dur: 21, delay: 7 },
    { e: '🍬', left: '68%', size: 32, dur: 16, delay: 1 },
    { e: '🦇', left: '82%', size: 38, dur: 12, delay: 5 },
    { e: '🎃', left: '93%', size: 46, dur: 18, delay: 3 },
  ]
  return (
    <div className="bz-decor" aria-hidden="true">
      {bits.map((b, i) => (
        <span key={i} style={{ left: b.left, fontSize: b.size,
          animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}>{b.e}</span>
      ))}
    </div>
  )
}

function Lobby({ config, players, gameId }) {
  const joinUrl = `${location.origin}/?game=${gameId}&type=buzzer`
  const joinHost = location.host
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 480, margin: 1, color: { dark: '#2a1f30', light: '#ffffff' } })
      .then(setQr).catch(() => {})
  }, [joinUrl])
  return (
    <div style={{ width: '100%', maxWidth: 1100, textAlign: 'center', display: 'flex', flexDirection: 'column',
      gap: 'clamp(18px,3vh,34px)', alignItems: 'center' }}>
      {config.settings?.welcome
        ? <div className="bz-fd" style={{ color: BZ.ink, fontWeight: 600, fontSize: 'clamp(26px,3.6vw,52px)', whiteSpace: 'pre-wrap', lineHeight: 1.2 }}>{config.settings.welcome}</div>
        : <div className="bz-fd" style={{ color: 'var(--bz-accent)', fontWeight: 600, fontSize: 'clamp(30px,4.4vw,64px)' }}>Get ready to play!</div>}

      {/* Join card: scan the QR, or type the short code at <host>/play */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(20px,4vw,56px)', alignItems: 'center', justifyContent: 'center',
        background: '#fff', border: `1px solid ${BZ.line}`, borderRadius: 28, padding: 'clamp(20px,3vw,40px)' }}>
        {qr && <img src={qr} alt="Scan to join" width={300} height={300}
          style={{ width: 'clamp(200px,22vw,340px)', height: 'auto', borderRadius: 16, display: 'block' }} />}
        <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: BZ.muted, fontWeight: 800, fontSize: 'clamp(16px,1.6vw,24px)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Scan to join</div>
          <div style={{ color: BZ.muted, fontWeight: 700, fontSize: 'clamp(15px,1.4vw,22px)' }}>
            or go to <span style={{ color: BZ.ink, fontWeight: 800 }}>{joinHost}/play</span> and enter:
          </div>
          <div className="bz-fd bz-num" style={{ color: 'var(--bz-accent)', fontWeight: 700, lineHeight: 1,
            fontSize: 'clamp(48px,8vw,128px)', letterSpacing: '.06em' }}>{gameId}</div>
        </div>
      </div>

      {/* Players who have joined (shown once — the score bar is hidden until play) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(10px,1.2vw,16px)', justifyContent: 'center' }}>
        {players.length === 0
          ? <div style={{ color: BZ.muted, fontSize: 'clamp(16px,1.6vw,24px)', fontWeight: 700 }}>Waiting for players…</div>
          : players.map(p => (
              <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff',
                border: `1px solid ${BZ.line}`, borderRadius: 40, padding: 'clamp(8px,1vw,12px) clamp(16px,1.6vw,26px) clamp(8px,1vw,12px) clamp(8px,0.8vw,12px)' }}>
                <span style={{ width: 'clamp(34px,3vw,52px)', height: 'clamp(34px,3vw,52px)', borderRadius: '50%', background: p.color || BZ.plum, color: '#fff',
                  display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 'clamp(16px,1.6vw,24px)', flex: 'none' }}>{p.name.trim().slice(0, 1).toUpperCase()}</span>
                <span style={{ fontWeight: 700, color: BZ.ink, fontSize: 'clamp(18px,1.8vw,28px)' }}>{p.name}</span>
              </div>
            ))}
      </div>
      <div style={{ color: BZ.muted, fontWeight: 700, fontSize: 'clamp(15px,1.5vw,22px)' }}>The host will start the game soon…</div>
    </div>
  )
}

function Board({ config, state, players }) {
  const done = new Set(state.done || [])
  const first = done.size === 0
  const picker = state.control === 'host' ? 'The host' : playerName(players, state.control)
  return (
    <div style={{ width: '100%', maxWidth: 1300 }}>
      <div style={{ textAlign: 'center', marginBottom: 16, color: BZ.ink, fontSize: 'clamp(18px,2vw,30px)', fontWeight: 700 }}>
        <span className="bz-fd" style={{ color: 'var(--bz-accent)', fontWeight: 600 }}>{picker}</span>
        {first ? ' picks the first clue' : ' picks the next clue'}
        {state.control !== 'host' && <span style={{ color: BZ.muted, fontWeight: 600 }}> — from their phone</span>}
      </div>
      <div className="bz-board">
        {config.board.categories.map((cat, ci) => (
          <div className="bz-col" key={ci}>
            <div className="bz-cat" style={{ fontSize: 'clamp(11px,1.1vw,15px)' }}>{cat.name}</div>
            {cat.clues.map((clue, ii) => {
              const isDone = done.has(`${ci}-${ii}`)
              return (
                <div key={ii} className={`bz-tile${isDone ? ' done' : ''}`}
                  style={{ fontSize: 'clamp(20px,2.4vw,34px)' }}>
                  {isDone ? '' : money(clue.v)}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function ClueCard({ clue, state, players, open, teams }) {
  return (
    <div className="bz-flip" key={`${state.cur_cat}-${state.cur_idx}-${state.seq}`}
      style={{ width: '100%', maxWidth: 1000, background: `linear-gradient(160deg,${BZ.screen2},${BZ.screen})`,
        border: `1px solid ${BZ.screenLine}`, borderRadius: 26, padding: 'clamp(28px,5vw,64px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, textAlign: 'center' }}>
      <div className="bz-fd" style={{ color: BZ.gold, fontWeight: 600, fontSize: 22, letterSpacing: '.02em' }}>
        {money(clue.v)}
      </div>
      <div className="bz-fd" style={{ color: BZ.cream, fontWeight: 500, fontSize: 'clamp(24px,3.6vw,46px)',
        lineHeight: 1.28, textWrap: 'balance' }}>{clue.clue}</div>
      {state.phase === 'buzzed'
        ? <BuzzedBanner state={state} players={players} teams={teams} />
        : <div style={{ width: 'min(420px,80%)' }}>
            {open
              ? <div className="bz-buzz bz-fd" style={{ color: BZ.gold, fontWeight: 600, fontSize: 26 }}>
                  Buzzers are open — buzz in!
                </div>
              : <>
                  <div style={{ color: '#b7a9c0', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Get ready…</div>
                  <div className="bz-lockbar" style={{ '--ms': `${state.lockout_ms}ms` }}><i /></div>
                </>}
          </div>}
    </div>
  )
}

function BuzzedBanner({ state, players, teams }) {
  const t = teams && teams.length ? teamOf(players, state.winner) : null
  const col = t ? teamColor(teams, t) : playerColor(players, state.winner)
  return (
    <div className="bz-fd" style={{ background: col, color: '#fff', borderRadius: 18, padding: '14px 30px',
      fontWeight: 600, fontSize: 'clamp(20px,2.6vw,30px)' }}>
      {t ? `${playerName(players, state.winner)} · ${t}` : playerName(players, state.winner)} buzzed in!
    </div>
  )
}

function DailyDouble({ clue, state, players }) {
  const showClue = state.phase === 'dd_answer'
  return (
    <div style={{ width: '100%', maxWidth: 1000, background: `linear-gradient(160deg,var(--bz-accent),${BZ.screen})`,
      border: `1px solid ${BZ.screenLine}`, borderRadius: 26, padding: 'clamp(28px,5vw,64px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center' }}>
      <div className="bz-fd bz-buzz" style={{ color: BZ.gold, fontWeight: 600, fontSize: 'clamp(30px,4vw,52px)' }}>
        Daily Double!
      </div>
      <div style={{ color: BZ.cream, fontSize: 20, fontWeight: 700 }}>
        {playerName(players, state.dd_player)} landed on it
      </div>
      {showClue
        ? <div className="bz-fd" style={{ color: BZ.cream, fontWeight: 500, fontSize: 'clamp(22px,3.2vw,40px)',
            lineHeight: 1.28, textWrap: 'balance' }}>{clue?.clue}</div>
        : <div style={{ color: '#e6d4ee', fontSize: 16 }}>Placing a secret wager…</div>}
    </div>
  )
}

function Reveal({ state, players }) {
  const r = state.reveal || {}
  const got = r.who
  return (
    <div style={{ width: '100%', maxWidth: 900, background: `linear-gradient(160deg,${BZ.screen2},${BZ.screen})`,
      border: `1px solid ${BZ.screenLine}`, borderRadius: 26, padding: 'clamp(28px,5vw,60px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
      <div style={{ color: '#b7a9c0', fontSize: 14, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase' }}>
        The answer
      </div>
      <div className="bz-fd" style={{ color: BZ.cream, fontWeight: 600, fontSize: 'clamp(26px,3.4vw,44px)', textWrap: 'balance' }}>
        {r.answer}
      </div>
      <div className="bz-fd" style={{ fontSize: 20, fontWeight: 600,
        color: got ? BZ.sage : '#b7a9c0' }}>
        {got ? `${playerName(players, got)} nailed it  +${money(r.delta).replace('$', '$')}` : 'Nobody got it'}
      </div>
    </div>
  )
}

function GameOver({ players, teams }) {
  const ranked = teams && teams.length
    ? teamStandings(players, teams).map(t => ({ id: t.team, name: t.team, score: t.total })).sort((a, b) => b.score - a.score)
    : [...players].sort((a, b) => b.score - a.score).map(p => ({ id: p.player_id, name: p.name, score: p.score }))
  const top = ranked[0]
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
      <div className="bz-fd" style={{ fontSize: 'clamp(30px,4vw,52px)', fontWeight: 600, color: 'var(--bz-accent)' }}>
        {top ? `${top.name} wins!` : 'Game over'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 320 }}>
        {ranked.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
            background: '#fff', border: `1px solid ${BZ.line}`, borderRadius: 14, padding: '12px 18px' }}>
            <span style={{ width: 26, textAlign: 'center', fontWeight: 800 }}>{['🏆', '🥈', '🥉'][i] || i + 1}</span>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 700 }}>{r.name}</span>
            <span className="bz-num bz-fd" style={{ fontWeight: 600, color: r.score < 0 ? BZ.clay : BZ.goldDeep }}>
              {money(r.score)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FinalTV({ state, players, final }) {
  const wagered = players.filter(p => p.final_wager != null).length
  const answered = players.filter(p => p.final_answer != null).length
  const panel = children => (
    <div style={{ width: '100%', maxWidth: 1000, background: `linear-gradient(160deg,var(--bz-accent),${BZ.screen})`,
      border: `1px solid ${BZ.screenLine}`, borderRadius: 26, padding: 'clamp(28px,5vw,64px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center' }}>
      <div className="bz-fd bz-buzz" style={{ color: BZ.gold, fontWeight: 600, fontSize: 'clamp(26px,3.4vw,44px)' }}>Final Jeopardy</div>
      {children}
    </div>
  )
  if (state.phase === 'final_wager')
    return panel(<>
      <div className="bz-fd" style={{ color: BZ.cream, fontWeight: 600, fontSize: 'clamp(26px,3.4vw,44px)' }}>{final?.category}</div>
      <div style={{ color: '#e6d4ee', fontSize: 18, fontWeight: 700 }}>Placing secret wagers… ({wagered}/{players.length})</div>
    </>)
  if (state.phase === 'final_answer')
    return panel(<>
      <div style={{ color: BZ.gold, fontSize: 15, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' }}>{final?.category}</div>
      <div className="bz-fd" style={{ color: BZ.cream, fontWeight: 500, fontSize: 'clamp(24px,3.4vw,44px)', lineHeight: 1.28, textWrap: 'balance' }}>{final?.clue}</div>
      <div style={{ color: '#e6d4ee', fontSize: 18, fontWeight: 700 }}>Answers locking in… ({answered}/{players.length})</div>
    </>)
  // Nothing shows until the host reveals a specific player (final_show).
  const shown = state.final_show ? players.find(p => p.player_id === state.final_show) : null
  if (!shown) return panel(<div style={{ color: '#e6d4ee', fontSize: 20, fontWeight: 700 }}>The answers are in — here we go…</div>)
  return panel(
    <div className="bz-flip" key={shown.player_id} style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
      <div className="bz-fd" style={{ color: BZ.cream, fontWeight: 600, fontSize: 'clamp(24px,3vw,38px)' }}>{shown.name}</div>
      <div style={{ color: '#b7a9c0', fontSize: 14, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase' }}>wrote</div>
      <div className="bz-fd" style={{ color: BZ.cream, fontWeight: 500, fontSize: 'clamp(26px,3.6vw,48px)', textWrap: 'balance' }}>{shown.final_answer || '—'}</div>
      <div style={{ color: BZ.gold, fontSize: 18, fontWeight: 700 }}>Wagered {money(shown.final_wager || 0)}</div>
    </div>
  )
}

// The "get ready" card shown while a clue is armed but not yet read to the room.
function ArmedCard({ category, v }) {
  return (
    <div style={{ width: '100%', maxWidth: 900, background: `linear-gradient(160deg,${BZ.screen2},${BZ.screen})`,
      border: `1px solid ${BZ.screenLine}`, borderRadius: 26, padding: 'clamp(32px,6vw,72px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
      <div className="bz-fd" style={{ color: BZ.gold, fontWeight: 600, fontSize: 'clamp(30px,4vw,52px)' }}>{category} · {money(v)}</div>
      <div className="bz-buzz" style={{ color: '#b7a9c0', fontSize: 20, fontWeight: 700 }}>Get ready…</div>
    </div>
  )
}

const Center = ({ children }) => (
  <div className="bz" style={{ minHeight: '100vh', background: BZ.paper, display: 'grid', placeItems: 'center',
    color: BZ.muted, fontSize: 18, padding: 24, textAlign: 'center' }}>{children}</div>
)
