import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { supabase } from './supabase'
import { getTheme, ensureGoogleFont, withAlpha, contrastColor, getBrandParts } from './theme'

// Read-only, TV-optimized view of a game. Open on a laptop plugged into a TV
// (or cast the browser tab) so the whole room shares one big visual: the
// question, a live "locked in" counter, the reveal, and the leaderboard.
// It only reads game state — it can't answer or advance — so the link is safe
// to put on a screen everyone can see.
export default function BigScreen({ gameId }) {
  const [game, setGame] = useState(null)
  const [status, setStatus] = useState('lobby')
  const [currentQ, setCurrentQ] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [players, setPlayers] = useState([]) // [{name}]
  const [totals, setTotals] = useState([])   // [[name, total], ...] sorted
  const [roundAnswers, setRoundAnswers] = useState({}) // name -> answer for currentQ
  const [qr, setQr] = useState(null)
  const stateRef = useRef({ status: 'lobby', currentQ: 0 })

  const joinUrl = `${window.location.origin}/?game=${gameId}&role=player`
  const theme = getTheme(game)

  useEffect(() => {
    ensureGoogleFont(theme.headingFont)
    ensureGoogleFont(theme.bodyFont)
  }, [theme.headingFont, theme.bodyFont])

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 320, margin: 1 }).then(setQr).catch(() => {})
  }, [joinUrl])

  // Load the full game once (questions, theme, images)
  useEffect(() => {
    let cancelled = false
    supabase.from('games').select('data').eq('game_id', gameId).single().then(({ data }) => {
      if (!cancelled && data?.data) setGame(data.data)
    })
    return () => { cancelled = true }
  }, [gameId])

  // Poll live state: tiny status + reveal flag + round_state (players/totals/answers)
  useEffect(() => {
    let stopped = false
    async function tick() {
      const cq = stateRef.current.currentQ
      const [st, rv, rs] = await Promise.all([
        supabase.from('games').select('status:data->>status,current_question:data->currentQuestion').eq('game_id', gameId).single(),
        supabase.from('reveals').select('question_idx').eq('game_id', gameId).eq('question_idx', cq),
        supabase.rpc('round_state', { gid: gameId, qidx: cq }),
      ])
      if (stopped) return
      if (st.data) {
        setStatus(st.data.status)
        setCurrentQ(st.data.current_question)
        stateRef.current = { status: st.data.status, currentQ: st.data.current_question }
      }
      if (rs.data) {
        setPlayers(rs.data.map(r => ({ name: r.player_name })))
        setTotals(rs.data.map(r => [r.player_name, r.total]))
        setRoundAnswers(Object.fromEntries(rs.data.filter(r => r.round_answer != null).map(r => [r.player_name, r.round_answer])))
      }
      // Reveal on the big screen when the host flags it OR everyone has answered.
      const flagged = !!(rv.data && rv.data.length > 0)
      const allIn = rs.data && rs.data.length > 0 && rs.data.every(r => r.round_answer != null)
      setRevealed(flagged || allIn)
    }
    tick()
    const poll = setInterval(tick, 2000)
    return () => { stopped = true; clearInterval(poll) }
  }, [gameId])

  const s = buildScreenStyles(theme)
  const q = game?.questions?.[currentQ]
  const answeredCount = players.filter(p => roundAnswers[p.name] != null).length

  function Background({ children }) {
    return (
      <div style={s.page}>
        {theme.backgroundImage && <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${theme.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.3 }} />}
        <div style={s.inner}>{children}</div>
      </div>
    )
  }

  function Leaderboard({ compact }) {
    if (totals.length === 0) return null
    const top = compact ? totals.slice(0, 8) : totals
    return (
      <div style={s.board}>
        <div style={s.boardTitle}>LEADERBOARD</div>
        {top.map(([name, score], i) => (
          <div key={name} style={s.boardRow}>
            <span style={s.boardRank}>{['🏆', '🥈', '🥉'][i] || `#${i + 1}`}</span>
            <span style={s.boardName}>{name}</span>
            <span style={s.boardScore}>{score}</span>
          </div>
        ))}
      </div>
    )
  }

  if (!game) return <div style={{ minHeight: '100vh', background: theme.backgroundColor }} />

  // ── LOBBY ─────────────────────────────────────────────────────────────────
  if (status === 'lobby') {
    return (
      <Background>
        <div style={{ textAlign: 'center', width: '100%' }}>
          <Logo theme={theme} s={s} />
          <div style={s.gameTitle}>{game.title}</div>
          <div style={s.lobbyRow}>
            <div style={s.qrBox}>
              {qr && <img src={qr} alt="Join QR" style={s.qrImg} />}
              <div style={s.joinHint}>Scan to join, or go to</div>
              <div style={s.joinUrl}>{joinUrl.replace(/^https?:\/\//, '')}</div>
            </div>
            <div style={s.lobbyPlayers}>
              <div style={s.boardTitle}>{players.length} IN THE ROOM</div>
              <div style={s.chipWrap}>
                {players.map(p => <span key={p.name} style={s.playerChip}>{p.name}</span>)}
                {players.length === 0 && <div style={s.dim}>Waiting for players to join…</div>}
              </div>
            </div>
          </div>
          <div style={s.waiting}>Waiting for the host to start…</div>
        </div>
      </Background>
    )
  }

  // ── FINISHED ──────────────────────────────────────────────────────────────
  if (status === 'finished') {
    return (
      <Background>
        <div style={{ textAlign: 'center', width: '100%' }}>
          <div style={s.finTitle}>🎉 GAME OVER 🎉</div>
          <div style={{ ...s.board, maxWidth: '70vw', margin: '0 auto' }}>
            {totals.map(([name, score], i) => (
              <div key={name} style={{ ...s.boardRow, fontSize: i === 0 ? '3.4vmin' : '2.8vmin' }}>
                <span style={s.boardRank}>{['🏆', '🥈', '🥉'][i] || `#${i + 1}`}</span>
                <span style={s.boardName}>{name}</span>
                <span style={s.boardScore}>{score} pt{score !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </Background>
    )
  }

  // ── ACTIVE ────────────────────────────────────────────────────────────────
  if (!q) return <Background><div style={s.waiting}>Loading question…</div></Background>

  return (
    <Background>
      <div style={s.activeGrid}>
        <div style={s.qColumn}>
          <div style={s.qProgress}>QUESTION {currentQ + 1} OF {game.questions.length}</div>
          <div style={s.qLabel}>{q.questionLabel?.trim() || theme.questionLabel}</div>
          <div style={s.bubble}>
            {q.questionImage && <img src={q.questionImage} alt="" style={s.qImg} />}
            <div style={s.postText}>{q.post}</div>
          </div>
          <div style={s.choiceGrid}>
            {q.choices.map(choice => {
              const isAnswer = choice === q.author
              const highlight = revealed && isAnswer
              return (
                <div key={choice} style={{
                  ...s.choice,
                  background: highlight ? theme.secondaryColor : theme.cardColor,
                  color: highlight ? contrastColor(theme.secondaryColor) : theme.textColor,
                  border: `2px solid ${highlight ? theme.secondaryColor : withAlpha(theme.textColor, 0.18)}`,
                }}>
                  {highlight && <span style={{ marginRight: 10 }}>✓</span>}{choice}
                </div>
              )
            })}
          </div>
          {revealed && q.revealImage && <img src={q.revealImage} alt="reveal" style={s.revealImg} />}
        </div>

        <div style={s.side}>
          {!revealed ? (
            <div style={s.lockBox}>
              <div style={s.lockCount}>{answeredCount}<span style={s.lockOf}> / {players.length}</span></div>
              <div style={s.lockLabel}>locked in</div>
              <div style={s.lockTrack}><div style={{ ...s.lockFill, width: players.length ? `${(answeredCount / players.length) * 100}%` : '0%' }} /></div>
              <div style={s.chipWrap}>
                {players.map(p => {
                  const inYet = roundAnswers[p.name] != null
                  return <span key={p.name} style={{ ...s.playerChip, opacity: inYet ? 1 : 0.4, background: inYet ? withAlpha(theme.primaryColor, 0.2) : withAlpha(theme.textColor, 0.06), borderColor: inYet ? theme.primaryColor : withAlpha(theme.textColor, 0.2) }}>{inYet ? '✓ ' : ''}{p.name}</span>
                })}
              </div>
            </div>
          ) : (
            <div style={s.revealCallout}>The answer was<div style={s.revealName}>{q.author}</div></div>
          )}
          <Leaderboard compact />
        </div>
      </div>
    </Background>
  )
}

function Logo({ theme, s }) {
  if (theme.logoImage) return <img src={theme.logoImage} alt="logo" style={s.logoImg} />
  const { lead, accent } = getBrandParts()
  return <div style={s.logo}>{lead} <span style={{ color: theme.primaryColor }}>{accent}</span></div>
}

function buildScreenStyles(theme) {
  const { primaryColor: primary, secondaryColor: secondary, cardColor: card, textColor: text, backgroundColor: bg, headingFont, bodyFont } = theme
  return {
    page: { minHeight: '100vh', width: '100%', background: bg, position: 'relative', overflow: 'hidden', fontFamily: bodyFont },
    inner: { position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3vmin 4vmin', boxSizing: 'border-box' },
    logo: { fontFamily: headingFont, fontWeight: 900, fontSize: '6vmin', letterSpacing: 2, color: text, textTransform: 'uppercase', textAlign: 'center' },
    logoImg: { maxWidth: '46vmin', maxHeight: '22vmin', objectFit: 'contain', display: 'block', margin: '0 auto' },
    gameTitle: { fontFamily: headingFont, fontSize: '5vmin', fontWeight: 900, color: primary, textAlign: 'center', margin: '2vmin 0 4vmin' },
    lobbyRow: { display: 'flex', gap: '5vmin', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
    qrBox: { textAlign: 'center' },
    qrImg: { width: '34vmin', height: '34vmin', borderRadius: '2vmin', background: '#fff', padding: '1.5vmin', display: 'block' },
    joinHint: { fontSize: '2vmin', color: withAlpha(text, 0.6), marginTop: '2vmin' },
    joinUrl: { fontSize: '2.4vmin', color: primary, fontWeight: 700, marginTop: '0.5vmin' },
    lobbyPlayers: { minWidth: '34vmin', maxWidth: '46vmin' },
    chipWrap: { display: 'flex', flexWrap: 'wrap', gap: '1.2vmin', justifyContent: 'center', marginTop: '2vmin' },
    playerChip: { padding: '1vmin 2vmin', borderRadius: '4vmin', fontSize: '2.2vmin', fontWeight: 700, color: text, background: withAlpha(primary, 0.15), border: `1px solid ${withAlpha(primary, 0.4)}` },
    dim: { color: withAlpha(text, 0.5), fontSize: '2.2vmin' },
    waiting: { textAlign: 'center', fontSize: '2.8vmin', color: withAlpha(text, 0.7), marginTop: '5vmin', letterSpacing: 1 },
    finTitle: { fontFamily: headingFont, fontSize: '7vmin', fontWeight: 900, color: primary, textAlign: 'center', marginBottom: '4vmin', letterSpacing: 2 },

    activeGrid: { display: 'flex', gap: '4vmin', width: '100%', alignItems: 'flex-start', flexWrap: 'wrap' },
    qColumn: { flex: '1 1 58%', minWidth: '50vmin' },
    side: { flex: '1 1 30%', minWidth: '32vmin', display: 'flex', flexDirection: 'column', gap: '3vmin' },
    qProgress: { fontSize: '2.2vmin', letterSpacing: 2, color: withAlpha(text, 0.55), fontWeight: 700 },
    qLabel: { fontSize: '2.6vmin', letterSpacing: 2, color: primary, fontWeight: 800, margin: '1vmin 0 2vmin', textTransform: 'uppercase' },
    bubble: { background: card, border: `1px solid ${withAlpha(text, 0.12)}`, borderRadius: '2.5vmin', padding: '3vmin', marginBottom: '3vmin' },
    qImg: { width: '100%', maxHeight: '38vmin', objectFit: 'contain', borderRadius: '1.5vmin', marginBottom: '2vmin', display: 'block' },
    postText: { fontSize: '3.6vmin', lineHeight: 1.4, color: text, fontWeight: 600 },
    choiceGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2vmin' },
    choice: { padding: '2.4vmin', borderRadius: '1.8vmin', fontSize: '3vmin', fontWeight: 800, textAlign: 'center' },
    revealImg: { width: '100%', maxHeight: '40vmin', objectFit: 'contain', borderRadius: '2vmin', marginTop: '3vmin', display: 'block' },

    lockBox: { background: card, border: `1px solid ${withAlpha(text, 0.12)}`, borderRadius: '2.5vmin', padding: '3vmin', textAlign: 'center' },
    lockCount: { fontFamily: headingFont, fontSize: '9vmin', fontWeight: 900, color: primary, lineHeight: 1 },
    lockOf: { fontSize: '5vmin', color: withAlpha(text, 0.4) },
    lockLabel: { fontSize: '2.6vmin', letterSpacing: 2, color: withAlpha(text, 0.6), textTransform: 'uppercase', marginBottom: '2vmin' },
    lockTrack: { height: '1.6vmin', borderRadius: '1vmin', background: withAlpha(text, 0.12), overflow: 'hidden', marginBottom: '2vmin' },
    lockFill: { height: '100%', background: primary, borderRadius: '1vmin', transition: 'width 0.5s' },
    revealCallout: { background: card, border: `2px solid ${withAlpha(secondary, 0.5)}`, borderRadius: '2.5vmin', padding: '3vmin', textAlign: 'center', fontSize: '2.8vmin', color: withAlpha(text, 0.7) },
    revealName: { fontFamily: headingFont, fontSize: '6vmin', fontWeight: 900, color: secondary, marginTop: '1vmin' },

    board: { background: card, border: `1px solid ${withAlpha(text, 0.12)}`, borderRadius: '2.5vmin', padding: '2.5vmin 3vmin' },
    boardTitle: { fontSize: '2.2vmin', letterSpacing: 2, color: withAlpha(text, 0.55), fontWeight: 700, marginBottom: '2vmin', textTransform: 'uppercase' },
    boardRow: { display: 'flex', alignItems: 'center', gap: '2vmin', padding: '1vmin 0', fontSize: '2.6vmin' },
    boardRank: { width: '5vmin', textAlign: 'center' },
    boardName: { flex: 1, fontWeight: 700, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    boardScore: { color: primary, fontWeight: 800 },
  }
}
