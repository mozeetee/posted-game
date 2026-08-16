import { useState, useEffect } from 'react'
import { useBuzzerGame, currentClue } from './useBuzzerGame'
import { injectBuzzerCss, playerColor, playerName, money } from './bzShared'
import { MiniBoard } from './BuzzerHost'
import { BZ } from './board'

// Each player's phone — their buzzer, and the board when they hold control.
// Identity lives in sessionStorage (per tab) so a refresh keeps you, and two
// tabs on one machine are two different players for testing.
export default function BuzzerPlayer({ gameId }) {
  injectBuzzerCss()
  const [me, setMe] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`bz:${gameId}`) || 'null') } catch { return null }
  })
  const { config, state, players, notFound, actions } = useBuzzerGame({
    gameId, role: 'player', playerId: me?.player_id, playerKey: me?.player_key,
  })

  if (notFound) return <Screen bg={BZ.paper}><Muted>That link isn’t a buzzer game.</Muted></Screen>
  if (!config || !state) return <Screen bg={BZ.paper}><Muted>Loading…</Muted></Screen>
  if (!me) return <Join actions={actions} gameId={gameId} onJoined={setMe} />

  const myColor = playerColor(players, me.player_id)
  const iControl = state.control === me.player_id
  const iWon = state.winner === me.player_id
  const missed = (state.missed || []).includes(me.player_id)
  const clue = currentClue(config, state)
  const open = state.phase === 'reading' && Date.now() >= new Date(state.open_at).getTime()
  const myScore = players.find(p => p.player_id === me.player_id)?.score ?? 0

  return (
    <Screen bg={BZ.paper}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ width: 34, height: 34, borderRadius: '50%', background: myColor, color: '#fff',
          display: 'grid', placeItems: 'center', fontWeight: 800 }}>{me.name.slice(0, 1).toUpperCase()}</span>
        <div style={{ fontWeight: 800 }}>{me.name}</div>
        <div className="bz-num bz-fd" style={{ marginLeft: 'auto', fontWeight: 600, fontSize: 20,
          color: myScore < 0 ? BZ.clay : BZ.goldDeep }}>{money(myScore)}</div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
        {/* SELECT — pick if you have control */}
        {state.phase === 'select' && (iControl
          ? <div>
              <Center>You’ve got control — pick a clue</Center>
              <MiniBoard config={config} state={state} onPick={(c, i) => actions.pick(c, i)} />
            </div>
          : <Muted>{state.control === 'host' ? 'The host is picking…' : `${playerName(players, state.control)} is picking…`}</Muted>)}

        {/* READING — the buzzer */}
        {state.phase === 'reading' && (
          missed
            ? <Buzzer disabled color={BZ.muted} label="You’re out this clue" />
            : open
              ? <BuzzLive color={myColor} onBuzz={actions.buzz} />
              : <Buzzer disabled color="#c9bda6" label="Get ready…" sub="Buzzers unlock in a sec" />
        )}

        {/* BUZZED */}
        {state.phase === 'buzzed' && (iWon
          ? <Buzzer disabled color={BZ.sageDeep} label="You’re in!" sub="Answer out loud" />
          : <Muted>{playerName(players, state.winner)} buzzed first</Muted>)}

        {/* DAILY DOUBLE */}
        {state.phase === 'dd_wager' && (state.dd_player === me.player_id
          ? <Wager myScore={myScore} onWager={actions.wager} />
          : <Muted>Daily Double — {playerName(players, state.dd_player)} is wagering…</Muted>)}
        {state.phase === 'dd_answer' && (state.dd_player === me.player_id
          ? <Buzzer disabled color={BZ.plum} label="Answer out loud!" sub={`You wagered ${money(state.dd_wager)}`} />
          : <Muted>{playerName(players, state.dd_player)} is answering their Daily Double…</Muted>)}

        {/* REVEAL / OVER */}
        {state.phase === 'reveal' && (
          <div style={{ textAlign: 'center' }}>
            <Muted>The answer</Muted>
            <div className="bz-fd" style={{ fontWeight: 600, fontSize: 24, margin: '8px 0' }}>{state.reveal?.answer}</div>
            {state.reveal?.who === me.player_id && (
              <div className="bz-fd" style={{ color: BZ.sage, fontWeight: 700 }}>You got it! +{money(state.reveal.delta)}</div>
            )}
          </div>
        )}
        {state.phase === 'over' && (
          <div style={{ textAlign: 'center' }}>
            <div className="bz-fd" style={{ fontSize: 26, fontWeight: 600, color: BZ.plum }}>Final: {money(myScore)}</div>
            <Muted>Thanks for playing!</Muted>
          </div>
        )}
      </div>
    </Screen>
  )
}

function BuzzLive({ color, onBuzz }) {
  const [tapped, setTapped] = useState(false)
  return (
    <button className={tapped ? '' : 'bz-buzz'} disabled={tapped}
      onClick={() => { setTapped(true); onBuzz() }}
      style={{ border: 0, borderRadius: 28, background: color, color: '#fff', cursor: 'pointer',
        minHeight: '46vh', width: '100%', fontFamily: "'Fredoka',sans-serif", fontWeight: 600,
        fontSize: 'clamp(44px,14vw,88px)', boxShadow: `0 18px 40px -16px ${color}`, touchAction: 'manipulation' }}>
      {tapped ? '…' : 'BUZZ'}
    </button>
  )
}

function Buzzer({ color, label, sub, disabled }) {
  return (
    <div style={{ borderRadius: 28, background: disabled ? '#efe7d6' : color,
      minHeight: '46vh', width: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 20 }}>
      <div>
        <div className="bz-fd" style={{ fontWeight: 600, fontSize: 'clamp(26px,7vw,40px)',
          color: disabled ? BZ.muted : '#fff' }}>{label}</div>
        {sub && <div style={{ marginTop: 8, fontWeight: 700, color: disabled ? BZ.muted : 'rgba(255,255,255,.85)' }}>{sub}</div>}
      </div>
    </div>
  )
}

function Wager({ myScore, onWager }) {
  const max = Math.max(myScore, 1000)
  const [amt, setAmt] = useState(Math.min(500, max))
  const presets = [...new Set([200, Math.round(max / 2 / 100) * 100, max])].filter(v => v >= 200)
  return (
    <div style={{ background: BZ.plum, borderRadius: 22, padding: 22, color: '#fff', textAlign: 'center' }}>
      <div className="bz-fd" style={{ fontWeight: 600, fontSize: 26 }}>Daily Double!</div>
      <div style={{ opacity: .9, margin: '6px 0 16px' }}>Secretly wager up to {money(max)}</div>
      <div className="bz-fd bz-num" style={{ fontSize: 44, fontWeight: 600 }}>{money(amt)}</div>
      <input type="range" min={200} max={max} step={100} value={amt}
        onChange={e => setAmt(Number(e.target.value))} style={{ width: '100%', margin: '14px 0', accentColor: BZ.gold }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {presets.map(v => (
          <button key={v} onClick={() => setAmt(v)} style={{ border: '1.5px solid rgba(255,255,255,.5)',
            background: amt === v ? '#fff' : 'transparent', color: amt === v ? BZ.plum : '#fff',
            borderRadius: 20, padding: '7px 16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {v === max ? 'Max' : money(v)}
          </button>
        ))}
      </div>
      <button onClick={() => onWager(amt)} style={{ border: 0, borderRadius: 14, background: BZ.gold,
        color: '#3a2a1a', fontWeight: 800, fontSize: 16, padding: '14px 22px', width: '100%', cursor: 'pointer',
        fontFamily: 'inherit' }}>Lock in wager</button>
    </div>
  )
}

function Join({ actions, gameId, onJoined }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    const res = await actions.join(name.trim())
    if (res?.player_id) {
      const me = { player_id: res.player_id, player_key: res.player_key, name: name.trim() }
      sessionStorage.setItem(`bz:${gameId}`, JSON.stringify(me))
      onJoined(me)
    } else setBusy(false)
  }
  return (
    <Screen bg={BZ.paper}>
      <div style={{ margin: 'auto', width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div className="bz-fd" style={{ fontWeight: 600, fontSize: 34, color: BZ.plum }}>Buzzed In</div>
        <div style={{ color: BZ.muted, marginBottom: 24, marginTop: 4 }}>This phone is your buzzer.</div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase',
          color: BZ.muted, textAlign: 'left', marginBottom: 8 }}>Your name</div>
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()}
          placeholder="What should we call you?" autoFocus
          style={{ width: '100%', border: `1.5px solid ${BZ.line}`, borderRadius: 15, padding: '14px 15px',
            fontSize: 16, fontFamily: 'inherit', background: '#fff', color: BZ.ink, marginBottom: 14 }} />
        <button onClick={go} disabled={!name.trim() || busy} style={{ width: '100%', border: 0, borderRadius: 16,
          padding: 15, fontWeight: 800, fontSize: 16, color: '#fff', background: BZ.plum,
          opacity: !name.trim() || busy ? .5 : 1, cursor: 'pointer', fontFamily: 'inherit' }}>
          {busy ? 'Joining…' : 'Join the game →'}
        </button>
      </div>
    </Screen>
  )
}

const Screen = ({ children, bg }) => (
  <div className="bz" style={{ minHeight: '100vh', background: bg, padding: 'clamp(16px,5vw,24px)',
    display: 'flex', flexDirection: 'column' }}>{children}</div>
)
const Muted = ({ children }) => (
  <div style={{ textAlign: 'center', color: BZ.muted, fontSize: 17, fontWeight: 700, margin: 'auto' }}>{children}</div>
)
const Center = ({ children }) => (
  <div style={{ textAlign: 'center', color: BZ.muted, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{children}</div>
)
