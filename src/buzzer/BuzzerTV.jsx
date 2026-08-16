import { useState, useEffect } from 'react'
import { useBuzzerGame, currentClue } from './useBuzzerGame'
import { injectBuzzerCss, Scoreboard, playerColor, playerName, money } from './bzShared'
import { BZ } from './board'

// The cast-to-TV screen. Display only — no controls. Reacts live to state.
export default function BuzzerTV({ gameId }) {
  injectBuzzerCss()
  const { config, state, players, notFound } = useBuzzerGame({ gameId, role: 'tv' })
  const [, force] = useState(0)

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

  return (
    <div className="bz" style={{ minHeight: '100vh', background: BZ.paper,
      display: 'flex', flexDirection: 'column', padding: '28px clamp(16px,3vw,44px)', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div className="bz-fd" style={{ fontWeight: 600, fontSize: 26, color: BZ.plum }}>
          Buzzed In <span style={{ color: BZ.muted, fontSize: 15, fontWeight: 700 }}>· {config.title || 'Game show'}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: BZ.muted }}>
          on the big screen
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
        {state.phase === 'select' && <Board config={config} state={state} />}
        {state.phase === 'over' && <GameOver players={players} />}
        {clue && ['reading', 'buzzed'].includes(state.phase) && (
          <ClueCard clue={clue} state={state} players={players} open={open} />
        )}
        {['dd_assign', 'dd_wager', 'dd_answer'].includes(state.phase) && (
          <DailyDouble clue={clue} state={state} players={players} />
        )}
        {state.phase === 'reveal' && <Reveal state={state} players={players} />}
      </div>

      <Scoreboard players={players} control={state.control} dark={false} />
    </div>
  )
}

function Board({ config, state }) {
  const done = new Set(state.done || [])
  return (
    <div style={{ width: '100%', maxWidth: 1300 }}>
      <div style={{ textAlign: 'center', marginBottom: 16, color: BZ.muted, fontSize: 17, fontWeight: 700 }}>
        {state.control === 'host'
          ? 'Host, pick the first clue.'
          : 'Board control — pick a clue from your phone.'}
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

function ClueCard({ clue, state, players, open }) {
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
        ? <BuzzedBanner state={state} players={players} />
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

function BuzzedBanner({ state, players }) {
  const col = playerColor(players, state.winner)
  return (
    <div className="bz-fd" style={{ background: col, color: '#fff', borderRadius: 18, padding: '14px 30px',
      fontWeight: 600, fontSize: 'clamp(20px,2.6vw,30px)' }}>
      {playerName(players, state.winner)} buzzed in!
    </div>
  )
}

function DailyDouble({ clue, state, players }) {
  const showClue = state.phase === 'dd_answer'
  return (
    <div style={{ width: '100%', maxWidth: 1000, background: `linear-gradient(160deg,${BZ.plum},${BZ.screen})`,
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

function GameOver({ players }) {
  const ranked = [...players].sort((a, b) => b.score - a.score)
  const top = ranked[0]
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
      <div className="bz-fd" style={{ fontSize: 'clamp(30px,4vw,52px)', fontWeight: 600, color: BZ.plum }}>
        {top ? `${top.name} wins!` : 'Game over'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 320 }}>
        {ranked.map((p, i) => (
          <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 12,
            background: '#fff', border: `1px solid ${BZ.line}`, borderRadius: 14, padding: '12px 18px' }}>
            <span style={{ width: 26, textAlign: 'center', fontWeight: 800 }}>{['🏆', '🥈', '🥉'][i] || i + 1}</span>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 700 }}>{p.name}</span>
            <span className="bz-num bz-fd" style={{ fontWeight: 600, color: p.score < 0 ? BZ.clay : BZ.goldDeep }}>
              {money(p.score)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const Center = ({ children }) => (
  <div className="bz" style={{ minHeight: '100vh', background: BZ.paper, display: 'grid', placeItems: 'center',
    color: BZ.muted, fontSize: 18, padding: 24, textAlign: 'center' }}>{children}</div>
)
