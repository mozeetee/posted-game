import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getTheme, ensureGoogleFont, withAlpha, contrastColor, getBrandParts } from './theme'

export default function PlayerRoom({ gameId, initialName = '', mockGame = null, onExitMock = null }) {
  const isMock = !!mockGame
  const [phase, setPhase] = useState('join')
  const [playerName, setPlayerName] = useState(initialName || (isMock ? 'Preview' : ''))
  const [game, setGame] = useState(() => isMock ? { ...mockGame, currentQuestion: 0, status: 'lobby', players: [], answers: {} } : null)
  const [error, setError] = useState('')
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [autoRevealed, setAutoRevealed] = useState(false)
  const [revealImageVisible, setRevealImageVisible] = useState(false)
  // Which question the "round results" interstitial is showing (set when the
  // host advances while this player is mid-game).
  const [lastRoundIdx, setLastRoundIdx] = useState(null)
  // Live state comes from the round_state() SQL function: every player, their
  // running total (computed server-side), and their answer for one round.
  // ~1KB per poll even with 20+ players, instead of shipping every answer row.
  const [roundState, setRoundState] = useState({ qidx: null, byName: {} })
  const [totalsRows, setTotalsRows] = useState([])
  // Own per-question history, fetched once for the finished screen.
  const [myHistory, setMyHistory] = useState({})
  const channelRef = useRef(null)
  const gameRef = useRef(null)

  const theme = getTheme(game)
  const p = buildPlayerStyles(theme)
  const revealMode = game?.revealMode || 'auto'
  // In manual mode the correct answer stays hidden until the host broadcasts
  // a reveal for this question (the same signal that shows the bonus image).
  const revealed = revealMode === 'manual' ? (submitted && revealImageVisible) : autoRevealed
  // Mock preview keeps everything in-memory on the game object; real games use the server.
  const playersArr = isMock ? (game?.players || []) : totalsRows.map(([name]) => ({ name }))
  const totalsView = isMock ? computeMockScores() : totalsRows

  // Answer a player gave for a specific round (only the polled round is known in real games)
  function getRoundAnswer(name, qidx) {
    if (isMock) return (game?.answers || {})[`${name}:::${qidx}`]
    return roundState.qidx === qidx ? roundState.byName[name] : undefined
  }

  function computeMockScores() {
    const scores = {}
    ;(game?.players || []).forEach(pl => (scores[pl.name] = 0))
    Object.entries(game?.answers || {}).forEach(([key, answer]) => {
      const [pName, qIdxStr] = key.split(':::')
      const q = game.questions[parseInt(qIdxStr)]
      if (q && answer === q.author) scores[pName] = (scores[pName] || 0) + 1
    })
    return Object.entries(scores).sort((a, b) => b[1] - a[1])
  }

  // Fetch the game up front (before joining) so the join screen is themed too.
  useEffect(() => {
    if (isMock) return
    let cancelled = false
    async function loadPreview() {
      const { data } = await supabase.from('games').select('data').eq('game_id', gameId).single()
      if (!cancelled && data?.data) setGame(g => g || data.data)
    }
    loadPreview()
    return () => { cancelled = true }
  }, [gameId])

  useEffect(() => {
    ensureGoogleFont(theme.headingFont)
    ensureGoogleFont(theme.bodyFont)
  }, [theme.headingFont, theme.bodyFont])

  // Applies a status/question change from the server. This is the ONLY place
  // phase transitions happen after joining, so lobby→active works even when
  // the question index doesn't change (the old code missed that case and
  // left early joiners stuck in the lobby forever).
  function applyGameState(status, currentQuestion) {
    const prev = gameRef.current
    if (!prev) return
    if (status === prev.status && currentQuestion === prev.currentQuestion) return
    // Keep the ref in sync immediately so back-to-back poll ticks compare
    // against the newest state, not a stale render.
    gameRef.current = { ...prev, status, currentQuestion }
    if (status === 'active') {
      if (prev.status !== 'active') {
        // Game just started — straight into the first question
        setSelectedAnswer(null)
        setSubmitted(false)
        setAutoRevealed(false)
        setRevealImageVisible(false)
        setPhase('playing')
      } else if (currentQuestion !== prev.currentQuestion) {
        // Host advanced. Don't yank the player to the next question — show a
        // scoreboard interstitial first so nobody misses the reveal/results,
        // and let them tap Ready to continue at their own pace.
        setSelectedAnswer(null)
        setSubmitted(false)
        setAutoRevealed(false)
        setRevealImageVisible(false)
        setLastRoundIdx(prev.currentQuestion)
        setPhase('between')
      }
    } else if (status === 'lobby') {
      setPhase('lobby')
    } else if (status === 'finished') {
      setPhase('finished')
    }
    setGame(g => (g ? { ...g, status, currentQuestion } : g))
  }

  // Realtime nudge for host reveals (if replication is enabled); polling below
  // covers everything regardless.
  function subscribeToGame(gid) {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase
      .channel(`game-player-${gid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reveals', filter: `game_id=eq.${gid}` },
        () => checkReveal(gid)
      )
      .subscribe()
  }

  async function checkReveal(gid) {
    const g = gameRef.current
    if (!g) return
    const { data } = await supabase
      .from('reveals')
      .select('question_idx')
      .eq('game_id', gid)
      .eq('question_idx', g.currentQuestion)
    setRevealImageVisible(!!(data && data.length > 0))
  }

  // One server-side call: players + running totals + answers for one round.
  async function refreshRoundState(qidx) {
    const { data } = await supabase.rpc('round_state', { gid: gameId, qidx })
    if (!data) return
    setTotalsRows(data.map(r => [r.player_name, r.total]))
    setRoundState({ qidx, byName: Object.fromEntries(data.filter(r => r.round_answer != null).map(r => [r.player_name, r.round_answer])) })
  }

  useEffect(() => {
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [])

  // Re-check reveal when question changes
  useEffect(() => {
    if (isMock) return
    if (game && gameId) checkReveal(gameId)
  }, [game?.currentQuestion])

  useEffect(() => { gameRef.current = game }, [game])

  // Main sync loop. The full game blob (with all its images) is downloaded
  // ONCE at join — after that we poll only tiny things: the game's status and
  // question number (a few bytes), reveal flags, and the answers/players rows.
  useEffect(() => {
    if (isMock || phase === 'join') return
    const poll = setInterval(async () => {
      const [st, rv] = await Promise.all([
        supabase.from('games').select('status:data->>status,current_question:data->currentQuestion').eq('game_id', gameId).single(),
        gameRef.current
          ? supabase.from('reveals').select('question_idx').eq('game_id', gameId).eq('question_idx', gameRef.current.currentQuestion)
          : Promise.resolve({ data: null }),
      ])
      if (st.data) applyGameState(st.data.status, st.data.current_question)
      if (rv.data) setRevealImageVisible(rv.data.length > 0)
      // On the interstitial we care about the round just played; otherwise the
      // current question. Either way it's one ~1KB server-computed response.
      const qidx = phase === 'between' && lastRoundIdx != null ? lastRoundIdx : gameRef.current?.currentQuestion
      if (qidx != null) refreshRoundState(qidx)
    }, 2500)
    return () => clearInterval(poll)
  }, [phase, gameId, isMock, lastRoundIdx])

  async function joinGame() {
    setError('')
    if (!playerName.trim()) { setError('Enter your name.'); return }

    if (isMock) {
      setGame(g => ({ ...g, players: [{ name: playerName.trim(), joinedAt: Date.now() }] }))
      setPhase('lobby')
      return
    }

    const { data, error: fetchErr } = await supabase.from('games').select('data').eq('game_id', gameId).single()
    if (fetchErr || !data) { setError('Game not found. Check your link.'); return }
    const g = data.data

    // Reuse the existing name row if they rejoin with different capitalization
    const { data: existing } = await supabase.from('game_players').select('player_name').eq('game_id', gameId)
    const match = (existing || []).find(r => r.player_name.toLowerCase() === playerName.trim().toLowerCase())
    const name = match ? match.player_name : playerName.trim()
    if (!match) {
      const { error: joinErr } = await supabase.from('game_players').insert({ game_id: gameId, player_name: name })
      if (joinErr && joinErr.code !== '23505') { setError('Could not join: ' + joinErr.message); return }
    }
    setPlayerName(name)

    setGame(g)
    gameRef.current = g
    await refreshRoundState(g.currentQuestion)

    // If they answered the current question before (e.g. phone reload), restore it
    const { data: mine } = await supabase.from('answers').select('answer')
      .eq('game_id', gameId).eq('player_name', name).eq('question_idx', g.currentQuestion)
    if (mine && mine.length > 0) {
      setSelectedAnswer(mine[0].answer)
      setSubmitted(true)
      if ((g.revealMode || 'auto') === 'auto') setAutoRevealed(true)
    }

    subscribeToGame(gameId)
    checkReveal(gameId)
    setPhase(g.status === 'active' ? 'playing' : g.status === 'finished' ? 'finished' : 'lobby')
  }

  async function submitAnswer(answer) {
    if (submitted || !game) return
    setSelectedAnswer(answer)
    setSubmitted(true)
    const key = `${playerName.trim()}:::${game.currentQuestion}`

    if (isMock) {
      setGame(g => ({ ...g, answers: { ...(g.answers || {}), [key]: answer } }))
      if (revealMode === 'auto') setTimeout(() => { setAutoRevealed(true); setRevealImageVisible(true) }, 700)
      return
    }

    // One tiny row — no more rewriting the whole game blob (which used to let
    // simultaneous answers wipe each other out and stall the host).
    // Correctness is stored at submit time so the server can total scores
    // without ever reading the big game blob.
    const q = game.questions[game.currentQuestion]
    const { error: subErr } = await supabase.from('answers').upsert(
      { game_id: gameId, player_name: playerName.trim(), question_idx: game.currentQuestion, answer, correct: answer === q?.author },
      { onConflict: 'game_id,player_name,question_idx' }
    )
    if (subErr) {
      setSubmitted(false)
      setSelectedAnswer(null)
      setError('Answer failed to send — tap to try again.')
      return
    }
    setError('')
    setRoundState(prev => prev.qidx === game.currentQuestion
      ? { ...prev, byName: { ...prev.byName, [playerName.trim()]: answer } }
      : { qidx: game.currentQuestion, byName: { [playerName.trim()]: answer } })
    if (revealMode === 'auto') setTimeout(() => setAutoRevealed(true), 700)
  }

  // Mock-only: lets the host simulate clicking "reveal" on their own dashboard
  function mockReveal() {
    setRevealImageVisible(true)
  }

  function startMockGame() {
    setGame(g => ({ ...g, status: 'active', currentQuestion: 0 }))
    setPhase('playing')
  }

  function advanceMockQuestion() {
    const next = game.currentQuestion + 1
    setSelectedAnswer(null)
    setSubmitted(false)
    setAutoRevealed(false)
    setRevealImageVisible(false)
    if (next >= game.questions.length) {
      setGame(g => ({ ...g, status: 'finished' }))
      setPhase('finished')
      return
    }
    setLastRoundIdx(game.currentQuestion)
    setGame(g => ({ ...g, currentQuestion: next }))
    setPhase('between')
  }

  function wrapMock(node) {
    if (!isMock) return node
    return (
      <div>
        <div style={mockBanner}>
          <span>🎮 PREVIEW MODE — nothing here is saved or seen by real players</span>
          <button onClick={onExitMock} style={mockExitBtn}>✕ Exit Preview</button>
        </div>
        {node}
      </div>
    )
  }

  function computeMyScore() {
    const row = totalsView.find(([name]) => name === playerName.trim())
    return row ? row[1] : 0
  }

  // Fetch this player's per-question history once for the finished screen
  useEffect(() => {
    if (isMock || phase !== 'finished' || !playerName.trim()) return
    supabase.from('answers').select('question_idx,answer').eq('game_id', gameId).eq('player_name', playerName.trim())
      .then(({ data }) => { if (data) setMyHistory(Object.fromEntries(data.map(r => [r.question_idx, r.answer]))) })
  }, [phase, isMock, gameId])

  // ── JOIN ──────────────────────────────────────────────────────────────────
  if (phase === 'join') return wrapMock(
    <ThemedPage theme={theme}>
      <div style={p.card}>
        <Logo theme={theme} p={p} />
        <div style={p.sub}>{theme.tagline}</div>
        <div style={p.field}>
          <label style={p.label}>YOUR NAME</label>
          <input style={p.input} placeholder="How should we call you?" value={playerName} onChange={e => setPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && joinGame()} autoFocus />
        </div>
        {error && <div style={p.err}>{error}</div>}
        <button style={p.joinBtn} onClick={joinGame}>Join Game →</button>
      </div>
    </ThemedPage>
  )

  // ── LOBBY ─────────────────────────────────────────────────────────────────
  if (phase === 'lobby') return wrapMock(
    <ThemedPage theme={theme}>
      <div style={p.card}>
        {theme.logoImage && <img src={theme.logoImage} alt="logo" style={p.logoImg} />}
        <div style={p.gameTitle}>{game?.title}</div>
        {theme.welcomeMessage?.trim() && (
          <div style={p.welcomeBox}>{theme.welcomeMessage}</div>
        )}
        <div style={p.waiting}><span style={p.dot}>●</span> Waiting for host to start…</div>
        <div style={{ textAlign: 'center', color: withAlpha(theme.textColor, 0.5), fontSize: 12, marginBottom: 12 }}>{playersArr.length} player{playersArr.length !== 1 ? 's' : ''} joined</div>
        <div style={{ textAlign: 'center', fontSize: 13, color: withAlpha(theme.textColor, 0.65), marginBottom: 20 }}>You're in as <strong style={{ color: theme.primaryColor }}>{playerName}</strong></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {playersArr.map(pl => (
            <div key={pl.name} style={{ padding: '6px 14px', border: `1px solid ${pl.name === playerName ? theme.primaryColor : withAlpha(theme.textColor, 0.2)}`, background: pl.name === playerName ? withAlpha(theme.primaryColor, 0.1) : withAlpha(theme.textColor, 0.06), borderRadius: 20, fontSize: 12, color: theme.textColor }}>
              {pl.name === playerName ? '★ ' : ''}{pl.name}
            </div>
          ))}
        </div>
        {isMock && (
          <button style={{ ...p.joinBtn, marginTop: 28 }} onClick={startMockGame}>🚀 Simulate Host Starting →</button>
        )}
      </div>
    </ThemedPage>
  )

  // ── PLAYING ───────────────────────────────────────────────────────────────
  if (phase === 'playing' && game) {
    const q = game.questions[game.currentQuestion]
    if (!q) return wrapMock(<ThemedPage theme={theme}><div style={p.card}><div style={p.waiting}>Loading…</div></div></ThemedPage>)
    const isCorrect = submitted && selectedAnswer === q.author

    return wrapMock(
      <ThemedPage theme={theme}>
        <div style={p.playWrap}>
          <div style={p.progressRow}>
            <span style={p.progressLabel}>Q{game.currentQuestion + 1} / {game.questions.length}</span>
            <div style={p.progressTrack}>
              <div style={{ ...p.progressFill, width: `${((game.currentQuestion + 1) / game.questions.length) * 100}%` }} />
            </div>
          </div>
          <div style={p.bubble}>
            <div style={p.handle}>@someone</div>
            {q.questionImage && <img src={q.questionImage} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 8, marginBottom: 10, marginTop: 4, display: 'block' }} />}
            <div style={p.postText}>{q.post}</div>
          </div>
          <div style={p.whoLabel}>{q.questionLabel?.trim() || theme.questionLabel}</div>
          <div style={p.choiceGrid}>
            {q.choices.map(choice => {
              let bg = theme.cardColor, border = withAlpha(theme.textColor, 0.18), color = theme.textColor
              if (submitted) {
                if (choice === q.author && revealed) { bg = withAlpha(theme.secondaryColor, 0.13); border = theme.secondaryColor; color = theme.secondaryColor }
                else if (choice === selectedAnswer && choice !== q.author && revealed) { bg = '#ff6b6b22'; border = '#ff6b6b'; color = '#ff6b6b' }
                else if (choice === selectedAnswer && !revealed) { bg = withAlpha(theme.primaryColor, 0.13); border = theme.primaryColor; color = theme.primaryColor }
                else { border = withAlpha(theme.textColor, 0.08); color = withAlpha(theme.textColor, 0.2) }
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
            <div style={{ ...p.feedback, background: isCorrect ? withAlpha(theme.secondaryColor, 0.13) : '#ff6b6b22', borderColor: isCorrect ? theme.secondaryColor : '#ff6b6b', color: isCorrect ? theme.secondaryColor : '#ff6b6b' }}>
              {isCorrect ? '🎉 Correct! +1 point' : `❌ It was ${q.author}`}
            </div>
          )}
          {submitted && !revealed && (
            <div style={p.locking}>{revealMode === 'manual' ? "Answer locked in — waiting for the host to reveal…" : 'Locking in your answer…'}</div>
          )}
          {!submitted && error && <div style={p.err}>{error}</div>}
          {!submitted && <div style={p.tapHint}>Tap to answer</div>}
          {isMock && submitted && !revealed && revealMode === 'manual' && (
            <button style={{ ...p.joinBtn, marginTop: 8 }} onClick={mockReveal}>🎉 Reveal Answer (simulate host)</button>
          )}
          {submitted && revealImageVisible && q.revealImage && (
            <div style={p.revealBox}>
              <div style={p.revealLabel}>🎉 HOST REVEAL</div>
              <img src={q.revealImage} alt="reveal" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 8, border: `1px solid ${withAlpha(theme.secondaryColor, 0.27)}`, display: 'block' }} />
            </div>
          )}
          {submitted && !revealImageVisible && q.revealImage && (
            <div style={{ textAlign: 'center', color: withAlpha(theme.textColor, 0.2), fontSize: 11, letterSpacing: 1, marginTop: 20 }}>Waiting for host reveal…</div>
          )}
          {submitted && revealed && playersArr.length > 0 && (
            <div style={p.lbBox}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: withAlpha(theme.textColor, 0.5), marginBottom: 14 }}>THIS ROUND</div>
              {playersArr.map(pl => {
                const ans = getRoundAnswer(pl.name, game.currentQuestion)
                const state = ans == null ? 'waiting' : ans === q.author ? 'right' : 'wrong'
                return (
                  <div key={pl.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px', borderRadius: 4, background: pl.name === playerName ? withAlpha(theme.primaryColor, 0.1) : 'transparent' }}>
                    <span style={{ width: 24, fontSize: 14, textAlign: 'center' }}>{state === 'right' ? '✅' : state === 'wrong' ? '❌' : '⏳'}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: pl.name === playerName ? theme.primaryColor : theme.textColor }}>{pl.name}</span>
                    <span style={{ fontSize: 12, color: state === 'waiting' ? withAlpha(theme.textColor, 0.4) : state === 'right' ? theme.secondaryColor : '#ff6b6b' }}>
                      {state === 'waiting' ? 'still guessing…' : state === 'right' ? 'got it!' : `guessed ${ans}`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          {isMock && submitted && revealed && (
            <button style={p.joinBtn} onClick={advanceMockQuestion}>
              {game.currentQuestion + 1 >= game.questions.length ? 'Finish Preview →' : 'Next Question →'}
            </button>
          )}
        </div>
      </ThemedPage>
    )
  }

  // ── BETWEEN ROUNDS (scoreboard interstitial) ──────────────────────────────
  // Shown when the host advances: round results + running totals, and the
  // player taps Ready when they've seen it — so nobody misses the reveal.
  if (phase === 'between' && game) {
    const li = lastRoundIdx
    const lq = li != null ? game.questions[li] : null
    const totals = totalsView
    return wrapMock(
      <ThemedPage theme={theme}>
        <div style={p.card}>
          {theme.logoImage && <img src={theme.logoImage} alt="logo" style={p.logoImg} />}
          {lq && (
            <div style={p.lbBox}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: withAlpha(theme.textColor, 0.5), marginBottom: 6 }}>ROUND {li + 1} RESULTS</div>
              <div style={{ fontSize: 12, color: withAlpha(theme.textColor, 0.65), marginBottom: 14 }}>The answer was <strong style={{ color: theme.secondaryColor }}>{lq.author}</strong></div>
              {playersArr.map(pl => {
                const ans = getRoundAnswer(pl.name, li)
                const state = ans == null ? 'none' : ans === lq.author ? 'right' : 'wrong'
                return (
                  <div key={pl.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px', borderRadius: 4, background: pl.name === playerName ? withAlpha(theme.primaryColor, 0.1) : 'transparent' }}>
                    <span style={{ width: 24, fontSize: 14, textAlign: 'center' }}>{state === 'right' ? '✅' : state === 'wrong' ? '❌' : '—'}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: pl.name === playerName ? theme.primaryColor : theme.textColor }}>{pl.name}</span>
                    <span style={{ fontSize: 12, color: state === 'none' ? withAlpha(theme.textColor, 0.4) : state === 'right' ? theme.secondaryColor : '#ff6b6b' }}>
                      {state === 'none' ? 'no answer' : state === 'right' ? '+1 point' : `guessed ${ans}`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <div style={p.lbBox}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: withAlpha(theme.textColor, 0.5), marginBottom: 14 }}>SCOREBOARD</div>
            {totals.map(([name, score], i) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px', borderRadius: 4, background: name === playerName ? withAlpha(theme.primaryColor, 0.1) : 'transparent' }}>
                <span style={{ width: 24, fontSize: 14, textAlign: 'center' }}>{['🏆', '🥈', '🥉'][i] || `#${i + 1}`}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: name === playerName ? theme.primaryColor : theme.textColor }}>{name}</span>
                <span style={{ fontSize: 13, color: theme.primaryColor }}>{score} pt{score !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
          <button style={p.joinBtn} onClick={() => setPhase('playing')}>I'm Ready — Next Question →</button>
        </div>
      </ThemedPage>
    )
  }

  // ── FINISHED ──────────────────────────────────────────────────────────────
  if (phase === 'finished' && game) {
    const myScore = computeMyScore()
    const allScores = totalsView
    const myRank = allScores.findIndex(([name]) => name === playerName) + 1
    const total = game.questions.length

    return wrapMock(
      <ThemedPage theme={theme}>
        <div style={p.card}>
          {theme.logoImage && <img src={theme.logoImage} alt="logo" style={p.logoImg} />}
          <div style={p.finTitle}>GAME OVER!</div>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 64, fontWeight: 900, color: theme.textColor, lineHeight: 1 }}>
              {myScore}<span style={{ fontSize: 32, color: withAlpha(theme.textColor, 0.35) }}>/{total}</span>
            </div>
            <div style={{ fontSize: 12, color: withAlpha(theme.textColor, 0.5), letterSpacing: 2, marginTop: 8 }}>your score · rank #{myRank}</div>
          </div>
          <div style={p.lbBox}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: withAlpha(theme.textColor, 0.5), marginBottom: 14 }}>FINAL STANDINGS</div>
            {allScores.map(([name, score], i) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 6px', borderRadius: 4, background: name === playerName ? withAlpha(theme.primaryColor, 0.1) : 'transparent', marginBottom: 4 }}>
                <span style={{ width: 28, fontSize: 16, textAlign: 'center' }}>{['🏆','🥈','🥉'][i] || `#${i+1}`}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: name === playerName ? theme.primaryColor : theme.textColor }}>{name}</span>
                <span style={{ fontSize: 13, color: theme.primaryColor }}>{score} pts</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: withAlpha(theme.textColor, 0.5), marginBottom: 14 }}>YOUR ANSWERS</div>
            {game.questions.map((q, i) => {
              const myAns = isMock ? (game.answers || {})[`${playerName}:::${i}`] : myHistory[i]
              const correct = myAns === q.author
              return (
                <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${withAlpha(theme.textColor, 0.1)}` }}>
                  <div style={{ fontSize: 12, color: withAlpha(theme.textColor, 0.5), fontStyle: 'italic', marginBottom: 4 }}>"{q.post.substring(0, 65)}{q.post.length > 65 ? '…' : ''}"</div>
                  {q.revealImage && <img src={q.revealImage} alt="" style={{ width: 140, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 4, marginBottom: 6, opacity: 0.8, display: 'block' }} />}
                  <div style={{ fontSize: 12, fontWeight: 700, color: correct ? theme.secondaryColor : '#ff6b6b' }}>
                    {correct ? '✓' : '✗'} {myAns || '—'} {!correct && `(was: ${q.author})`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </ThemedPage>
    )
  }

  return wrapMock(<ThemedPage theme={theme}><div style={p.card}><div style={p.waiting}>Loading…</div></div></ThemedPage>)
}

const mockBanner = { position: 'sticky', top: 0, zIndex: 2000, background: '#000', color: '#ffd166', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 0.5, borderBottom: '2px solid #ffd166' }
const mockExitBtn = { background: '#ffd166', color: '#111', border: 'none', borderRadius: 3, padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 900, letterSpacing: 1, fontFamily: "'Courier New', monospace", whiteSpace: 'nowrap' }

function ThemedPage({ theme, children }) {
  return (
    <div style={{ minHeight: '100vh', background: theme.backgroundColor, position: 'relative', overflow: 'hidden' }}>
      {theme.backgroundImage && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${theme.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.35 }} />
      )}
      <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', fontFamily: theme.bodyFont, padding: '20px 16px 80px' }}>
        {children}
      </div>
    </div>
  )
}

function Logo({ theme, p }) {
  if (theme.logoImage) return <img src={theme.logoImage} alt="logo" style={p.logoImg} />
  const { lead, accent } = getBrandParts()
  return <div style={p.logo}>{lead} <span style={p.accent}>{accent}</span></div>
}

function buildPlayerStyles(theme) {
  const { primaryColor: primary, secondaryColor: secondary, cardColor: card, textColor: text, headingFont, bodyFont } = theme
  return {
    card: { width: '100%', maxWidth: 420, paddingTop: 40, position: 'relative', zIndex: 1 },
    playWrap: { width: '100%', maxWidth: 420, paddingTop: 20, position: 'relative', zIndex: 1 },
    logo: { fontSize: 32, fontWeight: 900, letterSpacing: 4, color: text, fontFamily: headingFont, textAlign: 'center', marginBottom: 6, textTransform: 'uppercase' },
    logoImg: { maxWidth: 220, maxHeight: 110, objectFit: 'contain', display: 'block', margin: '0 auto 14px' },
    accent: { color: primary },
    sub: { textAlign: 'center', color: withAlpha(text, 0.45), fontSize: 12, letterSpacing: 2, marginBottom: 36 },
    gameTitle: { fontSize: 22, fontWeight: 900, color: primary, textAlign: 'center', marginBottom: 28, fontFamily: headingFont },
    welcomeBox: { background: card, border: `1px solid ${withAlpha(text, 0.12)}`, borderRadius: 10, padding: '18px 20px', marginBottom: 24, fontSize: 13, color: text, lineHeight: 1.65, whiteSpace: 'pre-line', textAlign: 'left' },
    field: { marginBottom: 20 },
    label: { display: 'block', fontSize: 10, letterSpacing: 2, color: withAlpha(text, 0.5), marginBottom: 8, fontWeight: 700 },
    input: { width: '100%', background: card, border: `1px solid ${withAlpha(text, 0.15)}`, borderRadius: 4, color: text, padding: '14px 16px', fontSize: 15, fontFamily: bodyFont, boxSizing: 'border-box' },
    err: { color: '#ff6b6b', fontSize: 12, marginBottom: 16, textAlign: 'center' },
    joinBtn: { width: '100%', padding: '16px', background: primary, color: contrastColor(primary), border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 900, cursor: 'pointer', letterSpacing: 2, fontFamily: headingFont, marginTop: 8 },
    waiting: { textAlign: 'center', color: withAlpha(text, 0.65), fontSize: 14, padding: '40px 0 16px', letterSpacing: 1 },
    dot: { color: secondary, marginRight: 8 },
    progressRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
    progressLabel: { fontSize: 10, letterSpacing: 2, color: withAlpha(text, 0.5), whiteSpace: 'nowrap' },
    progressTrack: { flex: 1, height: 3, background: withAlpha(text, 0.12), borderRadius: 2 },
    progressFill: { height: '100%', background: primary, borderRadius: 2, transition: 'width 0.4s' },
    bubble: { background: card, border: `1px solid ${withAlpha(text, 0.12)}`, borderRadius: 12, borderTopLeftRadius: 4, padding: '16px 18px', marginBottom: 24 },
    handle: { fontSize: 11, color: withAlpha(text, 0.5), marginBottom: 8, letterSpacing: 1 },
    postText: { fontSize: 16, color: text, lineHeight: 1.65 },
    whoLabel: { fontSize: 10, letterSpacing: 3, color: withAlpha(text, 0.5), marginBottom: 14, textAlign: 'center' },
    choiceGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 },
    choiceBtn: { padding: '16px 10px', border: '2px solid', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', fontFamily: bodyFont },
    feedback: { border: '1px solid', borderRadius: 6, padding: '13px 16px', textAlign: 'center', fontSize: 14, fontWeight: 700, marginBottom: 16 },
    locking: { textAlign: 'center', color: withAlpha(text, 0.5), fontSize: 12, letterSpacing: 1, padding: '10px 0' },
    tapHint: { textAlign: 'center', color: withAlpha(text, 0.25), fontSize: 11, letterSpacing: 2 },
    revealBox: { marginTop: 20, background: card, border: `1px solid ${withAlpha(secondary, 0.13)}`, borderRadius: 8, padding: 16 },
    revealLabel: { fontSize: 10, letterSpacing: 3, color: secondary, marginBottom: 10 },
    finTitle: { fontSize: 36, fontWeight: 900, color: primary, textAlign: 'center', fontFamily: headingFont, letterSpacing: 4, marginBottom: 24 },
    lbBox: { background: card, border: `1px solid ${withAlpha(text, 0.12)}`, borderRadius: 6, padding: '16px 20px', marginBottom: 28 },
  }
}
