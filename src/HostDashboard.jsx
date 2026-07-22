import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { ImageUploadSlot } from './ImageUpload'
import { compressImage, readFileAsDataUrl } from './ImageUpload'
import { DEFAULT_THEME, THEME_PRESETS, FONT_OPTIONS, getTheme, ensureGoogleFont, withAlpha, contrastColor, BRAND_NAME, BRAND_TAGLINE } from './theme'
import PlayerRoom from './PlayerRoom'

const DASH_MODE_KEY = 'wpt_dash_mode'

function resizeChoices(arr, n) {
  const next = arr.slice(0, n)
  while (next.length < n) next.push('')
  return next
}

function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

function generateHostKey() {
  return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
}

// SHA-256 of the admin password — the password itself never appears in the code
const ADMIN_PASSWORD_HASH = 'e22173b8c6cda8399e9de7c3a94e3b17d1394968b5a3cb8c5080544e8d2b1b79'
const ADMIN_UNLOCK_STORAGE_KEY = 'wpt_admin_unlocked'

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const EMPTY_POST = { post: '', author: '', choices: ['', '', '', ''], questionImage: null, revealImage: null, questionLabel: '' }

const SAMPLE_QUESTIONS = [
  { id: 1, post: "Just spent 3 hours reorganizing my spice cabinet alphabetically. No regrets.", author: "Alex", choices: ["Alex", "Jordan", "Sam", "Riley"], questionImage: null, revealImage: null },
  { id: 2, post: "Unpopular opinion: pineapple on pizza is objectively correct and I won't be taking questions.", author: "Sam", choices: ["Alex", "Jordan", "Sam", "Riley"], questionImage: null, revealImage: null },
  { id: 3, post: "Why do I always have the best ideas at 2am? Probably going to patent this tomorrow.", author: "Riley", choices: ["Alex", "Jordan", "Sam", "Riley"], questionImage: null, revealImage: null },
]

export default function HostDashboard({ hostGameId = null, hostAccessKey = '' }) {
  const isHostMode = !!hostGameId
  const [screen, setScreen] = useState(isHostMode ? 'hostloading' : 'home')
  const [games, setGames] = useState([])
  const [currentGame, setCurrentGame] = useState(null)
  const [newPost, setNewPost] = useState(EMPTY_POST)
  const [gameTitle, setGameTitle] = useState('')
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('questions')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [revealedMap, setRevealedMap] = useState({})
  const [guestName, setGuestName] = useState('')
  const [guestCopied, setGuestCopied] = useState(false)
  const [hostCopied, setHostCopied] = useState(false)
  const [screenCopied, setScreenCopied] = useState(false)
  const [unlocked, setUnlocked] = useState(isHostMode || localStorage.getItem(ADMIN_UNLOCK_STORAGE_KEY) === ADMIN_PASSWORD_HASH)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [mockReturnScreen, setMockReturnScreen] = useState('manage')
  const [dashMode, setDashMode] = useState(() => localStorage.getItem(DASH_MODE_KEY) || 'dark')
  // Live gameplay state from the round_state() SQL function: players, totals,
  // and current-round answers in one ~1KB response — the manage screen never
  // re-downloads the game blob or the full answers list while running.
  const [liveAnswers, setLiveAnswers] = useState({})
  const [livePlayers, setLivePlayers] = useState([])
  const [liveTotals, setLiveTotals] = useState([])
  const [answersExist, setAnswersExist] = useState(false)
  // True while a start/next/finish request is in flight, so the button can't
  // be double-clicked into skipping a question (the reported bug).
  const [advancing, setAdvancing] = useState(false)
  const advancingRef = useRef(false)
  const { s, c } = buildDashTheme(dashMode)
  const pendingSaveRef = useRef(false)

  function toggleDashMode() {
    setDashMode(m => {
      const next = m === 'dark' ? 'light' : 'dark'
      localStorage.setItem(DASH_MODE_KEY, next)
      return next
    })
  }

  useEffect(() => { ensureGoogleFont("'Poppins', sans-serif") }, [])

  useEffect(() => { if (unlocked) loadGames() }, [unlocked])

  async function tryUnlock() {
    setPwError('')
    if (await sha256Hex(pwInput) === ADMIN_PASSWORD_HASH) {
      localStorage.setItem(ADMIN_UNLOCK_STORAGE_KEY, ADMIN_PASSWORD_HASH)
      setUnlocked(true)
    } else {
      setPwError('Wrong password. Try again.')
      setPwInput('')
    }
  }

  // Host mode: load only the linked game and require a matching host key
  useEffect(() => {
    if (!isHostMode) return
    ;(async () => {
      const { data } = await supabase.from('games').select('data').eq('game_id', hostGameId).single()
      const g = data?.data
      if (!g || !g.hostKey || g.hostKey !== hostAccessKey) { setScreen('hosterror'); return }
      setCurrentGame(g)
      setGameTitle(g.title || '')
      setScreen('manage')
    })()
  }, [])

  useEffect(() => {
    if (!currentGame?.theme) return
    ensureGoogleFont(currentGame.theme.headingFont)
    ensureGoogleFont(currentGame.theme.bodyFont)
  }, [currentGame?.theme?.headingFont, currentGame?.theme?.bodyFont])

  // Live sync while managing a game: answers and joined players come from
  // their own small tables (bytes, not megabytes), plus a tiny status check
  // in case another host tab (admin vs. customer) advanced the game.
  useEffect(() => {
    if (screen !== 'manage' || !currentGame) return
    const gameId = currentGame.id
    const qIdx = currentGame.currentQuestion
    let stopped = false
    async function tick() {
      const [rs, st] = await Promise.all([
        supabase.rpc('round_state', { gid: gameId, qidx: qIdx }),
        supabase.from('games').select('status:data->>status,current_question:data->currentQuestion').eq('game_id', gameId).single(),
      ])
      if (stopped) return
      if (rs.data) {
        setLivePlayers(rs.data.map(r => ({ name: r.player_name })))
        setLiveTotals(rs.data.map(r => [r.player_name, r.total]))
        setLiveAnswers(Object.fromEntries(rs.data.filter(r => r.round_answer != null).map(r => [`${r.player_name}:::${qIdx}`, r.round_answer])))
        if (rs.data.some(r => r.round_answer != null || r.total > 0)) setAnswersExist(true)
      }
      if (st.data) setCurrentGame(g => {
        if (!g || (g.status === st.data.status && g.currentQuestion === st.data.current_question)) return g
        // Guard against a stale read landing right after an optimistic advance:
        // during active play the question only ever moves forward, so ignore a
        // server value that's behind our local one (a genuine external change —
        // reset, or another host tab jumping ahead — still differs and applies).
        if (g.status === 'active' && st.data.status === 'active' && st.data.current_question < g.currentQuestion) return g
        return { ...g, status: st.data.status, currentQuestion: st.data.current_question }
      })
    }
    tick()
    const poll = setInterval(tick, 2500)
    return () => { stopped = true; clearInterval(poll) }
  }, [screen, currentGame?.id, currentGame?.currentQuestion])

  // Home list needs titles and counts, not every game's full blob with all
  // its images — the list_games() function returns just those few columns.
  async function loadGames() {
    if (isHostMode) return
    const { data, error } = await supabase.rpc('list_games')
    if (!error && data) {
      setGames(data.map(r => ({ id: r.game_id, title: r.title, status: r.status || 'lobby', questionCount: r.question_count, playerCount: r.player_count })))
      return
    }
    // Fallback for databases that haven't run the multiplayer migration yet
    const res = await supabase.from('games').select('game_id, data').order('created_at', { ascending: false })
    if (!res.error && res.data) {
      setGames(res.data.map(r => ({ id: r.data.id, title: r.data.title, status: r.data.status || 'lobby', questionCount: (r.data.questions || []).length, playerCount: (r.data.players || []).length })))
    }
  }

  // Fetch one game's full blob (questions, images, theme) on demand.
  async function openManage(gameId) {
    const { data } = await supabase.from('games').select('data').eq('game_id', gameId).single()
    if (!data?.data) return
    setCurrentGame(data.data)
    setGameTitle(data.data.title || '')
    setLiveAnswers({})
    setLivePlayers([])
    setLiveTotals([])
    // Header-only count: powers the "players already answered" editor warning
    const { count } = await supabase.from('answers').select('*', { count: 'exact', head: true }).eq('game_id', gameId)
    setAnswersExist((count || 0) > 0)
    setScreen('manage')
  }

  async function saveGame(game) {
    setSaving(true)
    setSaveError('')
    try {
      const { error } = await supabase
        .from('games')
        .upsert({ game_id: game.id, data: game, created_at: new Date().toISOString() }, { onConflict: 'game_id' })
      if (error) throw error
      await loadGames()
      return true
    } catch (e) {
      setSaveError('Save failed: ' + (e.message || 'unknown error'))
      return false
    } finally {
      setSaving(false)
    }
  }

  // A game is only worth persisting once it has a title and at least one question.
  function isSaveable(game, title) {
    return !!(game && title.trim() && game.questions.length > 0)
  }

  // Immediately save any pending edit, bypassing the autosave debounce — used
  // whenever the host navigates away from the editor, so nothing is lost.
  async function flushSave() {
    if (!pendingSaveRef.current || !isSaveable(currentGame, gameTitle)) return
    pendingSaveRef.current = false
    await saveGame({ ...currentGame, title: gameTitle })
  }

  // Debounced autosave: fires ~900ms after the host stops editing.
  useEffect(() => {
    if (screen !== 'create' || !currentGame) return
    pendingSaveRef.current = true
    if (!isSaveable(currentGame, gameTitle)) return
    const timer = setTimeout(async () => {
      const ok = await saveGame({ ...currentGame, title: gameTitle })
      if (ok) pendingSaveRef.current = false
    }, 900)
    return () => clearTimeout(timer)
  }, [currentGame, gameTitle, screen])

  // Warn before closing/refreshing the tab if there's an edit the debounce hasn't saved yet.
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (screen === 'create' && pendingSaveRef.current && isSaveable(currentGame, gameTitle)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [screen, currentGame, gameTitle])

  async function deleteGame(gameId) {
    await Promise.all([
      supabase.from('games').delete().eq('game_id', gameId),
      supabase.from('reveals').delete().eq('game_id', gameId),
      supabase.from('answers').delete().eq('game_id', gameId),
      supabase.from('game_players').delete().eq('game_id', gameId),
    ])
    await loadGames()
    if (currentGame?.id === gameId) { setCurrentGame(null); setScreen('home') }
  }

  function startNewGame() {
    const id = generateGameId()
    setCurrentGame({ id, title: '', hostKey: generateHostKey(), theme: { ...DEFAULT_THEME }, questions: SAMPLE_QUESTIONS, players: [], status: 'lobby', currentQuestion: 0, createdAt: Date.now(), answers: {}, revealMode: 'auto' })
    setGameTitle('')
    setNewPost(EMPTY_POST)
    setEditingId(null)
    setEditDraft(null)
    setScreen('create')
    setActiveTab('questions')
  }

  async function startMockPreview(fromScreen) {
    if (!currentGame || currentGame.questions.length === 0) return
    await flushSave()
    setMockReturnScreen(fromScreen)
    setScreen('mockplay')
  }

  function updateTheme(patch) {
    setCurrentGame(g => ({ ...g, theme: { ...getTheme(g), ...patch } }))
  }

  function setRevealMode(mode) {
    setCurrentGame(g => ({ ...g, revealMode: mode }))
  }

  function applyPreset(preset) {
    updateTheme(preset.theme)
  }

  // Games autosave as you edit; this just flushes any pending save and moves on.
  async function goToManage() {
    await flushSave()
    setCurrentGame(g => ({ ...g, title: gameTitle }))
    setScreen('manage')
  }

  // Game-flow changes are one tiny atomic database call (advance_game) instead
  // of re-uploading the whole multi-MB blob. The host view updates optimistically
  // (instant feedback, no dead-time where a slow-wifi host thinks the click
  // didn't register and clicks again), and advancingRef blocks overlapping
  // calls so a double-click can't skip a question.
  async function advanceGameState(status, currentQuestion) {
    if (advancingRef.current) return false
    advancingRef.current = true
    setAdvancing(true)
    setSaveError('')
    const prev = currentGame
    setCurrentGame(g => ({ ...g, status, currentQuestion }))
    const { error } = await supabase.rpc('advance_game', { gid: currentGame.id, new_status: status, new_q: currentQuestion })
    advancingRef.current = false
    setAdvancing(false)
    if (error) {
      setSaveError('Update failed: ' + error.message)
      setCurrentGame(prev) // roll back the optimistic move
      return false
    }
    return true
  }

  async function startGame() {
    await advanceGameState('active', 0)
  }

  async function nextQuestion() {
    if (advancingRef.current) return
    const next = currentGame.currentQuestion + 1
    setRevealedMap(m => ({ ...m, [next]: false }))
    // clear reveal flag for next question
    await supabase.from('reveals').delete().eq('game_id', currentGame.id).eq('question_idx', next)
    await advanceGameState(next >= currentGame.questions.length ? 'finished' : 'active', next)
  }

  async function resetGame() {
    await Promise.all([
      supabase.from('reveals').delete().eq('game_id', currentGame.id),
      supabase.from('answers').delete().eq('game_id', currentGame.id),
      supabase.from('game_players').delete().eq('game_id', currentGame.id),
    ])
    const ok = await advanceGameState('lobby', 0)
    if (ok) { setRevealedMap({}); setLiveAnswers({}); setLivePlayers([]); setLiveTotals([]); setAnswersExist(false) }
  }

  async function toggleReveal(qIdx) {
    const next = !revealedMap[qIdx]
    setRevealedMap(m => ({ ...m, [qIdx]: next }))
    if (next) {
      await supabase.from('reveals').upsert({ game_id: currentGame.id, question_idx: qIdx }, { onConflict: 'game_id,question_idx' })
    } else {
      await supabase.from('reveals').delete().eq('game_id', currentGame.id).eq('question_idx', qIdx)
    }
  }

  function addQuestion() {
    if (!newPost.post.trim() || !newPost.author.trim()) return
    const filledChoices = newPost.choices.filter(c => c.trim())
    if (filledChoices.length < 2) return
    const q = { id: Date.now(), post: newPost.post, author: newPost.author, choices: filledChoices, questionImage: newPost.questionImage || null, revealImage: newPost.revealImage || null, questionLabel: newPost.questionLabel?.trim() || null }
    setCurrentGame(g => ({ ...g, questions: [...g.questions, q] }))
    setNewPost(EMPTY_POST)
  }

  function removeQuestion(id) {
    setCurrentGame(g => ({ ...g, questions: g.questions.filter(q => q.id !== id) }))
  }

  function moveQuestion(index, dir) {
    setCurrentGame(g => {
      const j = index + dir
      if (j < 0 || j >= g.questions.length) return g
      const qs = [...g.questions]
      ;[qs[index], qs[j]] = [qs[j], qs[index]]
      return { ...g, questions: qs }
    })
  }

  function startEditQuestion(q) {
    setEditingId(q.id)
    setEditDraft({ ...q, choices: [...q.choices], questionLabel: q.questionLabel || '' })
  }

  function cancelEditQuestion() {
    setEditingId(null)
    setEditDraft(null)
  }

  function updateEditChoice(i, val) {
    setEditDraft(d => {
      const c = [...d.choices]; c[i] = val
      return { ...d, choices: c }
    })
  }

  function saveEditQuestion() {
    if (!editDraft.post.trim() || !editDraft.author.trim()) return
    const filledChoices = editDraft.choices.filter(c => c.trim())
    if (filledChoices.length < 2) return
    setCurrentGame(g => ({
      ...g,
      questions: g.questions.map(q => q.id === editingId ? { ...editDraft, choices: filledChoices, questionLabel: editDraft.questionLabel?.trim() || null } : q),
    }))
    cancelEditQuestion()
  }

  function updateChoice(i, val) {
    const c = [...newPost.choices]; c[i] = val
    setNewPost(p => ({ ...p, choices: c }))
  }

  function getGameLink(gameId) {
    return `${window.location.origin}/?game=${gameId}&role=player`
  }

  function getGuestLink(gameId) {
    return `${getGameLink(gameId)}&name=${encodeURIComponent(guestName.trim())}`
  }

  async function copyLink(gameId) {
    try { await navigator.clipboard.writeText(getGameLink(gameId)); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  async function copyGuestLink(gameId) {
    if (!guestName.trim()) return
    try { await navigator.clipboard.writeText(getGuestLink(gameId)); setGuestCopied(true); setTimeout(() => setGuestCopied(false), 2000) } catch {}
  }

  function getHostLink(game) {
    return `${window.location.origin}/?game=${game.id}&role=host&key=${game.hostKey || ''}`
  }

  function getScreenLink(gameId) {
    return `${window.location.origin}/?game=${gameId}&role=screen`
  }

  async function copyScreenLink(gameId) {
    try { await navigator.clipboard.writeText(getScreenLink(gameId)); setScreenCopied(true); setTimeout(() => setScreenCopied(false), 2000) } catch {}
  }

  // Games created before host links exist get a key generated on first copy
  async function copyHostLink() {
    let game = currentGame
    if (!game.hostKey) {
      game = { ...game, hostKey: generateHostKey() }
      await saveGame(game)
      setCurrentGame(game)
    }
    try { await navigator.clipboard.writeText(getHostLink(game)); setHostCopied(true); setTimeout(() => setHostCopied(false), 2000) } catch {}
  }

  // Running totals come pre-computed and pre-sorted from round_state()
  function computeScores() {
    return liveTotals
  }

  // How often each person shows up as an answer choice vs. is the correct answer,
  // so the host can spot lopsided questions and keep the game unpredictable.
  function computePersonStats(game) {
    const stats = {}
    ;(game.questions || []).forEach(q => {
      ;(q.choices || []).forEach(c => {
        if (!stats[c]) stats[c] = { featured: 0, correct: 0 }
        stats[c].featured++
      })
      if (q.author) {
        if (!stats[q.author]) stats[q.author] = { featured: 0, correct: 0 }
        stats[q.author].correct++
      }
    })
    return Object.entries(stats).sort((a, b) => b[1].correct - a[1].correct)
  }

  // ── ADMIN LOCK SCREEN ─────────────────────────────────────────────────────
  if (!isHostMode && !unlocked) return (
    <div style={s.page}>
      <div style={{ ...s.container, maxWidth: 380, textAlign: 'center', paddingTop: 60, position: 'relative' }}>
        <button style={s.modeToggle} onClick={toggleDashMode} title="Toggle light/dark mode">{dashMode === 'dark' ? '☀️' : '🌙'}</button>
        <img src="/logo.svg" alt={BRAND_NAME} style={{ ...s.logoImg, marginTop: 40 }} />
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Admin Access</div>
        <div style={{ fontSize: 12, color: c.textFaint, marginBottom: 28, letterSpacing: 1 }}>Enter the admin password to manage games.</div>
        <input
          type="password"
          inputMode="numeric"
          style={{ ...s.input, textAlign: 'center', fontSize: 20, letterSpacing: 8, marginBottom: 14 }}
          placeholder="••••••"
          value={pwInput}
          onChange={e => setPwInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && tryUnlock()}
          autoFocus
        />
        {pwError && <div style={{ color: c.danger, fontSize: 12, marginBottom: 14 }}>{pwError}</div>}
        <button style={s.bigBtn} onClick={tryUnlock}>Unlock →</button>
      </div>
    </div>
  )

  // ── HOST MODE: LOADING / ERROR ────────────────────────────────────────────
  if (screen === 'hostloading') return (
    <div style={s.page}>
      <div style={{ ...s.container, textAlign: 'center', paddingTop: 120 }}>
        <div style={{ fontSize: 14, color: c.textMuted, letterSpacing: 1 }}>Loading your game…</div>
      </div>
    </div>
  )
  if (screen === 'hosterror') return (
    <div style={s.page}>
      <div style={{ ...s.container, textAlign: 'center', paddingTop: 120 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Invalid host link</div>
        <div style={{ fontSize: 13, color: c.textFaint, lineHeight: 1.6 }}>This link is missing or has the wrong host key.<br />Ask the game organizer to send you a fresh one.</div>
      </div>
    </div>
  )

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (screen === 'home') return (
    <div style={s.page}>
      <div style={s.container}>
        <header style={s.header}>
          <button style={s.modeToggle} onClick={toggleDashMode} title="Toggle light/dark mode">{dashMode === 'dark' ? '☀️' : '🌙'}</button>
          <img src="/logo.svg" alt={BRAND_NAME} style={{ ...s.logoImg, margin: '0 auto 16px' }} />
          <p style={s.tagline}>{BRAND_TAGLINE}</p>
        </header>
        <button style={s.bigBtn} onClick={startNewGame}><span>＋</span> Create New Game</button>
        {games.length > 0 && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>YOUR GAMES</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {games.map(g => {
                const statusColor = g.status === 'active' ? c.success : g.status === 'finished' ? c.danger : c.accent
                return (
                  <div key={g.id} style={s.gameCard}>
                    <div>
                      <div style={s.gameCardTitle}>{g.title || 'Untitled'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                        <span style={{ ...s.badge, background: statusColor, color: contrastColor(statusColor) }}>{g.status.toUpperCase()}</span>
                        <span style={s.meta}>{g.questionCount} Qs · {g.playerCount} players</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button style={s.ghost} onClick={() => openManage(g.id)}>Manage</button>
                      <button style={{ ...s.ghost, color: c.danger }} onClick={() => deleteGame(g.id)}>Delete</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {games.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎲</div>
            <p style={{ color: c.textFaint, fontSize: 14 }}>No games yet — create your first one above!</p>
          </div>
        )}
      </div>
    </div>
  )

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (screen === 'create') {
    const theme = getTheme(currentGame)
    const isPublished = isHostMode || games.some(g => g.id === currentGame.id)
    const autosaveLabel = saving
      ? '● Saving…'
      : saveError
      ? `⚠ ${saveError}`
      : isPublished
      ? '✓ Saved'
      : (gameTitle.trim() && currentGame.questions.length > 0 ? '● Unsaved' : '')
    return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.topBar}>
          <button style={s.back} onClick={async () => { await flushSave(); setScreen(isPublished ? 'manage' : 'home') }}>← {isPublished ? 'Back to Manage' : 'Back'}</button>
          <div style={{ textAlign: 'center' }}>
            <div style={s.step}>{isPublished ? 'EDIT GAME' : 'GAME SETUP'} · {currentGame.id}</div>
            {autosaveLabel && <div style={{ fontSize: 10, letterSpacing: 1, marginTop: 3, color: saveError ? c.danger : c.textFaint }}>{autosaveLabel}</div>}
          </div>
          <button style={s.modeToggle} onClick={toggleDashMode} title="Toggle light/dark mode">{dashMode === 'dark' ? '☀️' : '🌙'}</button>
        </div>
        <div style={s.tabs}>
          {['questions', 'customize', 'preview'].map(t => (
            <button key={t} style={{ ...s.tab, ...(activeTab === t ? s.tabOn : {}) }} onClick={() => setActiveTab(t)}>{t.toUpperCase()}</button>
          ))}
        </div>

        {activeTab === 'questions' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label style={s.label}>GAME TITLE</label>
              <input style={s.input} placeholder="e.g. Sarah's Bachelorette Party 🎉" value={gameTitle} onChange={e => setGameTitle(e.target.value)} />
            </div>
            <div style={s.section}>
              <h2 style={s.sectionTitle}>QUESTIONS ({currentGame.questions.length})</h2>
              {currentGame.questions.map((q, i) => (
                <div key={q.id} style={s.qRow}>
                  <div style={s.qNum}>Q{i + 1}</div>
                  {editingId === q.id ? (
                    <div style={{ flex: 1 }}>
                      <label style={s.label}>PROMPT TEXT</label>
                      <div style={{ fontSize: 11, color: c.textFaint, marginTop: -12, marginBottom: 10 }}>The caption, quote, or question shown to players</div>
                      <textarea style={s.textarea} value={editDraft.post} onChange={e => setEditDraft(d => ({ ...d, post: e.target.value }))} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
                        <ImageUploadSlot label="QUESTION IMAGE" hint="Shown while players are guessing" value={editDraft.questionImage} onChange={v => setEditDraft(d => ({ ...d, questionImage: v }))} accentColor={c.accent} cropAspect={1} />
                        <ImageUploadSlot label="REVEAL IMAGE" hint="Shown after everyone answers" value={editDraft.revealImage} onChange={v => setEditDraft(d => ({ ...d, revealImage: v }))} accentColor={c.success} cropAspect={1} />
                      </div>
                      <label style={s.label}>CORRECT ANSWER</label>
                      <input style={{ ...s.input, marginBottom: 16 }} placeholder="Must exactly match one choice" value={editDraft.author} onChange={e => setEditDraft(d => ({ ...d, author: e.target.value }))} />
                      <label style={s.label}>QUESTION PROMPT OVERRIDE <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                      <input style={{ ...s.input, marginBottom: 16 }} placeholder={`Leave blank to use the game default: "${theme.questionLabel}"`} value={editDraft.questionLabel} onChange={e => setEditDraft(d => ({ ...d, questionLabel: e.target.value }))} />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ ...s.label, marginBottom: 0 }}>ANSWER CHOICES</label>
                        <select style={{ ...s.input, width: 70, padding: '6px 8px', fontSize: 12 }} value={editDraft.choices.length} onChange={e => setEditDraft(d => ({ ...d, choices: resizeChoices(d.choices, Number(e.target.value)) }))}>
                          {Array.from({ length: 9 }, (_, n) => n + 2).map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                        {editDraft.choices.map((val, ci) => (
                          <input key={ci} style={s.input} placeholder={`Choice ${ci + 1}`} value={val} onChange={e => updateEditChoice(ci, e.target.value)} />
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button style={s.addBtn} onClick={saveEditQuestion}>✓ Save Question</button>
                        <button style={s.ghost} onClick={cancelEditQuestion}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        {q.questionImage && <img src={q.questionImage} alt="" style={{ width: 80, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 4, marginBottom: 6 }} />}
                        <div style={s.qText}>"{q.post}"</div>
                        <div style={s.qSub}>✓ {q.author} · {q.choices.join(', ')}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                          {q.questionImage && <span style={chip(c.accent)}>📷 question img</span>}
                          {q.revealImage && <span style={chip(c.success)}>🎉 reveal img</span>}
                          {q.questionLabel?.trim() && <span style={chip(c.accent)}>💬 "{q.questionLabel}"</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button style={{ ...s.arrowBtn, opacity: i === 0 ? 0.25 : 1 }} disabled={i === 0} onClick={() => moveQuestion(i, -1)} title="Move up">▲</button>
                        <button style={{ ...s.arrowBtn, opacity: i === currentGame.questions.length - 1 ? 0.25 : 1 }} disabled={i === currentGame.questions.length - 1} onClick={() => moveQuestion(i, 1)} title="Move down">▼</button>
                      </div>
                      <button style={s.editIconBtn} onClick={() => startEditQuestion(q)} title="Edit question">✎</button>
                      <button style={s.x} onClick={() => removeQuestion(q.id)}>✕</button>
                    </>
                  )}
                </div>
              ))}
              {answersExist && (
                <div style={{ fontSize: 11, color: c.accent, background: withAlpha(c.accent, 0.07), border: `1px solid ${withAlpha(c.accent, 0.2)}`, borderRadius: 4, padding: '10px 14px', marginTop: 4 }}>
                  ⚠ Players have already answered some questions — editing, reordering, or removing questions now can mix up their scores. Best to reset the game after big changes.
                </div>
              )}
            </div>

            <div style={s.addBox}>
              <h3 style={s.addTitle}>ADD A QUESTION</h3>
              <label style={s.label}>PROMPT TEXT</label>
              <div style={{ fontSize: 11, color: c.textFaint, marginTop: -12, marginBottom: 10 }}>The caption, quote, or question shown to players</div>
              <textarea style={s.textarea} placeholder="e.g. Who is in the pic with this caption? 'Double, Double, Toil &amp; Trouble'" value={newPost.post} onChange={e => setNewPost(p => ({ ...p, post: e.target.value }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
                <ImageUploadSlot label="QUESTION IMAGE" hint="Shown while players are guessing" value={newPost.questionImage} onChange={v => setNewPost(p => ({ ...p, questionImage: v }))} accentColor={c.accent} cropAspect={1} />
                <ImageUploadSlot label="REVEAL IMAGE" hint="Shown after everyone answers" value={newPost.revealImage} onChange={v => setNewPost(p => ({ ...p, revealImage: v }))} accentColor={c.success} cropAspect={1} />
              </div>
              <label style={s.label}>CORRECT ANSWER</label>
              <input style={{ ...s.input, marginBottom: 16 }} placeholder="Must exactly match one choice" value={newPost.author} onChange={e => setNewPost(p => ({ ...p, author: e.target.value }))} />
              <label style={s.label}>QUESTION PROMPT OVERRIDE <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
              <input style={{ ...s.input, marginBottom: 16 }} placeholder={`Leave blank to use the game default: "${theme.questionLabel}"`} value={newPost.questionLabel} onChange={e => setNewPost(p => ({ ...p, questionLabel: e.target.value }))} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ ...s.label, marginBottom: 0 }}>ANSWER CHOICES</label>
                <select style={{ ...s.input, width: 70, padding: '6px 8px', fontSize: 12 }} value={newPost.choices.length} onChange={e => setNewPost(p => ({ ...p, choices: resizeChoices(p.choices, Number(e.target.value)) }))}>
                  {Array.from({ length: 9 }, (_, n) => n + 2).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {newPost.choices.map((val, i) => (
                  <input key={i} style={s.input} placeholder={`Choice ${i + 1}`} value={val} onChange={e => updateChoice(i, e.target.value)} />
                ))}
              </div>
              <button style={s.addBtn} onClick={addQuestion}>Add Question →</button>
            </div>

            {saveError && <div style={{ color: c.danger, fontSize: 12, marginTop: 12, padding: '10px 14px', background: withAlpha(c.danger, 0.07), borderRadius: 4 }}>{saveError}</div>}
            <div style={{ fontSize: 11, color: c.textFaint, textAlign: 'center', marginTop: 20, marginBottom: 8 }}>Your changes save automatically as you go.</div>
            <button
              style={{ ...s.bigBtn, opacity: (!gameTitle.trim() || currentGame.questions.length === 0) ? 0.4 : 1 }}
              onClick={goToManage}
              disabled={!gameTitle.trim() || currentGame.questions.length === 0}
            >{isPublished ? 'Go to Share & Manage →' : 'Save & Get Share Link →'}</button>
          </>
        )}

        {activeTab === 'customize' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <label style={s.label}>GAME NAME</label>
              <input style={s.input} placeholder="e.g. Sarah's Bachelorette Party 🎉" value={gameTitle} onChange={e => setGameTitle(e.target.value)} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={s.label}>TAGLINE</label>
              <input style={s.input} placeholder="Shown under the logo on the join screen" value={theme.tagline} onChange={e => updateTheme({ tagline: e.target.value })} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={s.label}>QUESTION PROMPT</label>
              <div style={{ fontSize: 11, color: c.textFaint, marginTop: -4, marginBottom: 8 }}>Shown above the answer choices — default for every question. You can also override it per question when adding or editing one, e.g. "WHO DREW THIS?" for a doodle round.</div>
              <input style={s.input} placeholder="e.g. WHO SAID THIS? or WHO'S IN THE PHOTO?" value={theme.questionLabel} onChange={e => updateTheme({ questionLabel: e.target.value })} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={s.label}>ANSWER REVEAL</label>
              <div style={{ fontSize: 11, color: c.textFaint, marginTop: -4, marginBottom: 8 }}>Auto shows each player the correct answer right after they submit. Manual keeps it hidden for everyone until you reveal it from your dashboard — good for building suspense or stopping players peeking at each other's screens.</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={{ ...s.revealModeBtn, ...((currentGame.revealMode || 'auto') === 'auto' ? s.revealModeBtnOn : {}) }} onClick={() => setRevealMode('auto')}>⚡ Auto</button>
                <button style={{ ...s.revealModeBtn, ...(currentGame.revealMode === 'manual' ? s.revealModeBtnOn : {}) }} onClick={() => setRevealMode('manual')}>🎬 Manual</button>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={s.label}>LOBBY WELCOME MESSAGE</label>
              <div style={{ fontSize: 11, color: c.textFaint, marginTop: -4, marginBottom: 8 }}>Shown to players while they wait in the lobby for you to start. Leave blank to skip it. Line breaks are kept.</div>
              <textarea
                style={{ ...s.textarea, minHeight: 160 }}
                placeholder={"e.g. Welcome to That's So Them 🏕️\nLani's Camp Bach Edition\n\nGet ready to get to know each other a little better..."}
                value={theme.welcomeMessage}
                onChange={e => updateTheme({ welcomeMessage: e.target.value })}
              />
            </div>

            <div style={s.section}>
              <h2 style={s.sectionTitle}>QUICK PRESETS</h2>
              <div style={s.presetGrid}>
                {THEME_PRESETS.map(preset => (
                  <button key={preset.id} style={s.presetBtn} onClick={() => applyPreset(preset)}>
                    <span style={{ fontSize: 22 }}>{preset.emoji}</span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      {[preset.theme.primaryColor, preset.theme.secondaryColor, preset.theme.backgroundColor].map((swatch, i) => (
                        <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: swatch, border: `1px solid ${withAlpha(c.text, 0.2)}` }} />
                      ))}
                    </span>
                    <span style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={s.section}>
              <h2 style={s.sectionTitle}>COLORS</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <ColorField s={s} label="PRIMARY" value={theme.primaryColor} onChange={v => updateTheme({ primaryColor: v })} />
                <ColorField s={s} label="SECONDARY" value={theme.secondaryColor} onChange={v => updateTheme({ secondaryColor: v })} />
                <ColorField s={s} label="BACKGROUND" value={theme.backgroundColor} onChange={v => updateTheme({ backgroundColor: v })} />
                <ColorField s={s} label="CARD" value={theme.cardColor} onChange={v => updateTheme({ cardColor: v })} />
                <ColorField s={s} label="TEXT" value={theme.textColor} onChange={v => updateTheme({ textColor: v })} />
              </div>
            </div>

            <div style={s.section}>
              <h2 style={s.sectionTitle}>FONTS</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={s.label}>HEADING FONT</label>
                  <select style={s.input} value={theme.headingFont} onChange={e => updateTheme({ headingFont: e.target.value })}>
                    {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>BODY FONT</label>
                  <select style={s.input} value={theme.bodyFont} onChange={e => updateTheme({ bodyFont: e.target.value })}>
                    {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={s.section}>
              <h2 style={s.sectionTitle}>BRANDING IMAGES</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <ImageUploadSlot label="LOGO" hint="Shown instead of the text logo" value={theme.logoImage} onChange={v => updateTheme({ logoImage: v })} accentColor={theme.primaryColor} />
                <ImageUploadSlot label="BACKGROUND IMAGE" hint="Faint full-page background" value={theme.backgroundImage} onChange={v => updateTheme({ backgroundImage: v })} accentColor={theme.secondaryColor} maxDim={1600} />
              </div>
            </div>

            <div style={s.section}>
              <h2 style={s.sectionTitle}>LIVE PREVIEW</h2>
              <ThemePreview theme={theme} title={gameTitle} />
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <div>
            <button style={{ ...s.bigBtn, marginBottom: 28 }} onClick={() => startMockPreview('create')}>🎮 Play as a Guest (Preview)</button>
            <h2 style={s.sectionTitle}>PREVIEW</h2>
            {currentGame.questions.map((q, i) => (
              <div key={q.id} style={s.prevCard}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: c.textFaint, marginBottom: 10 }}>Question {i + 1}</div>
                {q.questionImage && <img src={q.questionImage} alt="" style={{ width: '100%', maxWidth: 400, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, marginBottom: 12, border: `1px solid ${withAlpha(c.accent, 0.2)}`, display: 'block' }} />}
                <div style={s.prevPost}>"{q.post}"</div>
                <div style={{ textAlign: 'center', fontSize: 10, letterSpacing: 2, color: c.textFaint, marginBottom: 10 }}>{theme.questionLabel}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {q.choices.map(choice => (
                    <div key={choice} style={{ padding: '10px 14px', borderRadius: 4, fontSize: 13, textAlign: 'center', fontWeight: 700, background: choice === q.author ? withAlpha(c.success, 0.13) : c.cardAlt, color: choice === q.author ? c.success : c.textMuted, border: `1px solid ${choice === q.author ? withAlpha(c.success, 0.27) : c.borderSoft}` }}>
                      {choice === q.author ? '✓ ' : ''}{choice}
                    </div>
                  ))}
                </div>
                {q.revealImage && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: c.success, marginBottom: 6 }}>🎉 REVEAL IMAGE</div>
                    <img src={q.revealImage} alt="" style={{ width: '100%', maxWidth: 400, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, border: `1px solid ${withAlpha(c.success, 0.2)}`, display: 'block' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    )
  }

  // ── MANAGE ────────────────────────────────────────────────────────────────
  if (screen === 'manage' && currentGame) {
    const scores = computeScores()
    const personStats = computePersonStats(currentGame)
    const maxCorrect = Math.max(1, ...personStats.map(([, st]) => st.correct))
    const maxFeatured = Math.max(1, ...personStats.map(([, st]) => st.featured))
    const qIdx = currentGame.currentQuestion
    const q = currentGame.questions[qIdx]
    const answeredPlayers = new Set(
      Object.keys(liveAnswers).filter(k => k.endsWith(`:::${qIdx}`)).map(k => k.split(':::')[0])
    )
    const isRevealed = !!revealedMap[qIdx]
    const allAnswered = livePlayers.length > 0 && answeredPlayers.size >= livePlayers.length

    return (
      <div style={s.page}>
        <div style={s.container}>
          <div style={s.topBar}>
            {isHostMode
              ? <div style={{ ...s.step, color: c.accent }}>YOU'RE THE HOST</div>
              : <button style={s.back} onClick={() => setScreen('home')}>← Home</button>}
            <div style={s.step}>{currentGame.title}</div>
            <button style={s.modeToggle} onClick={toggleDashMode} title="Toggle light/dark mode">{dashMode === 'dark' ? '☀️' : '🌙'}</button>
          </div>
          <div style={s.shareBox}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: c.accent, marginBottom: 6 }}>SHARE WITH PLAYERS</div>
            <div style={{ fontSize: 12, color: c.textMuted, wordBreak: 'break-all', marginBottom: 10, lineHeight: 1.5 }}>{getGameLink(currentGame.id)}</div>
            <button style={s.copyBtn} onClick={() => copyLink(currentGame.id)}>{copied ? '✓ Copied!' : 'Copy Link'}</button>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${withAlpha(c.accent, 0.13)}` }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: c.accent, marginBottom: 6 }}>PERSONALIZED LINK</div>
              <div style={{ fontSize: 11, color: c.textFaint, marginBottom: 10 }}>Type a guest's name to make a link that pre-fills it on their join screen.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...s.input, flex: 1 }} placeholder="Guest name, e.g. Sarah" value={guestName} onChange={e => { setGuestName(e.target.value); setGuestCopied(false) }} />
                <button style={{ ...s.copyBtn, opacity: guestName.trim() ? 1 : 0.4, whiteSpace: 'nowrap' }} disabled={!guestName.trim()} onClick={() => copyGuestLink(currentGame.id)}>{guestCopied ? '✓ Copied!' : 'Copy'}</button>
              </div>
              {guestName.trim() && <div style={{ fontSize: 11, color: c.textMuted, wordBreak: 'break-all', marginTop: 8, lineHeight: 1.5 }}>{getGuestLink(currentGame.id)}</div>}
            </div>
            {!isHostMode && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${withAlpha(c.accent, 0.13)}` }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: c.success, marginBottom: 6 }}>HOST LINK — FOR YOUR CUSTOMER</div>
                <div style={{ fontSize: 11, color: c.textFaint, marginBottom: 10 }}>Lets them edit and run this game without seeing your other games.</div>
                {currentGame.hostKey && <div style={{ fontSize: 11, color: c.textMuted, wordBreak: 'break-all', marginBottom: 8, lineHeight: 1.5 }}>{getHostLink(currentGame)}</div>}
                <button style={{ ...s.copyBtn, background: c.success, color: c.successText }} onClick={copyHostLink}>{hostCopied ? '✓ Copied!' : 'Copy Host Link'}</button>
              </div>
            )}
          </div>
          <div style={{ ...s.shareBox, borderColor: withAlpha(c.success, 0.3) }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: c.success, marginBottom: 6 }}>📺 BIG SCREEN — CAST TO A TV</div>
            <div style={{ fontSize: 11, color: c.textFaint, marginBottom: 10, lineHeight: 1.5 }}>A shared view for the room: the question, live "locked in" counter, the reveal, and the leaderboard. Open it on a laptop plugged into a TV, or cast the browser tab. It follows along automatically — no clicking needed.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={{ ...s.copyBtn, background: c.success, color: c.successText }} onClick={() => window.open(getScreenLink(currentGame.id), '_blank')}>Open Big Screen ↗</button>
              <button style={{ ...s.copyBtn, background: 'none', color: c.success, border: `1px solid ${withAlpha(c.success, 0.4)}` }} onClick={() => copyScreenLink(currentGame.id)}>{screenCopied ? '✓ Copied!' : 'Copy Link'}</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button style={s.editBtn} onClick={() => { setGameTitle(currentGame.title); setActiveTab('questions'); setScreen('create') }}>✎ Edit Questions</button>
            <button style={s.editBtn} onClick={() => { setGameTitle(currentGame.title); setActiveTab('customize'); setScreen('create') }}>🎨 Customize Theme</button>
          </div>
          <button style={{ ...s.bigBtn, marginBottom: 20 }} onClick={() => startMockPreview('manage')}>🎮 Play as a Guest (Preview)</button>

          {personStats.length > 0 && (
            <div style={s.section}>
              <h2 style={s.sectionTitle}>QUESTION BALANCE</h2>
              <div style={{ fontSize: 11, color: c.textFaint, marginBottom: 16, lineHeight: 1.5 }}>How often each person is a choice vs. the correct answer — keep these close so guesses stay random and no one's an obvious giveaway.</div>
              {personStats.map(([name, st]) => (
                <div key={name} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700 }}>{name}</span>
                    <span style={{ color: c.textFaint }}>{st.correct} correct answer{st.correct !== 1 ? 's' : ''} · {st.featured} appearance{st.featured !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1, height: 4, background: c.borderSoft, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(st.correct / maxCorrect) * 100}%`, background: c.accent, borderRadius: 2 }} />
                    </div>
                    <div style={{ flex: 1, height: 4, background: c.borderSoft, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(st.featured / maxFeatured) * 100}%`, background: c.success, borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 16, fontSize: 10, color: c.textFaint, letterSpacing: 1 }}>
                <span><span style={{ color: c.accent }}>■</span> correct answers</span>
                <span><span style={{ color: c.success }}>■</span> total appearances</span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
              <span style={{ color: currentGame.status === 'active' ? c.success : currentGame.status === 'finished' ? c.danger : c.accent }}>● </span>
              {currentGame.status.toUpperCase()}
            </div>
            <div style={s.meta}>{livePlayers.length} players joined</div>
          </div>
          {livePlayers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {livePlayers.map(p => (
                <div key={p.name} style={{ padding: '6px 14px', border: `1px solid ${answeredPlayers.has(p.name) ? c.success : c.border}`, borderRadius: 20, fontSize: 12, color: c.textDim, transition: 'border-color 0.3s' }}>
                  {p.name}{answeredPlayers.has(p.name) && <span style={{ color: c.success }}> ✓</span>}
                </div>
              ))}
            </div>
          )}
          {currentGame.status === 'lobby' && (
            <button style={{ ...s.bigBtn, background: c.success, color: c.successText, opacity: advancing ? 0.6 : 1 }} onClick={startGame} disabled={advancing}>{advancing ? 'Starting…' : '🚀 Start Game'}</button>
          )}
          {currentGame.status === 'active' && q && (
            <div style={s.activeCard}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: c.success, marginBottom: 10 }}>QUESTION {qIdx + 1} OF {currentGame.questions.length}</div>
              {q.questionImage && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: c.accent, marginBottom: 6 }}>📷 QUESTION IMAGE</div>
                  <img src={q.questionImage} alt="" style={{ width: '100%', maxWidth: 400, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, border: `1px solid ${withAlpha(c.accent, 0.2)}`, display: 'block' }} />
                </div>
              )}
              <div style={{ fontSize: 15, fontStyle: 'italic', color: c.text, lineHeight: 1.6, marginBottom: 10 }}>"{q.post}"</div>
              <div style={{ fontSize: 13, color: c.textFaint, marginBottom: 10 }}>
                {answeredPlayers.size} / {livePlayers.length} answered
                {allAnswered && <span style={{ color: c.success, marginLeft: 8 }}>· Everyone's in! ✓</span>}
              </div>
              {livePlayers.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {livePlayers.filter(pl => answeredPlayers.has(pl.name)).map(pl => {
                      const correct = liveAnswers[`${pl.name}:::${qIdx}`] === q.author
                      return (
                        <span key={pl.name} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, border: `1px solid ${correct ? withAlpha(c.success, 0.53) : withAlpha(c.danger, 0.53)}`, background: correct ? withAlpha(c.success, 0.08) : withAlpha(c.danger, 0.08), color: c.textDim }}>
                          {correct ? '✅' : '❌'} {pl.name}
                        </span>
                      )
                    })}
                    {livePlayers.filter(pl => !answeredPlayers.has(pl.name)).map(pl => (
                      <span key={pl.name} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, border: `1px dashed ${c.border}`, color: c.textFaint }}>
                        ⏳ {pl.name}
                      </span>
                    ))}
                  </div>
                  {answeredPlayers.size > 0 && !allAnswered && (
                    <div style={{ fontSize: 11, color: c.textFaint }}>
                      Waiting on: {livePlayers.filter(pl => !answeredPlayers.has(pl.name)).map(pl => pl.name).join(', ')}
                    </div>
                  )}
                </div>
              )}
              {(q.revealImage || currentGame.revealMode === 'manual') ? (
                <div style={s.revealBox}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: c.success, marginBottom: 8 }}>{q.revealImage ? '🎉 REVEAL IMAGE' : '✅ ANSWER REVEAL'}</div>
                  {isRevealed ? (
                    <>
                      {q.revealImage && <img src={q.revealImage} alt="reveal" style={{ width: '100%', maxWidth: 400, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, marginBottom: 10, border: `1px solid ${withAlpha(c.success, 0.27)}`, display: 'block' }} />}
                      <div style={{ fontSize: 11, color: c.success, marginBottom: 8 }}>✓ {q.revealImage ? 'Players can see this image now' : 'Players can now see the correct answer'}</div>
                      <button style={s.hideRevealBtn} onClick={() => toggleReveal(qIdx)}>{q.revealImage ? 'Hide Reveal Image' : 'Hide Correct Answer'}</button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: c.textFaint, marginBottom: 10 }}>
                        {q.revealImage
                          ? (currentGame.revealMode === 'manual' ? 'Reveal shows the correct answer and this image to everyone at once.' : 'Drop the bonus image after players have answered.')
                          : "Players won't see the correct answer until you reveal it."}
                      </div>
                      <button style={s.showRevealBtn} onClick={() => toggleReveal(qIdx)}>{q.revealImage ? '🎉 Show Reveal to Players' : '✅ Reveal Correct Answer'}</button>
                    </>
                  )}
                </div>
              ) : (
                <div style={s.revealBox}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: c.success, marginBottom: 8 }}>📺 REVEAL ON BIG SCREEN</div>
                  <div style={{ fontSize: 11, color: c.textFaint, marginBottom: 10 }}>Phones reveal on their own as each person answers. The big screen flips to the answer + leaderboard once everyone's in — tap here to reveal it to the room sooner.</div>
                  <button style={s.showRevealBtn} onClick={() => toggleReveal(qIdx)}>{isRevealed ? '✓ Revealed to the room' : '📺 Reveal Answer to the Room'}</button>
                </div>
              )}
              <button style={{ ...s.bigBtn, background: c.accent, color: c.accentText, marginTop: 12, opacity: advancing ? 0.6 : 1 }} onClick={nextQuestion} disabled={advancing}>
                {advancing ? 'Advancing…' : qIdx + 1 >= currentGame.questions.length ? 'Finish Game →' : 'Next Question →'}
              </button>
            </div>
          )}
          {currentGame.status === 'finished' && <div style={{ textAlign: 'center', fontSize: 28, padding: '30px 0', color: c.accent }}>🎉 Game Over!</div>}
          {scores.length > 0 && (
            <div style={s.section}>
              <h2 style={s.sectionTitle}>LIVE SCOREBOARD</h2>
              {scores.map(([name, score], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 28, fontSize: 16, textAlign: 'center' }}>{['🏆','🥈','🥉'][i] || `#${i+1}`}</div>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{name}</div>
                  <div style={{ fontSize: 13, color: c.accent, minWidth: 50, textAlign: 'right' }}>{score} pt{score !== 1 ? 's' : ''}</div>
                  <div style={{ width: 80, height: 4, background: c.borderSoft, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: c.accent, borderRadius: 2, width: `${scores[0][1] > 0 ? (score / scores[0][1]) * 100 : 0}%`, transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 28 }}>
            <button style={{ ...s.ghost, color: c.danger }} onClick={resetGame}>↺ Reset Game</button>
          </div>
          {saveError && <div style={{ color: c.danger, fontSize: 12, marginTop: 12 }}>{saveError}</div>}
        </div>
      </div>
    )
  }

  // ── MOCK PREVIEW ──────────────────────────────────────────────────────────
  if (screen === 'mockplay' && currentGame) {
    return <PlayerRoom gameId={currentGame.id} mockGame={currentGame} onExitMock={() => setScreen(mockReturnScreen)} />
  }

  return null
}

function chip(color) {
  return { fontSize: 10, color, background: color + '22', border: `1px solid ${color}44`, borderRadius: 3, padding: '2px 7px', letterSpacing: 1 }
}

function ColorField({ s, label, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={s.label}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} style={s.colorSwatch} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} style={{ ...s.input, flex: 1 }} />
      </div>
    </div>
  )
}

function ThemePreview({ theme, title }) {
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: `1px solid ${withAlpha(theme.textColor, 0.15)}`, background: theme.backgroundColor, padding: '28px 22px', fontFamily: theme.bodyFont }}>
      {theme.backgroundImage && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${theme.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.35 }} />
      )}
      <div style={{ position: 'relative' }}>
        {theme.logoImage ? (
          <img src={theme.logoImage} alt="logo" style={{ maxWidth: 140, maxHeight: 70, objectFit: 'contain', display: 'block', margin: '0 auto 10px' }} />
        ) : (
          <div style={{ textAlign: 'center', fontFamily: theme.headingFont, fontSize: 22, fontWeight: 900, letterSpacing: 2, color: theme.textColor, marginBottom: 6 }}>
            {title || 'YOUR GAME'}
          </div>
        )}
        <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: 1, color: withAlpha(theme.textColor, 0.6), marginBottom: 20 }}>{theme.tagline}</div>
        <div style={{ background: theme.cardColor, border: `1px solid ${withAlpha(theme.textColor, 0.12)}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: withAlpha(theme.textColor, 0.5), marginBottom: 6 }}>@someone</div>
          <div style={{ fontSize: 14, color: theme.textColor, lineHeight: 1.5 }}>"Just spent 3 hours reorganizing my spice cabinet alphabetically."</div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 10, letterSpacing: 2, color: withAlpha(theme.textColor, 0.5), marginBottom: 10 }}>{theme.questionLabel}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ padding: '10px 8px', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 700, background: theme.primaryColor, color: contrastColor(theme.primaryColor) }}>Alex</div>
          <div style={{ padding: '10px 8px', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 700, background: theme.secondaryColor, color: contrastColor(theme.secondaryColor) }}>Jordan ✓</div>
        </div>
      </div>
    </div>
  )
}

const DASH_PALETTES = {
  dark: {
    bg: '#0a0a12', card: '#111120', cardAlt: '#0d0d1a', border: '#222232', borderSoft: '#1e1e2e',
    text: '#f0f0f0', textDim: '#dddddd', textMuted: '#aaaaaa', textFaint: '#666666', textGhost: '#3a3a48',
    accent: '#ffd166', accentText: '#111111',
    success: '#00ff88', successText: '#111111',
    danger: '#ff6b6b',
  },
  light: {
    bg: '#f5f5f9', card: '#ffffff', cardAlt: '#f1f1f7', border: '#e2e2ec', borderSoft: '#eceef4',
    text: '#1a1a26', textDim: '#33333f', textMuted: '#62626f', textFaint: '#83839a', textGhost: '#c2c2cc',
    accent: '#dd9f2e', accentText: '#111111',
    success: '#0e9f63', successText: '#ffffff',
    danger: '#d94854',
  },
}

// Builds the admin/host dashboard's own chrome styling (distinct from each
// game's player-facing theme). Returns `s` (ready-to-use style objects) and
// `c` (the raw palette) for one-off inline styling.
function buildDashTheme(mode) {
  const c = DASH_PALETTES[mode] || DASH_PALETTES.dark
  const bodyFont = "'Poppins', sans-serif"
  const s = {
    page: { minHeight: '100vh', background: c.bg, color: c.text, fontFamily: bodyFont, padding: '0 0 80px' },
    container: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
    header: { textAlign: 'center', padding: '32px 0 32px', position: 'relative' },
    logoImg: { width: 96, height: 96, borderRadius: 20, display: 'block' },
    tagline: { color: c.textMuted, fontSize: 14, marginTop: 4, letterSpacing: 0.5 },
    modeToggle: { position: 'absolute', top: 0, right: 0, background: c.card, border: `1px solid ${c.border}`, borderRadius: 20, width: 38, height: 38, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    bigBtn: { width: '100%', padding: '18px 24px', background: c.accent, color: c.accentText, border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.3, fontFamily: bodyFont, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 },
    section: { marginTop: 36 },
    sectionTitle: { fontSize: 11, letterSpacing: 2, color: c.textFaint, marginBottom: 16, fontWeight: 700, textTransform: 'uppercase' },
    gameCard: { background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    gameCardTitle: { fontSize: 16, fontWeight: 700 },
    badge: { padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: 1 },
    meta: { fontSize: 12, color: c.textFaint },
    ghost: { background: 'none', border: 'none', cursor: 'pointer', color: c.textMuted, fontSize: 13, fontFamily: bodyFont },
    topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, position: 'relative', gap: 10 },
    back: { background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 14, fontFamily: bodyFont },
    step: { fontSize: 11, letterSpacing: 2, color: c.textFaint },
    tabs: { display: 'flex', gap: 2, marginBottom: 28, borderBottom: `1px solid ${c.border}` },
    tab: { background: 'none', border: 'none', color: c.textFaint, cursor: 'pointer', padding: '10px 20px', fontSize: 11, letterSpacing: 1, fontFamily: bodyFont, fontWeight: 600 },
    tabOn: { color: c.accent, borderBottom: `2px solid ${c.accent}` },
    label: { display: 'block', fontSize: 10, letterSpacing: 1.5, color: c.textFaint, marginBottom: 8, fontWeight: 700 },
    input: { width: '100%', background: c.card, border: `1px solid ${c.border}`, borderRadius: 6, color: c.text, padding: '12px 14px', fontSize: 14, fontFamily: bodyFont, boxSizing: 'border-box' },
    textarea: { width: '100%', background: c.card, border: `1px solid ${c.border}`, borderRadius: 6, color: c.text, padding: '12px 14px', fontSize: 14, fontFamily: bodyFont, boxSizing: 'border-box', minHeight: 80, resize: 'vertical', marginBottom: 16 },
    addBox: { background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 20, marginTop: 24 },
    addTitle: { fontSize: 11, letterSpacing: 2, color: c.accent, marginBottom: 16, fontWeight: 700 },
    addBtn: { background: c.accent, color: c.accentText, border: 'none', borderRadius: 6, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 800, letterSpacing: 0.3, fontFamily: bodyFont },
    qRow: { background: c.card, border: `1px solid ${c.borderSoft}`, borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 10 },
    qNum: { color: c.accent, fontSize: 11, fontWeight: 700, minWidth: 24, paddingTop: 2 },
    qText: { fontSize: 13, color: c.textDim, marginBottom: 4, fontStyle: 'italic' },
    qSub: { fontSize: 11, color: c.textFaint },
    x: { background: 'none', border: 'none', color: c.textGhost, cursor: 'pointer', fontSize: 16 },
    arrowBtn: { background: c.cardAlt, border: `1px solid ${c.borderSoft}`, color: c.textMuted, cursor: 'pointer', fontSize: 10, borderRadius: 4, padding: '4px 8px', lineHeight: 1 },
    editIconBtn: { background: 'none', border: 'none', color: c.accent, cursor: 'pointer', fontSize: 15 },
    prevCard: { background: c.card, border: `1px solid ${c.borderSoft}`, borderRadius: 8, padding: 20, marginBottom: 14 },
    prevPost: { fontSize: 15, color: c.text, fontStyle: 'italic', marginBottom: 16, lineHeight: 1.5 },
    shareBox: { background: c.card, border: `1px solid ${withAlpha(c.accent, 0.2)}`, borderRadius: 8, padding: '16px 20px', marginBottom: 20 },
    copyBtn: { background: c.accent, color: c.accentText, border: 'none', borderRadius: 5, padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 800, letterSpacing: 0.3, fontFamily: bodyFont },
    activeCard: { background: c.card, border: `1px solid ${withAlpha(c.success, 0.2)}`, borderRadius: 8, padding: 24, marginBottom: 20 },
    revealBox: { background: c.cardAlt, border: `1px solid ${withAlpha(c.success, 0.13)}`, borderRadius: 8, padding: 16, marginBottom: 12 },
    showRevealBtn: { width: '100%', padding: '13px 16px', background: withAlpha(c.success, 0.13), color: c.success, border: `1px solid ${withAlpha(c.success, 0.27)}`, borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: bodyFont, letterSpacing: 0.3 },
    hideRevealBtn: { background: 'none', border: `1px solid ${withAlpha(c.danger, 0.27)}`, color: c.danger, borderRadius: 5, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontFamily: bodyFont },
    editBtn: { flex: 1, padding: '12px 16px', background: c.card, color: c.accent, border: `1px solid ${withAlpha(c.accent, 0.27)}`, borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700, letterSpacing: 0.3, fontFamily: bodyFont },
    presetGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 },
    presetBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, padding: '14px 10px', cursor: 'pointer', fontFamily: bodyFont },
    colorSwatch: { width: 40, height: 40, padding: 0, border: `1px solid ${c.border}`, borderRadius: 6, background: 'none', cursor: 'pointer' },
    revealModeBtn: { flex: 1, padding: '12px 16px', background: c.card, color: c.textMuted, border: `1px solid ${c.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: bodyFont },
    revealModeBtnOn: { background: withAlpha(c.accent, 0.13), color: c.accent, border: `1px solid ${withAlpha(c.accent, 0.4)}` },
  }
  return { s, c }
}
