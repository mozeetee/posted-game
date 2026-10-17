import { useState, useEffect } from 'react'
import { useBuzzerGame, currentClue } from './useBuzzerGame'
import { injectBuzzerCss, Scoreboard, playerColor, playerName, money, teamStandings, bzTheme, useBzFont } from './bzShared'
import { BZ, PLAYER_COLORS } from './board'

// The host's controller. Runs the flow: pick (when in control), judge buzz-ins,
// resolve Daily Doubles, reveal, advance. Sees the answers; players never do.
// The host can optionally "play along" — join the roster and buzz in too.
export default function BuzzerHost({ gameId, hostKey }) {
  injectBuzzerCss()
  const [hostPlayer, setHostPlayer] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`bzhost:${gameId}`) || 'null') } catch { return null }
  })
  const { config, state, players, notFound, actions } = useBuzzerGame({
    gameId, role: 'host', hostKey, playerId: hostPlayer?.player_id, playerKey: hostPlayer?.player_key,
  })
  useBzFont(config?.settings?.theme?.font)
  // Flip "get ready" → open the instant the lockout passes (wall-clock, not a
  // state change), so the host's own buzzer lights up on time.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (state?.phase !== 'reading' || !state.open_at) return
    const ms = new Date(state.open_at).getTime() - Date.now()
    if (ms <= 0) return
    const t = setTimeout(() => forceTick(n => n + 1), ms + 40)
    return () => clearTimeout(t)
  }, [state?.phase, state?.open_at])

  if (notFound) return <Wrap>That game isn’t a buzzer game.</Wrap>
  if (!config || !state) return <Wrap>Loading…</Wrap>

  const clue = currentClue(config, state)
  const teams = config.settings?.teams || null
  const theme = bzTheme(config)
  const open = state.phase === 'reading' && state.open_at && Date.now() >= new Date(state.open_at).getTime()
  const iControlAsPlayer = hostPlayer && state.control === hostPlayer.player_id
  const iMissed = hostPlayer && (state.missed || []).includes(hostPlayer.player_id)
  const joinAsHost = async (name, color) => {
    const r = await actions.join(name, null, color)
    if (r?.player_id) {
      const me = { player_id: r.player_id, player_key: r.player_key, name }
      sessionStorage.setItem(`bzhost:${gameId}`, JSON.stringify(me))
      setHostPlayer(me)
    }
  }
  const btn = (bg) => ({ border: 0, borderRadius: 14, padding: '15px 20px', fontWeight: 800, fontSize: 16,
    color: '#fff', background: bg, cursor: 'pointer', fontFamily: 'inherit' })

  return (
    <div className="bz" style={{ minHeight: '100vh', background: BZ.paper, ...theme.vars, padding: 'clamp(14px,3vw,28px)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div className="bz-fd" style={{ fontWeight: 600, fontSize: 22, color: 'var(--bz-accent)' }}>
            {theme.name} <span style={{ color: BZ.muted, fontSize: 14, fontWeight: 700 }}>· host</span>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {['select', 'over'].includes(state.phase) && (
              <button onClick={() => { if (confirm('Start Final Jeopardy now?')) actions.finalStart() }}
                style={{ background: BZ.gold, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13,
                  fontWeight: 800, borderRadius: 10, padding: '8px 14px', fontFamily: 'inherit' }}>
                Final Jeopardy
              </button>
            )}
            <button onClick={() => { if (confirm('Reset scores and the whole board?')) actions.reset() }}
              style={{ background: 'none', border: 'none', color: BZ.muted, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              Reset game
            </button>
          </div>
        </div>

        <Scoreboard players={players} control={state.control} dark={false} teams={teams} />

        <div style={{ background: '#fff', border: `1px solid ${BZ.line}`, borderRadius: 18, padding: 20 }}>
          {/* LOBBY — wait for players, then start */}
          {state.phase === 'lobby' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
              <Label>Lobby · {players.length} {players.length === 1 ? 'player' : 'players'} in</Label>
              {config.settings?.welcome && (
                <div style={{ color: BZ.muted, fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{config.settings.welcome}</div>
              )}
              {hostPlayer
                ? <div style={{ fontSize: 13, color: BZ.sageDeep, fontWeight: 800 }}>✓ You’re playing too, as {hostPlayer.name}</div>
                : <HostJoin onJoin={joinAsHost} />}
              {players.length === 0
                ? <Waiting>Send the players’ buzzer link — waiting for people to join…</Waiting>
                : <button style={btn('var(--bz-accent)')} onClick={() => actions.start()}>Start game →</button>}
            </div>
          )}

          {/* SELECT */}
          {state.phase === 'select' && (
            (state.control === 'host' || iControlAsPlayer)
              ? <>
                  <Label>{iControlAsPlayer ? 'You’ve got control — pick a clue' : 'Pick a clue for the room'}</Label>
                  <MiniBoard config={config} state={state} onPick={(c, i) => actions.pick(c, i)} />
                </>
              : <Waiting>{playerName(players, state.control)} is picking a clue…</Waiting>
          )}

          {/* ARMED — clue chosen; you read it, then reveal it to the room */}
          {clue && state.phase === 'armed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Label>Read this, then show it on the screen</Label>
              <ClueForHost clue={clue} />
              <button style={btn('var(--bz-accent)')} onClick={() => actions.showClue()}>📺 Show clue on the TV &amp; open buzzers</button>
            </div>
          )}

          {/* READING / BUZZED */}
          {clue && ['reading', 'buzzed'].includes(state.phase) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ClueForHost clue={clue} />
              {state.phase === 'reading'
                ? <>
                    {hostPlayer && !iMissed && (open
                      ? <button className="bz-buzz" onClick={() => actions.buzz()}
                          style={{ ...btn(playerColor(players, hostPlayer.player_id)), minHeight: 72,
                            fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 'clamp(28px,8vw,40px)' }}>BUZZ</button>
                      : <div style={{ textAlign: 'center', color: BZ.muted, fontWeight: 700 }}>Get ready to buzz…</div>)}
                    {hostPlayer && iMissed && <div style={{ textAlign: 'center', color: BZ.muted, fontWeight: 700 }}>You’re out this clue</div>}
                    <Waiting>{hostPlayer ? 'Buzzers are live.' : 'Buzzers are live — waiting for a buzz-in.'}</Waiting>
                    <button style={btn(BZ.muted)} onClick={() => actions.pass()}>Nobody buzzed — reveal answer</button>
                  </>
                : <>
                    <div className="bz-fd" style={{ textAlign: 'center', fontWeight: 600, fontSize: 20,
                      color: playerColor(players, state.winner) }}>
                      {playerName(players, state.winner)} buzzed in
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <button style={btn(BZ.sageDeep)} onClick={() => actions.judge(true)}>Correct</button>
                      <button style={btn(BZ.clay)} onClick={() => actions.judge(false)}>Incorrect</button>
                    </div>
                  </>}
            </div>
          )}

          {/* DAILY DOUBLE — host assigns who answers when the host held control */}
          {state.phase === 'dd_assign' && (
            <>
              <Label>Daily Double! Who landed on it?</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {players.map((p, i) => (
                  <button key={p.player_id} onClick={() => actions.assignDD(p.player_id)}
                    style={{ ...btn(p.color || PLAYER_COLORS[i % PLAYER_COLORS.length]) }}>{p.name}</button>
                ))}
              </div>
            </>
          )}
          {state.phase === 'dd_wager' && (
            <Waiting>{playerName(players, state.dd_player)} is entering a secret wager…</Waiting>
          )}
          {state.phase === 'dd_answer' && clue && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="bz-fd" style={{ textAlign: 'center', color: BZ.plum, fontWeight: 600 }}>
                Daily Double · {playerName(players, state.dd_player)} wagered {money(state.dd_wager)}
              </div>
              <ClueForHost clue={clue} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button style={btn(BZ.sageDeep)} onClick={() => actions.judge(true)}>Correct</button>
                <button style={btn(BZ.clay)} onClick={() => actions.judge(false)}>Incorrect</button>
              </div>
            </div>
          )}

          {/* REVEAL */}
          {state.phase === 'reveal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
              <div style={{ color: BZ.muted, fontSize: 13, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase' }}>Answer</div>
              <div className="bz-fd" style={{ fontWeight: 600, fontSize: 24 }}>{state.reveal?.answer}</div>
              <button style={btn('var(--bz-accent)')} onClick={() => actions.next()}>Next clue →</button>
            </div>
          )}

          {/* FINAL JEOPARDY */}
          {state.phase === 'final_wager' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
              <Label>Final Jeopardy · {config.board.final?.category}</Label>
              <Waiting>Players are entering secret wagers… ({players.filter(p => p.final_wager != null).length}/{players.length})</Waiting>
            </div>
          )}
          {state.phase === 'final_answer' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Label>Final Jeopardy · {config.board.final?.category}</Label>
              <div style={{ background: BZ.paper2, borderRadius: 14, padding: 16, textAlign: 'center' }}>
                <div className="bz-fd" style={{ fontWeight: 500, fontSize: 19, lineHeight: 1.3 }}>{config.board.final?.clue}</div>
                <div style={{ fontSize: 14, color: BZ.sageDeep, fontWeight: 800, marginTop: 8 }}>Answer: {config.board.final?.answer}</div>
              </div>
              <Waiting>Players are writing answers… ({players.filter(p => p.final_answer != null).length}/{players.length})</Waiting>
            </div>
          )}
          {state.phase === 'final_reveal' && (() => {
            const done = new Set(state.final_done || [])
            const cur = players.filter(p => !done.has(p.player_id)).sort((a, b) => a.score - b.score)[0]
            if (!cur) return null
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
                <Label>Final reveal · lowest score first</Label>
                <div className="bz-fd" style={{ fontWeight: 600, fontSize: 20, color: playerColor(players, cur.player_id) }}>{cur.name}</div>
                <div style={{ fontSize: 12, color: BZ.muted, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' }}>wrote</div>
                <div className="bz-fd" style={{ fontWeight: 500, fontSize: 22 }}>{cur.final_answer || '—'}</div>
                <div style={{ color: BZ.muted, fontWeight: 700 }}>Wagered {money(cur.final_wager || 0)} · has {money(cur.score)}</div>
                {state.final_show !== cur.player_id
                  ? <button style={btn('var(--bz-accent)')} onClick={() => actions.finalShow(cur.player_id)}>📺 Reveal {cur.name}’s answer on the screen</button>
                  : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <button style={btn(BZ.sageDeep)} onClick={() => actions.finalJudge(cur.player_id, true)}>Correct</button>
                      <button style={btn(BZ.clay)} onClick={() => actions.finalJudge(cur.player_id, false)}>Incorrect</button>
                    </div>}
              </div>
            )
          })()}

          {state.phase === 'over' && (() => {
            const win = teams && teams.length
              ? teamStandings(players, teams).map(t => ({ name: t.team, score: t.total })).sort((a, b) => b.score - a.score)[0]
              : [...players].sort((a, b) => b.score - a.score)[0]
            return (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {win
                  ? <div className="bz-fd" style={{ fontWeight: 600, fontSize: 24 }}>🏆 {win.name} wins with {money(win.score)}!</div>
                  : <div className="bz-fd" style={{ fontWeight: 600, fontSize: 22 }}>That’s the game!</div>}
                <button style={btn('var(--bz-accent)')} onClick={() => actions.reset()}>Play again</button>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// Clickable board — used by the host and by a player who holds board control.
export function MiniBoard({ config, state, onPick }) {
  const done = new Set(state.done || [])
  return (
    <div className="bz-board" style={{ gap: 6 }}>
      {config.board.categories.map((cat, ci) => (
        <div className="bz-col" key={ci} style={{ gap: 6 }}>
          <div className="bz-cat" style={{ fontSize: 9, minHeight: 40, padding: '6px 3px', borderRadius: 8 }}>{cat.name}</div>
          {cat.clues.map((clue, ii) => {
            const isDone = done.has(`${ci}-${ii}`)
            return (
              <button key={ii} disabled={isDone} onClick={() => onPick(ci, ii)}
                className={`bz-tile${isDone ? ' done' : ' live'}`}
                style={{ minHeight: 46, fontSize: 15, border: 'none', borderRadius: 8,
                  fontFamily: 'inherit', cursor: isDone ? 'default' : 'pointer' }}>
                {isDone ? '' : money(clue.v)}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function ClueForHost({ clue }) {
  return (
    <div style={{ background: BZ.paper2, borderRadius: 14, padding: 16, textAlign: 'center' }}>
      <div className="bz-fd" style={{ color: BZ.goldDeep, fontWeight: 600 }}>{money(clue.v)}</div>
      <div className="bz-fd" style={{ fontWeight: 500, fontSize: 19, margin: '6px 0 10px', lineHeight: 1.3 }}>{clue.clue}</div>
      <div style={{ fontSize: 14, color: BZ.sageDeep, fontWeight: 800 }}>Answer: {clue.answer}</div>
    </div>
  )
}

// Inline form so the host can join the roster and play along from the controller.
function HostJoin({ onJoin }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PLAYER_COLORS[0])
  const [busy, setBusy] = useState(false)
  const go = async () => { if (!name.trim() || busy) return; setBusy(true); await onJoin(name.trim(), color) }
  return (
    <div style={{ border: `1px dashed ${BZ.line}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: BZ.muted, letterSpacing: '.1em', textTransform: 'uppercase' }}>Want to play too?</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {PLAYER_COLORS.map(col => (
          <button key={col} onClick={() => setColor(col)} aria-label={`color ${col}`}
            style={{ width: 34, height: 34, borderRadius: '50%', background: col, cursor: 'pointer',
              border: color === col ? `3px solid ${BZ.ink}` : '3px solid transparent' }} />
        ))}
      </div>
      <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} placeholder="Your name"
        style={{ border: `1.5px solid ${BZ.line}`, borderRadius: 12, padding: '11px 13px', fontSize: 15, fontFamily: 'inherit', background: BZ.paper, color: BZ.ink }} />
      <button onClick={go} disabled={!name.trim() || busy}
        style={{ border: 0, borderRadius: 12, padding: '11px', fontWeight: 800, color: '#fff', background: 'var(--bz-accent)',
          opacity: (!name.trim() || busy) ? .5 : 1, cursor: 'pointer', fontFamily: 'inherit' }}>Play along too →</button>
    </div>
  )
}

const Label = ({ children }) => (
  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase',
    color: BZ.muted, marginBottom: 12 }}>{children}</div>
)
const Waiting = ({ children }) => (
  <div style={{ textAlign: 'center', color: BZ.muted, fontSize: 16, fontWeight: 700, padding: '10px 0' }}>{children}</div>
)
const Wrap = ({ children }) => (
  <div className="bz" style={{ minHeight: '100vh', background: BZ.paper, display: 'grid', placeItems: 'center',
    color: BZ.muted, fontSize: 18 }}>{children}</div>
)
