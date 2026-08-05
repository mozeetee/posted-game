import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getTheme, ensureGoogleFont, withAlpha, contrastColor, getBrandParts } from './theme'
import { Avatar, AVATARS } from './Avatar'

const WRONG = '#c0553a' // warm brick red for "incorrect" — reads on the oat paper

export default function PlayerRoom({ gameId, initialName = '', mockGame = null, onExitMock = null }) {
  const isMock = !!mockGame
  const [phase, setPhase] = useState('join')
  const [playerName, setPlayerName] = useState(initialName || (isMock ? 'Preview' : ''))
  // Everyone gets a field-creature avatar; pre-pick a random one so the join
  // screen looks alive, but they can tap another.
  const [selectedAvatar, setSelectedAvatar] = useState(() => AVATARS[Math.floor(Math.random() * AVATARS.length)].id)
  const [avatarMap, setAvatarMap] = useState({}) // player_name -> avatar id (real games)
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
  const accent = theme.accentColor || theme.secondaryColor
  const p = buildPlayerStyles(theme)
  const revealMode = game?.revealMode || 'auto'
  // In manual mode the correct answer stays hidden until the host broadcasts
  // a reveal for this question (the same signal that shows the bonus image).
  const revealed = revealMode === 'manual' ? (submitted && revealImageVisible) : autoRevealed
  // Mock preview keeps everything in-memory on the game object; real games use the server.
  const playersArr = isMock ? (game?.players || []) : totalsRows.map(([name]) => ({ name }))
  const totalsView = isMock ? computeMockScores() : totalsRows

  // Which avatar a given player chose (self is authoritative locally).
  function avatarFor(name) {
    if (name === playerName.trim()) return selectedAvatar
    if (isMock) return (game?.players || []).find(pl => pl.name === name)?.avatar
    return avatarMap[name]
  }

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

  // player_name -> avatar id, tolerating a DB that hasn't added the avatar column.
  async function refreshAvatars() {
    if (isMock) return
    let res = await supabase.from('game_players').select('player_name,avatar').eq('game_id', gameId)
    if (res.error) res = await supabase.from('game_players').select('player_name').eq('game_id', gameId)
    if (res.data) setAvatarMap(Object.fromEntries(res.data.map(r => [r.player_name, r.avatar || null])))
  }

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
      refreshAvatars()
    }, 2500)
    return () => clearInterval(poll)
  }, [phase, gameId, isMock, lastRoundIdx])

  async function joinGame() {
    setError('')
    if (!playerName.trim()) { setError('Enter your name to jump in.'); return }

    if (isMock) {
      setGame(g => ({ ...g, players: [{ name: playerName.trim(), joinedAt: Date.now(), avatar: selectedAvatar }] }))
      setPhase('lobby')
      return
    }

    const { data, error: fetchErr } = await supabase.from('games').select('data').eq('game_id', gameId).single()
    if (fetchErr || !data) { setError('We couldn\'t find that game — double-check your link.'); return }
    const g = data.data

    // Reuse the existing name row if they rejoin with different capitalization
    const { data: existing } = await supabase.from('game_players').select('player_name').eq('game_id', gameId)
    const match = (existing || []).find(r => r.player_name.toLowerCase() === playerName.trim().toLowerCase())
    const name = match ? match.player_name : playerName.trim()
    if (!match) {
      // Try to save their avatar too; if this DB hasn't added the column yet,
      // fall back to a plain insert so joining still works.
      let ins = await supabase.from('game_players').insert({ game_id: gameId, player_name: name, avatar: selectedAvatar })
      if (ins.error && /avatar/i.test(ins.error.message || '')) {
        ins = await supabase.from('game_players').insert({ game_id: gameId, player_name: name })
      }
      if (ins.error && ins.error.code !== '23505') { setError('Couldn\'t join: ' + ins.error.message); return }
    } else {
      // Rejoining — keep their chosen creature in sync (ignore if column absent).
      await supabase.from('game_players').update({ avatar: selectedAvatar }).eq('game_id', gameId).eq('player_name', name)
    }
    setPlayerName(name)

    setGame(g)
    gameRef.current = g
    await refreshRoundState(g.currentQuestion)
    refreshAvatars()

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
      setError('That didn\'t send — tap your answer again.')
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
          <span>🎮 Preview — nothing here is saved or seen by real players</span>
          <button onClick={onExitMock} style={mockExitBtn}>✕ Exit preview</button>
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

  // A leaderboard/standings row with the player's creature.
  function PlayerRow({ name, left, right, highlight, size = 30 }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '7px 6px', borderRadius: 12, background: highlight ? withAlpha(theme.primaryColor, 0.1) : 'transparent' }}>
        {left}
        <Avatar id={avatarFor(name)} fallback={name} size={size} />
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: highlight ? theme.primaryColor : theme.textColor }}>{name}</span>
        {right}
      </div>
    )
  }

  // ── JOIN ──────────────────────────────────────────────────────────────────
  if (phase === 'join') return wrapMock(
    <ThemedPage theme={theme}>
      <div style={p.card}>
        <Logo theme={theme} p={p} />
        <div style={p.sub}>{theme.tagline}</div>

        <div style={p.pickTitle}>Pick your character</div>
        <div style={p.avGrid}>
          {AVATARS.map(a => {
            const on = a.id === selectedAvatar
            return (
              <button
                key={a.id}
                onClick={() => setSelectedAvatar(a.id)}
                aria-pressed={on}
                title={a.name}
                style={{ ...p.avCell, borderColor: on ? theme.primaryColor : withAlpha(theme.textColor, 0.1), boxShadow: on ? `0 0 0 3px ${withAlpha(theme.primaryColor, 0.15)}` : 'none' }}
              >
                <Avatar id={a.id} size={44} />
              </button>
            )
          })}
        </div>

        <div style={{ ...p.field, marginTop: 14 }}>
          <label style={p.label}>Your name</label>
          <input style={p.input} placeholder="How should we call you?" value={playerName} onChange={e => setPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && joinGame()} autoFocus />
        </div>
        {error && <div style={p.err}>{error}</div>}
        <button style={p.joinBtn} onClick={joinGame}>Join the game →</button>
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
        <div style={p.waiting}><span style={p.dot}>●</span> Waiting for the host to start…</div>
        <div style={{ textAlign: 'center', fontSize: 13, color: withAlpha(theme.textColor, 0.65), marginBottom: 6 }}>
          You're in as <strong style={{ color: theme.primaryColor }}>{playerName}</strong>
        </div>
        <div style={{ textAlign: 'center', color: withAlpha(theme.textColor, 0.5), fontSize: 12, marginBottom: 18 }}>{playersArr.length} {playersArr.length === 1 ? 'friend' : 'friends'} here so far</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {playersArr.map(pl => {
            const me = pl.name === playerName
            return (
              <div key={pl.name} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px 5px 5px', border: `1.5px solid ${me ? theme.primaryColor : withAlpha(theme.textColor, 0.12)}`, background: me ? withAlpha(theme.primaryColor, 0.08) : theme.cardColor, borderRadius: 22, fontSize: 12.5, fontWeight: 700, color: me ? theme.primaryColor : theme.textColor }}>
                <Avatar id={avatarFor(pl.name)} fallback={pl.name} size={24} />
                {pl.name}
              </div>
            )
          })}
        </div>
        {isMock && (
          <button style={{ ...p.joinBtn, marginTop: 28 }} onClick={startMockGame}>🚀 Simulate host starting →</button>
        )}
      </div>
    </ThemedPage>
  )

  // ── PLAYING ───────────────────────────────────────────────────────────────
  if (phase === 'playing' && game) {
    const q = game.questions[game.currentQuestion]
    if (!q) return wrapMock(<ThemedPage theme={theme}><div style={p.card}><div style={p.waiting}>Loading…</div></div></ThemedPage>)
    const isCorrect = submitted && selectedAnswer === q.author
    const choices = q.choices.filter(c => c && c.trim())

    return wrapMock(
      <ThemedPage theme={theme}>
        <div style={p.playWrap}>
          <div style={p.progressRow}>
            <span style={p.progressLabel}>{game.currentQuestion + 1} <span style={{ color: withAlpha(theme.textColor, 0.4) }}>/ {game.questions.length}</span></span>
            <div style={p.progressTrack}>
              <div style={{ ...p.progressFill, width: `${((game.currentQuestion + 1) / game.questions.length) * 100}%` }} />
            </div>
          </div>
          <div style={p.bubble}>
            <div style={p.qEyebrow}>{q.questionLabel?.trim() || theme.questionLabel}</div>
            {q.questionImage && <img src={q.questionImage} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 12, marginBottom: 12, display: 'block' }} />}
            <div style={p.postText}>{q.post}</div>
          </div>
          <div style={p.optList}>
            {choices.map((choice, idx) => {
              const letter = String.fromCharCode(65 + idx)
              let bg = theme.cardColor, border = withAlpha(theme.textColor, 0.12), color = theme.textColor
              let badgeBg = withAlpha(theme.textColor, 0.08), badgeColor = withAlpha(theme.textColor, 0.55), mark = letter
              if (submitted) {
                if (choice === q.author && revealed) { bg = withAlpha(theme.secondaryColor, 0.14); border = theme.secondaryColor; color = theme.secondaryColor; badgeBg = theme.secondaryColor; badgeColor = contrastColor(theme.secondaryColor); mark = '✓' }
                else if (choice === selectedAnswer && choice !== q.author && revealed) { bg = withAlpha(WRONG, 0.12); border = WRONG; color = WRONG; badgeBg = WRONG; badgeColor = '#fff'; mark = '✕' }
                else if (choice === selectedAnswer && !revealed) { bg = withAlpha(theme.primaryColor, 0.12); border = theme.primaryColor; color = theme.primaryColor; badgeBg = theme.primaryColor; badgeColor = contrastColor(theme.primaryColor) }
                else { border = withAlpha(theme.textColor, 0.08); color = withAlpha(theme.textColor, 0.3); badgeColor = withAlpha(theme.textColor, 0.3) }
              }
              return (
                <button key={choice} style={{ ...p.optBtn, background: bg, borderColor: border, color }} onClick={() => submitAnswer(choice)} disabled={submitted}>
                  <span style={{ ...p.optBadge, background: badgeBg, color: badgeColor }}>{mark}</span>
                  <span>{choice}</span>
                </button>
              )
            })}
          </div>
          {submitted && revealed && (
            <div style={{ ...p.feedback, background: isCorrect ? withAlpha(theme.secondaryColor, 0.14) : withAlpha(WRONG, 0.12), color: isCorrect ? theme.secondaryColor : WRONG }}>
              {isCorrect ? '🎉 Nailed it! +1 point' : `So close — it was ${q.author}`}
            </div>
          )}
          {submitted && !revealed && (
            <div style={p.locking}>{revealMode === 'manual' ? 'Locked in — waiting for the host to reveal…' : 'Locking in your answer…'}</div>
          )}
          {!submitted && error && <div style={p.err}>{error}</div>}
          {!submitted && <div style={p.tapHint}>Tap your guess</div>}
          {isMock && submitted && !revealed && revealMode === 'manual' && (
            <button style={{ ...p.joinBtn, marginTop: 8 }} onClick={mockReveal}>🎉 Reveal answer (simulate host)</button>
          )}
          {submitted && revealImageVisible && q.revealImage && (
            <div style={p.revealBox}>
              <div style={p.revealLabel}>🎉 THE REVEAL</div>
              <img src={q.revealImage} alt="reveal" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 12, border: `1px solid ${withAlpha(theme.secondaryColor, 0.27)}`, display: 'block' }} />
            </div>
          )}
          {submitted && !revealImageVisible && q.revealImage && (
            <div style={{ textAlign: 'center', color: withAlpha(theme.textColor, 0.3), fontSize: 12, marginTop: 18 }}>Waiting for the host reveal…</div>
          )}
          {submitted && revealed && playersArr.length > 0 && (
            <div style={p.lbBox}>
              <div style={p.lbHead}>This round</div>
              {playersArr.map(pl => {
                const ans = getRoundAnswer(pl.name, game.currentQuestion)
                const state = ans == null ? 'waiting' : ans === q.author ? 'right' : 'wrong'
                return (
                  <PlayerRow key={pl.name} name={pl.name} highlight={pl.name === playerName}
                    right={<span style={{ fontSize: 12, fontWeight: 700, color: state === 'waiting' ? withAlpha(theme.textColor, 0.4) : state === 'right' ? theme.secondaryColor : WRONG }}>
                      {state === 'waiting' ? 'still guessing…' : state === 'right' ? 'got it!' : `guessed ${ans}`}
                    </span>}
                  />
                )
              })}
            </div>
          )}
          {isMock && submitted && revealed && (
            <button style={p.joinBtn} onClick={advanceMockQuestion}>
              {game.currentQuestion + 1 >= game.questions.length ? 'Finish preview →' : 'Next question →'}
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
              <div style={p.lbHead}>Round {li + 1} results</div>
              <div style={{ fontSize: 12.5, color: withAlpha(theme.textColor, 0.65), marginBottom: 12 }}>The answer was <strong style={{ color: theme.secondaryColor }}>{lq.author}</strong></div>
              {playersArr.map(pl => {
                const ans = getRoundAnswer(pl.name, li)
                const state = ans == null ? 'none' : ans === lq.author ? 'right' : 'wrong'
                return (
                  <PlayerRow key={pl.name} name={pl.name} highlight={pl.name === playerName}
                    right={<span style={{ fontSize: 12, fontWeight: 700, color: state === 'none' ? withAlpha(theme.textColor, 0.4) : state === 'right' ? theme.secondaryColor : WRONG }}>
                      {state === 'none' ? 'no answer' : state === 'right' ? '+1 point' : `guessed ${ans}`}
                    </span>}
                  />
                )
              })}
            </div>
          )}
          <div style={p.lbBox}>
            <div style={p.lbHead}>Scoreboard</div>
            {totals.map(([name, score], i) => (
              <PlayerRow key={name} name={name} highlight={name === playerName}
                left={<span style={{ width: 22, textAlign: 'center', fontSize: 14 }}>{['🏆', '🥈', '🥉'][i] || `#${i + 1}`}</span>}
                right={<span style={{ fontSize: 13, fontWeight: 800, color: theme.primaryColor }}>{score} pt{score !== 1 ? 's' : ''}</span>}
              />
            ))}
          </div>
          <button style={p.joinBtn} onClick={() => setPhase('playing')}>I'm ready — next question →</button>
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
    const ratio = total ? myScore / total : 0
    const headline = ratio >= 0.9 ? 'You really know them!' : ratio >= 0.7 ? 'Nicely done!' : ratio >= 0.5 ? 'Not bad at all!' : ratio >= 0.3 ? 'A few got you!' : 'It\'s the taking part that counts!'
    const rankLine = myRank === 1 ? 'First place — nobody knows them better.' : myRank === 2 ? 'Second place, so close to the top!' : myRank === 3 ? 'Third place — on the podium!' : `You finished #${myRank} of ${allScores.length}.`

    return wrapMock(
      <ThemedPage theme={theme}>
        <div style={p.card}>
          {theme.logoImage && <img src={theme.logoImage} alt="logo" style={p.logoImg} />}
          <div style={p.eyebrow}>The reveal</div>
          <div style={p.burst}>
            <span style={{ ...p.halo, borderColor: withAlpha(theme.primaryColor, 0.4) }} />
            {['-2px 20px', '14px auto -2px', 'auto -2px 8px', '-4px auto 22px'].map((pos, i) => {
              const [t, r, b] = pos.split(' ')
              return <span key={i} style={{ position: 'absolute', top: t !== 'auto' ? t : undefined, right: r !== 'auto' ? r : undefined, bottom: b !== 'auto' ? b : undefined, color: accent, fontSize: 13 }}>✦</span>
            })}
            <Avatar id={selectedAvatar} size={104} style={{ border: `3px solid ${theme.cardColor}`, boxShadow: `0 8px 20px -10px ${withAlpha(theme.textColor, 0.5)}` }} />
          </div>
          <div style={{ ...p.eyebrow, marginTop: 16, marginBottom: 2 }}>Your score</div>
          <div style={{ textAlign: 'center', fontFamily: theme.headingFont, fontWeight: 600, color: theme.primaryColor, fontSize: 44, lineHeight: 1 }}>
            {myScore}<span style={{ color: withAlpha(theme.textColor, 0.35), fontSize: 26 }}> / {total}</span>
          </div>
          <div style={{ textAlign: 'center', fontFamily: theme.headingFont, fontWeight: 600, color: theme.textColor, fontSize: 24, marginTop: 12 }}>{headline}</div>
          <div style={{ textAlign: 'center', fontSize: 13, color: withAlpha(theme.textColor, 0.6), marginTop: 6, marginBottom: 26 }}>{rankLine}</div>

          <div style={p.lbBox}>
            <div style={p.lbHead}>Final standings</div>
            {allScores.map(([name, score], i) => (
              <PlayerRow key={name} name={name} highlight={name === playerName} size={32}
                left={<span style={{ width: 26, textAlign: 'center', fontSize: 15 }}>{['🏆', '🥈', '🥉'][i] || `#${i + 1}`}</span>}
                right={<span style={{ fontSize: 13, fontWeight: 800, color: theme.primaryColor }}>{score} pts</span>}
              />
            ))}
          </div>
          <div>
            <div style={p.lbHead}>Your answers</div>
            {game.questions.map((q, i) => {
              const myAns = isMock ? (game.answers || {})[`${playerName}:::${i}`] : myHistory[i]
              const correct = myAns === q.author
              return (
                <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${withAlpha(theme.textColor, 0.08)}` }}>
                  <div style={{ fontSize: 12.5, color: withAlpha(theme.textColor, 0.55), marginBottom: 5 }}>"{q.post.substring(0, 70)}{q.post.length > 70 ? '…' : ''}"</div>
                  {q.revealImage && <img src={q.revealImage} alt="" style={{ width: 120, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10, marginBottom: 6, display: 'block' }} />}
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: correct ? theme.secondaryColor : WRONG }}>
                    {correct ? '✓' : '✕'} {myAns || '—'} {!correct && `· it was ${q.author}`}
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

const mockBanner = { position: 'sticky', top: 0, zIndex: 2000, background: '#2e2a1f', color: '#f0e4c4', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, fontWeight: 700, borderBottom: '2px solid #c26742' }
const mockExitBtn = { background: '#c26742', color: '#fff', border: 'none', borderRadius: 20, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: "'Nunito Sans', sans-serif", whiteSpace: 'nowrap' }

function ThemedPage({ theme, children }) {
  return (
    <div style={{ minHeight: '100vh', background: theme.backgroundColor, position: 'relative', overflow: 'hidden' }}>
      {theme.backgroundImage && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${theme.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.5 }} />
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
  const accent = theme.accentColor || secondary
  const soft = (c, a) => withAlpha(c, a)
  return {
    card: { width: '100%', maxWidth: 430, paddingTop: 30, position: 'relative', zIndex: 1 },
    playWrap: { width: '100%', maxWidth: 430, paddingTop: 16, position: 'relative', zIndex: 1 },
    logo: { fontSize: 34, fontWeight: 600, color: text, fontFamily: headingFont, textAlign: 'center', marginBottom: 4, lineHeight: 1 },
    accent: { color: primary },
    logoImg: { maxWidth: 220, maxHeight: 110, objectFit: 'contain', display: 'block', margin: '0 auto 14px' },
    eyebrow: { textAlign: 'center', color: accent, fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', fontWeight: 800 },
    sub: { textAlign: 'center', color: soft(text, 0.6), fontSize: 13.5, marginBottom: 26, lineHeight: 1.5 },
    gameTitle: { fontSize: 25, fontWeight: 600, color: primary, textAlign: 'center', marginBottom: 22, fontFamily: headingFont, lineHeight: 1.12 },
    welcomeBox: { background: card, border: `1px solid ${soft(text, 0.1)}`, borderRadius: 16, padding: '18px 20px', marginBottom: 24, fontSize: 13.5, color: text, lineHeight: 1.65, whiteSpace: 'pre-line', textAlign: 'left' },
    field: { marginBottom: 14 },
    label: { display: 'block', fontSize: 10, letterSpacing: '.16em', color: soft(text, 0.55), marginBottom: 7, fontWeight: 800, textTransform: 'uppercase' },
    input: { width: '100%', background: card, border: `1.5px solid ${soft(text, 0.13)}`, borderRadius: 14, color: text, padding: '14px 16px', fontSize: 15, fontFamily: bodyFont, boxSizing: 'border-box' },
    err: { color: WRONG, fontSize: 12.5, marginBottom: 14, textAlign: 'center', fontWeight: 700 },
    joinBtn: { width: '100%', padding: '15px', background: primary, color: contrastColor(primary), border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 800, cursor: 'pointer', letterSpacing: '.01em', fontFamily: headingFont, marginTop: 10, boxShadow: `0 8px 18px -10px ${soft(primary, 0.9)}` },
    waiting: { textAlign: 'center', color: soft(text, 0.65), fontSize: 14, padding: '30px 0 14px' },
    dot: { color: secondary, marginRight: 8 },
    pickTitle: { textAlign: 'center', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: soft(text, 0.55), fontWeight: 800, margin: '4px 0 12px' },
    avGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
    avCell: { display: 'grid', placeItems: 'center', padding: 9, borderRadius: 16, border: '1.5px solid', background: card, cursor: 'pointer' },
    progressRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 },
    progressLabel: { fontSize: 17, fontWeight: 600, color: text, whiteSpace: 'nowrap', fontFamily: headingFont },
    progressTrack: { flex: 1, height: 6, background: soft(text, 0.12), borderRadius: 6, overflow: 'hidden' },
    progressFill: { height: '100%', background: primary, borderRadius: 6, transition: 'width 0.4s' },
    bubble: { background: soft(accent, 0.09), border: `1px solid ${soft(accent, 0.18)}`, borderRadius: 18, padding: '16px 18px', marginBottom: 18 },
    qEyebrow: { fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: accent, fontWeight: 800, marginBottom: 8 },
    postText: { fontSize: 18, color: text, lineHeight: 1.35, fontFamily: headingFont, fontWeight: 500 },
    optList: { display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 },
    optBtn: { display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '13px 14px', border: '1.5px solid', borderRadius: 15, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', transition: 'all .15s', fontFamily: bodyFont, textAlign: 'left' },
    optBadge: { width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, flex: 'none' },
    feedback: { borderRadius: 14, padding: '13px 16px', textAlign: 'center', fontSize: 14.5, fontWeight: 700, marginBottom: 16, fontFamily: headingFont },
    locking: { textAlign: 'center', color: soft(text, 0.5), fontSize: 12.5, padding: '8px 0' },
    tapHint: { textAlign: 'center', color: soft(text, 0.35), fontSize: 12 },
    revealBox: { marginTop: 18, background: card, border: `1px solid ${soft(secondary, 0.2)}`, borderRadius: 16, padding: 16 },
    revealLabel: { fontSize: 10, letterSpacing: '.18em', color: secondary, marginBottom: 10, fontWeight: 800 },
    lbBox: { background: card, border: `1px solid ${soft(text, 0.1)}`, borderRadius: 16, padding: '16px 18px', marginBottom: 22 },
    lbHead: { fontSize: 10, letterSpacing: '.2em', color: soft(text, 0.5), marginBottom: 10, fontWeight: 800, textTransform: 'uppercase' },
    burst: { position: 'relative', width: 150, height: 150, margin: '8px auto 0', display: 'grid', placeItems: 'center' },
    halo: { position: 'absolute', inset: 0, borderRadius: '50%', border: '2px dashed', pointerEvents: 'none' },
  }
}
