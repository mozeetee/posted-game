import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

export default function PlayerRoom({ gameId }) {
  const [phase, setPhase] = useState('join')
  const [playerName, setPlayerName] = useState('')
  const [game, setGame] = useState(null)
  const [error, setError] = useState('')
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [lastQuestionIdx, setLastQuestionIdx] = useState(-1)
  const [revealed, setRevealed] = useState(false)
  const [revealImageVisible, setRevealImageVisible] = useState(false)
  const [myAnswers, setMyAnswers] = useState({})
  const channelRef = useRef(null)

  // Subscribe to real-time game updates once joined
  function subscribeToGame(gid) {
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    channelRef.current = supabase
      .channel(`game-player-${gid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `game_id=eq.${gid}` },
        payload => { if (payload.new?.data) handleGameUpdate(payload.new.data) }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reveals', filter: `game_id=eq.${gid}` },
        () => checkReveal(gid)
      )
      .subscribe()
  }

  function handleGameUpdate(updated) {
    setGame(prev => {
      if (!prev) return updated
      if (updated.status === 'active' && updated.currentQuestion !== prev.currentQuestion) {
        setSelectedAnswer(null)
        setSubmitted(false)
        setRevealed(false)
        setRevealImageVisible(false)
        setLastQuestionIdx(updated.currentQuestion)
        setPhase('playing')
      }
      if (updated.status === 'lobby') setPhase('lobby')
      if (updated.status === 'finished') setPhase('finished')
      return updated
    })
  }

  async function checkReveal(gid) {
    const g = game
    if (!g) return
    const { data } = await supabase
      .from('reveals')
      .select('question_idx')
      .eq('game_id', gid)
      .eq('question_idx', g.currentQuestion)
    setRevealImageVisible(!!(data && data.length > 0))
  }

  useEffect(() => {
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [])

  // Re-check reveal when question changes
  useEffect(() => {
    if (game && gameId) checkReveal(gameId)
  }, [game?.currentQuestion])

  async function joinGame() {
    setError('')
    if (!playerName.trim()) { setError('Enter your name.'); return }
    const { data, error: fetchErr } = await supabase.from('games').select('data').eq('game_id', gameId).single()
    if (fetchErr || !data) { setError('Game not found. Check your link.'); return }

    const g = data.data
    const already = (g.players || []).find(p => p.name.toLowerCase() === playerName.trim().toLowerCase())
    if (!already) {
      const updated = { ...g, players: [...(g.players || []), { name: playerName.trim(), joinedAt: Date.now() }] }
      await supabase.from('games').update({ data: updated }).eq('game_id', gameId)
      setGame(updated)
    } else {
      setGame(g)
    }
    setLastQuestionIdx(g.currentQuestion)
    subscribeToGame(gameId)
    setPhase(g.status === 'active' ? 'playing' : g.status === 'finished' ? 'finished' : 'lobby')
  }

  async function submitAnswer(answer) {
    if (submitted || !game) return
    setSelectedAnswer(answer)
    setSubmitted(true)
    const key = `${playerName.trim()}:::${game.currentQuestion}`
    const { data } = await supabase.from('games').select('data').eq('game_id', gameId).single()
    if (!data) return
    const g = data.data
    const updated = { ...g, answers: { ...(g.answers || {}), [key]: answer } }
    await supabase.from('games').update({ data: updated }).eq('game_id', gameId)
    setGame(updated)
    setMyAnswers(prev => ({ ...prev, [game.currentQuestion]: answer }))
    setTimeout(() => setRevealed(true), 700)
  }

  function computeMyScore(g) {
    let score = 0
    ;(g.questions || []).forEach((q, i) => {
      if ((g.answers || {})[`${playerName.trim()}:::${i}`] === q.author) score++
    })
    return score
  }

  function computeAllScores(g) {
    const scores = {}
    ;(g.players || []).forEach(p => (scores[p.name] = 0))
    Object.entries(g.answers || {}).forEach(([key, answer]) => {
      const [pName, qIdxStr] = key.split(':::')
      const q = g.questions[parseInt(qIdxStr)]
      if (q && answer === q.author) scores[pName] = (scores[pName] || 0) + 1
    })
    return Object.entries(scores).sort((a, b) => b[1] - a[1])
  }

  // ── JOIN ──────────────────────────────────────────────────────────────────
  if (phase === 'join') return (
    <div style={p.page}>
      <div style={p.card}>
        <div style={p.logo}>WHO<span style={p.accent}>POSTED</span>THIS?</div>
        <div style={p.sub}>Guess who's behind the post</div>
        <div style={p.field}>
          <label style={p.label}>YOUR NAME</label>
          <input style={p.input} placeholder="How should we call you?" value={playerName} onChange={e => setPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && joinGame()} autoFocus />
        </div>
        <div style={p.field}>
          <label style={p.label}>GAME CODE</label>
          <div style={{ ...p.input, fontSize: 22, letterSpacing: 6, textAlign: 'center', color: '#ffd166', background: '#111120', padding: '14px 16px', borderRadius: 4, border: '1px solid #222' }}>{gameId}</div>
        </div>
        {error && <div style={p.err}>{error}</div>}
        <button style={p.joinBtn} onClick={joinGame}>Join Game →</button>
      </div>
    </div>
  )

  // ── LOBBY ─────────────────────────────────────────────────────────────────
  if (phase === 'lobby') return (
    <div style={p.page}>
      <div style={p.card}>
        <div style={p.gameTitle}>{game?.title}</div>
        <div style={p.waiting}><span style={p.dot}>●</span> Waiting for host to start…</div>
        <div style={{ textAlign: 'center', color: '#555', fontSize: 12, marginBottom: 12 }}>{(game?.players || []).length} player{(game?.players || []).length !== 1 ? 's' : ''} joined</div>
        <div style={{ textAlign: 'center', fontSize: 13, color: '#888', marginBottom: 20 }}>You're in as <strong style={{ color: '#ffd166' }}>{playerName}</strong></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {(game?.players || []).map(pl => (
            <div key={pl.name} style={{ padding: '6px 14px', border: `1px solid ${pl.name === playerName ? '#ffd166' : '#2e2e3e'}`, background: pl.name === playerName ? '#ffd16611' : '#1e1e2e', borderRadius: 20, fontSize: 12, color: '#ddd' }}>
              {pl.name === playerName ? '★ ' : ''}{pl.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ── PLAYING ───────────────────────────────────────────────────────────────
  if (phase === 'playing' && game) {
    const q = game.questions[game.currentQuestion]
    if (!q) return <div style={p.page}><div style={p.card}><div style={p.waiting}>Loading…</div></div></div>
    const isCorrect = submitted && selectedAnswer === q.author

    return (
      <div style={p.page}>
        <div style={p.playWrap}>
          <div style={p.progressRow}>
            <span style={p.progressLabel}>Q{game.currentQuestion + 1} / {game.questions.length}</span>
            <div style={p.progressTrack}>
              <div style={{ ...p.progressFill, width: `${((game.currentQuestion + 1) / game.questions.length) * 100}%` }} />
            </div>
          </div>
          <div style={p.bubble}>
            <div style={p.handle}>@someone</div>
            {q.questionImage && <img src={q.questionImage} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, marginBottom: 10, marginTop: 4 }} />}
            <div style={p.postText}>{q.post}</div>
          </div>
          <div style={p.whoLabel}>WHO POSTED THIS?</div>
          <div style={p.choiceGrid}>
            {q.choices.map(choice => {
              let bg = '#1a1a2e', border = '#2e2e4e', color = '#f0f0f0'
              if (submitted) {
                if (choice === q.author && revealed) { bg = '#00ff8822'; border = '#00ff88'; color = '#00ff88' }
                else if (choice === selectedAnswer && choice !== q.author && revealed) { bg = '#ff6b6b22'; border = '#ff6b6b'; color = '#ff6b6b' }
                else if (choice === selectedAnswer && !revealed) { bg = '#ffd16622'; border = '#ffd166'; color = '#ffd166' }
                else { border = '#1a1a2e'; color = '#333' }
              }
              return (
                <button key={choice} style={{ ...p.choiceBtn, background: bg, borderColor: border, color }} onClick={() => submitAnswer(choice)} disabled={submitted}>
                  {submitted && revealed && choice === q.author && <span style={{ marginRight: 6 }}>✓</span>}
                  {submitted && revealed && choice === selectedAnswer && choice !== q.author && <span style={{ marginRight: 6 }}>✗</span>}
                  {choice}
                </button>
              )
            })}
          </div>
          {submitted && revealed && (
            <div style={{ ...p.feedback, background: isCorrect ? '#00ff8822' : '#ff6b6b22', borderColor: isCorrect ? '#00ff88' : '#ff6b6b', color: isCorrect ? '#00ff88' : '#ff6b6b' }}>
              {isCorrect ? '🎉 Correct! +1 point' : `❌ It was ${q.author}`}
            </div>
          )}
          {submitted && !revealed && <div style={p.locking}>Locking in your answer…</div>}
          {!submitted && <div style={p.tapHint}>Tap to answer</div>}
          {submitted && revealImageVisible && q.revealImage && (
            <div style={p.revealBox}>
              <div style={p.revealLabel}>🎉 HOST REVEAL</div>
              <img src={q.revealImage} alt="reveal" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 8, border: '1px solid #00ff8844' }} />
            </div>
          )}
          {submitted && !revealImageVisible && q.revealImage && (
            <div style={{ textAlign: 'center', color: '#333', fontSize: 11, letterSpacing: 1, marginTop: 20 }}>Waiting for host reveal…</div>
          )}
        </div>
      </div>
    )
  }

  // ── FINISHED ──────────────────────────────────────────────────────────────
  if (phase === 'finished' && game) {
    const myScore = computeMyScore(game)
    const allScores = computeAllScores(game)
    const myRank = allScores.findIndex(([name]) => name === playerName) + 1
    const total = game.questions.length

    return (
      <div style={p.page}>
        <div style={p.card}>
          <div style={p.finTitle}>GAME OVER!</div>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 64, fontWeight: 900, color: '#f0f0f0', lineHeight: 1 }}>
              {myScore}<span style={{ fontSize: 32, color: '#444' }}>/{total}</span>
            </div>
            <div style={{ fontSize: 12, color: '#555', letterSpacing: 2, marginTop: 8 }}>your score · rank #{myRank}</div>
          </div>
          <div style={p.lbBox}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: '#555', marginBottom: 14 }}>FINAL STANDINGS</div>
            {allScores.map(([name, score], i) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 6px', borderRadius: 4, background: name === playerName ? '#ffd16611' : 'transparent', marginBottom: 4 }}>
                <span style={{ width: 28, fontSize: 16, textAlign: 'center' }}>{['🏆','🥈','🥉'][i] || `#${i+1}`}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: name === playerName ? '#ffd166' : '#f0f0f0' }}>{name}</span>
                <span style={{ fontSize: 13, color: '#ffd166' }}>{score} pts</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: '#555', marginBottom: 14 }}>YOUR ANSWERS</div>
            {game.questions.map((q, i) => {
              const myAns = (game.answers || {})[`${playerName}:::${i}`]
              const correct = myAns === q.author
              return (
                <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #111' }}>
                  <div style={{ fontSize: 12, color: '#555', fontStyle: 'italic', marginBottom: 4 }}>"{q.post.substring(0, 65)}{q.post.length > 65 ? '…' : ''}"</div>
                  {q.revealImage && <img src={q.revealImage} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 4, marginBottom: 6, opacity: 0.8 }} />}
                  <div style={{ fontSize: 12, fontWeight: 700, color: correct ? '#00ff88' : '#ff6b6b' }}>
                    {correct ? '✓' : '✗'} {myAns || '—'} {!correct && `(was: ${q.author})`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return <div style={p.page}><div style={p.card}><div style={p.waiting}>Loading…</div></div></div>
}

const p = {
  page: { minHeight: '100vh', background: '#0a0a12', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', fontFamily: "'Courier New', monospace", padding: '20px 16px 80px' },
  card: { width: '100%', maxWidth: 420, paddingTop: 40 },
  playWrap: { width: '100%', maxWidth: 420, paddingTop: 20 },
  logo: { fontSize: 32, fontWeight: 900, letterSpacing: 4, color: '#f0f0f0', fontFamily: "'Arial Black', sans-serif", textAlign: 'center', marginBottom: 6 },
  accent: { color: '#ffd166' },
  sub: { textAlign: 'center', color: '#444', fontSize: 12, letterSpacing: 2, marginBottom: 36 },
  gameTitle: { fontSize: 22, fontWeight: 900, color: '#ffd166', textAlign: 'center', marginBottom: 28, fontFamily: "'Arial Black', sans-serif" },
  field: { marginBottom: 20 },
  label: { display: 'block', fontSize: 10, letterSpacing: 2, color: '#555', marginBottom: 8, fontWeight: 700 },
  input: { width: '100%', background: '#111120', border: '1px solid #222', borderRadius: 4, color: '#f0f0f0', padding: '14px 16px', fontSize: 15, fontFamily: "'Courier New', monospace", boxSizing: 'border-box' },
  err: { color: '#ff6b6b', fontSize: 12, marginBottom: 16, textAlign: 'center' },
  joinBtn: { width: '100%', padding: '16px', background: '#ffd166', color: '#111', border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 900, cursor: 'pointer', letterSpacing: 2, fontFamily: "'Arial Black', sans-serif", marginTop: 8 },
  waiting: { textAlign: 'center', color: '#aaa', fontSize: 14, padding: '40px 0 16px', letterSpacing: 1 },
  dot: { color: '#00ff88', marginRight: 8 },
  progressRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  progressLabel: { fontSize: 10, letterSpacing: 2, color: '#555', whiteSpace: 'nowrap' },
  progressTrack: { flex: 1, height: 3, background: '#1e1e2e', borderRadius: 2 },
  progressFill: { height: '100%', background: '#ffd166', borderRadius: 2, transition: 'width 0.4s' },
  bubble: { background: '#111120', border: '1px solid #1e1e2e', borderRadius: 12, borderTopLeftRadius: 4, padding: '16px 18px', marginBottom: 24 },
  handle: { fontSize: 11, color: '#555', marginBottom: 8, letterSpacing: 1 },
  postText: { fontSize: 16, color: '#f0f0f0', lineHeight: 1.65 },
  whoLabel: { fontSize: 10, letterSpacing: 3, color: '#555', marginBottom: 14, textAlign: 'center' },
  choiceGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 },
  choiceBtn: { padding: '16px 10px', border: '2px solid', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', fontFamily: "'Courier New', monospace" },
  feedback: { border: '1px solid', borderRadius: 6, padding: '13px 16px', textAlign: 'center', fontSize: 14, fontWeight: 700, marginBottom: 16 },
  locking: { textAlign: 'center', color: '#555', fontSize: 12, letterSpacing: 1, padding: '10px 0' },
  tapHint: { textAlign: 'center', color: '#2e2e3e', fontSize: 11, letterSpacing: 2 },
  revealBox: { marginTop: 20, background: '#0d0d1a', border: '1px solid #00ff8822', borderRadius: 8, padding: 16 },
  revealLabel: { fontSize: 10, letterSpacing: 3, color: '#00ff88', marginBottom: 10 },
  finTitle: { fontSize: 36, fontWeight: 900, color: '#ffd166', textAlign: 'center', fontFamily: "'Arial Black', sans-serif", letterSpacing: 4, marginBottom: 24 },
  lbBox: { background: '#111120', border: '1px solid #1e1e2e', borderRadius: 6, padding: '16px 20px', marginBottom: 28 },
}
