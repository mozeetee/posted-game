import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { ImageUploadSlot } from './ImageUpload'
import { compressImage, readFileAsDataUrl } from './ImageUpload'
import { DEFAULT_THEME, THEME_PRESETS, FONT_OPTIONS, getTheme, ensureGoogleFont, withAlpha, contrastColor } from './theme'
import PlayerRoom from './PlayerRoom'

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

const EMPTY_POST = { post: '', author: '', choices: ['', '', '', ''], questionImage: null, revealImage: null }

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
  const [unlocked, setUnlocked] = useState(isHostMode || localStorage.getItem(ADMIN_UNLOCK_STORAGE_KEY) === ADMIN_PASSWORD_HASH)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [mockReturnScreen, setMockReturnScreen] = useState('manage')

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

  useEffect(() => {
    if (screen !== 'manage' || !currentGame) return
    const channel = supabase
      .channel(`game-host-${currentGame.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `game_id=eq.${currentGame.id}` },
        payload => {
          if (payload.new) setCurrentGame(payload.new.data)
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [screen, currentGame?.id])

  // Poll as a fallback in case Supabase Realtime isn't delivering postgres_changes
  // events (e.g. replication isn't enabled for these tables in this project) — this
  // is how the host sees player answers land in the live scoreboard.
  useEffect(() => {
    if (screen !== 'manage' || !currentGame) return
    const gameId = currentGame.id
    const poll = setInterval(async () => {
      const { data } = await supabase.from('games').select('data').eq('game_id', gameId).single()
      if (data?.data) setCurrentGame(data.data)
    }, 2500)
    return () => clearInterval(poll)
  }, [screen, currentGame?.id])

  async function loadGames() {
    if (isHostMode) return
    const { data, error } = await supabase
      .from('games')
      .select('game_id, data')
      .order('created_at', { ascending: false })
    if (!error && data) setGames(data.map(r => r.data))
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
    } catch (e) {
      setSaveError('Save failed: ' + (e.message || 'unknown error'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteGame(gameId) {
    await supabase.from('games').delete().eq('game_id', gameId)
    await loadGames()
    if (currentGame?.id === gameId) { setCurrentGame(null); setScreen('home') }
  }

  function startNewGame() {
    const id = generateGameId()
    setCurrentGame({ id, title: '', hostKey: generateHostKey(), theme: { ...DEFAULT_THEME }, questions: SAMPLE_QUESTIONS, players: [], status: 'lobby', currentQuestion: 0, createdAt: Date.now(), answers: {} })
    setGameTitle('')
    setNewPost(EMPTY_POST)
    setEditingId(null)
    setEditDraft(null)
    setScreen('create')
    setActiveTab('questions')
  }

  function startMockPreview(fromScreen) {
    if (!currentGame || currentGame.questions.length === 0) return
    setMockReturnScreen(fromScreen)
    setScreen('mockplay')
  }

  function updateTheme(patch) {
    setCurrentGame(g => ({ ...g, theme: { ...getTheme(g), ...patch } }))
  }

  function applyPreset(preset) {
    updateTheme(preset.theme)
  }

  async function publishGame() {
    if (!gameTitle.trim() || currentGame.questions.length === 0) return
    // keep the existing status when editing a published game; new games are already 'lobby'
    const game = { ...currentGame, title: gameTitle }
    await saveGame(game)
    if (!saveError) { setCurrentGame(game); setScreen('manage') }
  }

  async function startGame() {
    const game = { ...currentGame, status: 'active', currentQuestion: 0 }
    await saveGame(game); setCurrentGame(game)
  }

  async function nextQuestion() {
    const next = currentGame.currentQuestion + 1
    setRevealedMap(m => ({ ...m, [next]: false }))
    // clear reveal flag for next question
    await supabase.from('reveals').delete().eq('game_id', currentGame.id).eq('question_idx', next)
    const game = { ...currentGame, currentQuestion: next, status: next >= currentGame.questions.length ? 'finished' : 'active' }
    await saveGame(game); setCurrentGame(game)
  }

  async function resetGame() {
    await supabase.from('reveals').delete().eq('game_id', currentGame.id)
    const game = { ...currentGame, status: 'lobby', currentQuestion: 0, answers: {}, players: [] }
    await saveGame(game); setCurrentGame(game); setRevealedMap({})
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
    const q = { id: Date.now(), post: newPost.post, author: newPost.author, choices: filledChoices, questionImage: newPost.questionImage || null, revealImage: newPost.revealImage || null }
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
    const choices = [...q.choices]
    while (choices.length < 4) choices.push('')
    setEditingId(q.id)
    setEditDraft({ ...q, choices })
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
      questions: g.questions.map(q => q.id === editingId ? { ...editDraft, choices: filledChoices } : q),
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

  function computeScores(game) {
    const scores = {}
    ;(game.players || []).forEach(p => (scores[p.name] = 0))
    Object.entries(game.answers || {}).forEach(([key, answer]) => {
      const [pName, qIdxStr] = key.split(':::')
      const q = game.questions[parseInt(qIdxStr)]
      if (q && answer === q.author) scores[pName] = (scores[pName] || 0) + 1
    })
    return Object.entries(scores).sort((a, b) => b[1] - a[1])
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
      <div style={{ ...s.container, maxWidth: 380, textAlign: 'center', paddingTop: 100 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Admin Access</div>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 28, letterSpacing: 1 }}>Enter the admin password to manage games.</div>
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
        {pwError && <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 14 }}>{pwError}</div>}
        <button style={s.bigBtn} onClick={tryUnlock}>Unlock →</button>
      </div>
    </div>
  )

  // ── HOST MODE: LOADING / ERROR ────────────────────────────────────────────
  if (screen === 'hostloading') return (
    <div style={s.page}>
      <div style={{ ...s.container, textAlign: 'center', paddingTop: 120 }}>
        <div style={{ fontSize: 14, color: '#aaa', letterSpacing: 1 }}>Loading your game…</div>
      </div>
    </div>
  )
  if (screen === 'hosterror') return (
    <div style={s.page}>
      <div style={{ ...s.container, textAlign: 'center', paddingTop: 120 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Invalid host link</div>
        <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>This link is missing or has the wrong host key.<br />Ask the game organizer to send you a fresh one.</div>
      </div>
    </div>
  )

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (screen === 'home') return (
    <div style={s.page}>
      <div style={s.container}>
        <header style={s.header}>
          <div style={s.logo}>WHO<span style={s.accent}>POSTED</span>THIS?</div>
          <p style={s.tagline}>The party game where nobody's anonymous</p>
        </header>
        <button style={s.bigBtn} onClick={startNewGame}><span>＋</span> Create New Game</button>
        {games.length > 0 && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>YOUR GAMES</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {games.map(g => (
                <div key={g.id} style={s.gameCard}>
                  <div>
                    <div style={s.gameCardTitle}>{g.title || 'Untitled'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                      <span style={{ ...s.badge, background: g.status === 'active' ? '#00ff88' : g.status === 'finished' ? '#ff6b6b' : '#ffd166', color: '#111' }}>{g.status.toUpperCase()}</span>
                      <span style={s.meta}>{g.questions.length} Qs · {(g.players || []).length} players</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button style={s.ghost} onClick={() => { setCurrentGame(g); setGameTitle(g.title); setScreen('manage') }}>Manage</button>
                    <button style={{ ...s.ghost, color: '#ff6b6b' }} onClick={() => deleteGame(g.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {games.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎲</div>
            <p style={{ color: '#444', fontSize: 14 }}>No games yet — create your first one above!</p>
          </div>
        )}
      </div>
    </div>
  )

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (screen === 'create') {
    const theme = getTheme(currentGame)
    const isPublished = isHostMode || games.some(g => g.id === currentGame.id)
    return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.topBar}>
          <button style={s.back} onClick={() => setScreen(isPublished ? 'manage' : 'home')}>← {isPublished ? 'Back to Manage' : 'Back'}</button>
          <div style={s.step}>{isPublished ? 'EDIT GAME' : 'GAME SETUP'} · {currentGame.id}</div>
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
                      <label style={s.label}>THE POST / MESSAGE</label>
                      <textarea style={s.textarea} value={editDraft.post} onChange={e => setEditDraft(d => ({ ...d, post: e.target.value }))} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
                        <ImageUploadSlot label="QUESTION IMAGE" hint="Shown while players are guessing" value={editDraft.questionImage} onChange={v => setEditDraft(d => ({ ...d, questionImage: v }))} accentColor="#ffd166" cropAspect={1} />
                        <ImageUploadSlot label="REVEAL IMAGE" hint="Shown after everyone answers" value={editDraft.revealImage} onChange={v => setEditDraft(d => ({ ...d, revealImage: v }))} accentColor="#00ff88" cropAspect={1} />
                      </div>
                      <label style={s.label}>WHO ACTUALLY POSTED IT?</label>
                      <input style={{ ...s.input, marginBottom: 16 }} placeholder="Must exactly match one choice" value={editDraft.author} onChange={e => setEditDraft(d => ({ ...d, author: e.target.value }))} />
                      <label style={s.label}>ANSWER CHOICES (2–4)</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                        {editDraft.choices.map((c, ci) => (
                          <input key={ci} style={s.input} placeholder={`Choice ${ci + 1}`} value={c} onChange={e => updateEditChoice(ci, e.target.value)} />
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
                          {q.questionImage && <span style={chip('#ffd166')}>📷 question img</span>}
                          {q.revealImage && <span style={chip('#00ff88')}>🎉 reveal img</span>}
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
              {Object.keys(currentGame.answers || {}).length > 0 && (
                <div style={{ fontSize: 11, color: '#ffd166', background: '#ffd16611', border: '1px solid #ffd16633', borderRadius: 4, padding: '10px 14px', marginTop: 4 }}>
                  ⚠ Players have already answered some questions — editing, reordering, or removing questions now can mix up their scores. Best to reset the game after big changes.
                </div>
              )}
            </div>

            <div style={s.addBox}>
              <h3 style={s.addTitle}>ADD A QUESTION</h3>
              <label style={s.label}>THE POST / MESSAGE</label>
              <textarea style={s.textarea} placeholder="Paste the social media post or message here..." value={newPost.post} onChange={e => setNewPost(p => ({ ...p, post: e.target.value }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
                <ImageUploadSlot label="QUESTION IMAGE" hint="Shown while players are guessing" value={newPost.questionImage} onChange={v => setNewPost(p => ({ ...p, questionImage: v }))} accentColor="#ffd166" cropAspect={1} />
                <ImageUploadSlot label="REVEAL IMAGE" hint="Shown after everyone answers" value={newPost.revealImage} onChange={v => setNewPost(p => ({ ...p, revealImage: v }))} accentColor="#00ff88" cropAspect={1} />
              </div>
              <label style={s.label}>WHO ACTUALLY POSTED IT?</label>
              <input style={{ ...s.input, marginBottom: 16 }} placeholder="Must exactly match one choice" value={newPost.author} onChange={e => setNewPost(p => ({ ...p, author: e.target.value }))} />
              <label style={s.label}>ANSWER CHOICES (2–4)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {newPost.choices.map((c, i) => (
                  <input key={i} style={s.input} placeholder={`Choice ${i + 1}`} value={c} onChange={e => updateChoice(i, e.target.value)} />
                ))}
              </div>
              <button style={s.addBtn} onClick={addQuestion}>Add Question →</button>
            </div>

            {saveError && <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 12, padding: '10px 14px', background: '#ff6b6b11', borderRadius: 4 }}>{saveError}</div>}
            <button
              style={{ ...s.bigBtn, marginTop: 24, opacity: (!gameTitle.trim() || currentGame.questions.length === 0 || saving) ? 0.4 : 1 }}
              onClick={publishGame}
              disabled={!gameTitle.trim() || currentGame.questions.length === 0 || saving}
            >{saving ? 'Saving…' : isPublished ? 'Save Changes →' : 'Publish & Get Share Link →'}</button>
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

            <div style={s.section}>
              <h2 style={s.sectionTitle}>QUICK PRESETS</h2>
              <div style={s.presetGrid}>
                {THEME_PRESETS.map(preset => (
                  <button key={preset.id} style={s.presetBtn} onClick={() => applyPreset(preset)}>
                    <span style={{ fontSize: 22 }}>{preset.emoji}</span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      {[preset.theme.primaryColor, preset.theme.secondaryColor, preset.theme.backgroundColor].map((c, i) => (
                        <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: c, border: '1px solid #ffffff22' }} />
                      ))}
                    </span>
                    <span style={{ fontSize: 11, color: '#ccc', textAlign: 'center' }}>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={s.section}>
              <h2 style={s.sectionTitle}>COLORS</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <ColorField label="PRIMARY" value={theme.primaryColor} onChange={v => updateTheme({ primaryColor: v })} />
                <ColorField label="SECONDARY" value={theme.secondaryColor} onChange={v => updateTheme({ secondaryColor: v })} />
                <ColorField label="BACKGROUND" value={theme.backgroundColor} onChange={v => updateTheme({ backgroundColor: v })} />
                <ColorField label="CARD" value={theme.cardColor} onChange={v => updateTheme({ cardColor: v })} />
                <ColorField label="TEXT" value={theme.textColor} onChange={v => updateTheme({ textColor: v })} />
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
                <div style={{ fontSize: 10, letterSpacing: 2, color: '#555', marginBottom: 10 }}>Question {i + 1}</div>
                {q.questionImage && <img src={q.questionImage} alt="" style={{ width: '100%', maxWidth: 400, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, marginBottom: 12, border: '1px solid #ffd16633', display: 'block' }} />}
                <div style={s.prevPost}>"{q.post}"</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {q.choices.map(c => (
                    <div key={c} style={{ padding: '10px 14px', borderRadius: 4, fontSize: 13, textAlign: 'center', fontWeight: 700, background: c === q.author ? '#00ff8822' : '#1e1e2e', color: c === q.author ? '#00ff88' : '#aaa', border: `1px solid ${c === q.author ? '#00ff8844' : '#2e2e3e'}` }}>
                      {c === q.author ? '✓ ' : ''}{c}
                    </div>
                  ))}
                </div>
                {q.revealImage && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: '#00ff88', marginBottom: 6 }}>🎉 REVEAL IMAGE</div>
                    <img src={q.revealImage} alt="" style={{ width: '100%', maxWidth: 400, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, border: '1px solid #00ff8833', display: 'block' }} />
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
    const scores = computeScores(currentGame)
    const personStats = computePersonStats(currentGame)
    const maxCorrect = Math.max(1, ...personStats.map(([, st]) => st.correct))
    const maxFeatured = Math.max(1, ...personStats.map(([, st]) => st.featured))
    const qIdx = currentGame.currentQuestion
    const q = currentGame.questions[qIdx]
    const answeredPlayers = new Set(
      Object.keys(currentGame.answers || {}).filter(k => k.endsWith(`:::${qIdx}`)).map(k => k.split(':::')[0])
    )
    const isRevealed = !!revealedMap[qIdx]
    const allAnswered = (currentGame.players || []).length > 0 && answeredPlayers.size >= (currentGame.players || []).length

    return (
      <div style={s.page}>
        <div style={s.container}>
          <div style={s.topBar}>
            {isHostMode
              ? <div style={{ ...s.step, color: '#ffd166' }}>YOU'RE THE HOST</div>
              : <button style={s.back} onClick={() => setScreen('home')}>← Home</button>}
            <div style={s.step}>{currentGame.title}</div>
          </div>
          <div style={s.shareBox}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: '#ffd166', marginBottom: 6 }}>SHARE WITH PLAYERS</div>
            <div style={{ fontSize: 12, color: '#aaa', wordBreak: 'break-all', marginBottom: 10, lineHeight: 1.5 }}>{getGameLink(currentGame.id)}</div>
            <button style={s.copyBtn} onClick={() => copyLink(currentGame.id)}>{copied ? '✓ Copied!' : 'Copy Link'}</button>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #ffd16622' }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#ffd166', marginBottom: 6 }}>PERSONALIZED LINK</div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>Type a guest's name to make a link that pre-fills it on their join screen.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...s.input, flex: 1 }} placeholder="Guest name, e.g. Sarah" value={guestName} onChange={e => { setGuestName(e.target.value); setGuestCopied(false) }} />
                <button style={{ ...s.copyBtn, opacity: guestName.trim() ? 1 : 0.4, whiteSpace: 'nowrap' }} disabled={!guestName.trim()} onClick={() => copyGuestLink(currentGame.id)}>{guestCopied ? '✓ Copied!' : 'Copy'}</button>
              </div>
              {guestName.trim() && <div style={{ fontSize: 11, color: '#666', wordBreak: 'break-all', marginTop: 8, lineHeight: 1.5 }}>{getGuestLink(currentGame.id)}</div>}
            </div>
            {!isHostMode && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #ffd16622' }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: '#00ff88', marginBottom: 6 }}>HOST LINK — FOR YOUR CUSTOMER</div>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>Lets them edit and run this game without seeing your other games.</div>
                {currentGame.hostKey && <div style={{ fontSize: 11, color: '#666', wordBreak: 'break-all', marginBottom: 8, lineHeight: 1.5 }}>{getHostLink(currentGame)}</div>}
                <button style={{ ...s.copyBtn, background: '#00ff88' }} onClick={copyHostLink}>{hostCopied ? '✓ Copied!' : 'Copy Host Link'}</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button style={s.editBtn} onClick={() => { setGameTitle(currentGame.title); setActiveTab('questions'); setScreen('create') }}>✎ Edit Questions</button>
            <button style={s.editBtn} onClick={() => { setGameTitle(currentGame.title); setActiveTab('customize'); setScreen('create') }}>🎨 Customize Theme</button>
          </div>
          <button style={{ ...s.bigBtn, marginBottom: 20 }} onClick={() => startMockPreview('manage')}>🎮 Play as a Guest (Preview)</button>

          {personStats.length > 0 && (
            <div style={s.section}>
              <h2 style={s.sectionTitle}>QUESTION BALANCE</h2>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 16, lineHeight: 1.5 }}>How often each person is a choice vs. the correct answer — keep these close so guesses stay random and no one's an obvious giveaway.</div>
              {personStats.map(([name, st]) => (
                <div key={name} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700 }}>{name}</span>
                    <span style={{ color: '#555' }}>{st.correct} correct answer{st.correct !== 1 ? 's' : ''} · {st.featured} appearance{st.featured !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1, height: 4, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(st.correct / maxCorrect) * 100}%`, background: '#ffd166', borderRadius: 2 }} />
                    </div>
                    <div style={{ flex: 1, height: 4, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(st.featured / maxFeatured) * 100}%`, background: '#00ff88', borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 16, fontSize: 10, color: '#555', letterSpacing: 1 }}>
                <span><span style={{ color: '#ffd166' }}>■</span> correct answers</span>
                <span><span style={{ color: '#00ff88' }}>■</span> total appearances</span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
              <span style={{ color: currentGame.status === 'active' ? '#00ff88' : currentGame.status === 'finished' ? '#ff6b6b' : '#ffd166' }}>● </span>
              {currentGame.status.toUpperCase()}
            </div>
            <div style={s.meta}>{(currentGame.players || []).length} players joined</div>
          </div>
          {(currentGame.players || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {(currentGame.players || []).map(p => (
                <div key={p.name} style={{ padding: '6px 14px', border: `1px solid ${answeredPlayers.has(p.name) ? '#00ff88' : '#333'}`, borderRadius: 20, fontSize: 12, color: '#ddd', transition: 'border-color 0.3s' }}>
                  {p.name}{answeredPlayers.has(p.name) && <span style={{ color: '#00ff88' }}> ✓</span>}
                </div>
              ))}
            </div>
          )}
          {currentGame.status === 'lobby' && (
            <button style={{ ...s.bigBtn, background: '#00ff88', color: '#111' }} onClick={startGame}>🚀 Start Game</button>
          )}
          {currentGame.status === 'active' && q && (
            <div style={s.activeCard}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#00ff88', marginBottom: 10 }}>QUESTION {qIdx + 1} OF {currentGame.questions.length}</div>
              {q.questionImage && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: '#ffd166', marginBottom: 6 }}>📷 QUESTION IMAGE</div>
                  <img src={q.questionImage} alt="" style={{ width: '100%', maxWidth: 400, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, border: '1px solid #ffd16633', display: 'block' }} />
                </div>
              )}
              <div style={{ fontSize: 15, fontStyle: 'italic', color: '#f0f0f0', lineHeight: 1.6, marginBottom: 10 }}>"{q.post}"</div>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
                {answeredPlayers.size} / {(currentGame.players || []).length} answered
                {allAnswered && <span style={{ color: '#00ff88', marginLeft: 8 }}>· Everyone's in! ✓</span>}
              </div>
              {q.revealImage ? (
                <div style={s.revealBox}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: '#00ff88', marginBottom: 8 }}>🎉 REVEAL IMAGE</div>
                  {isRevealed ? (
                    <>
                      <img src={q.revealImage} alt="reveal" style={{ width: '100%', maxWidth: 400, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, marginBottom: 10, border: '1px solid #00ff8844', display: 'block' }} />
                      <div style={{ fontSize: 11, color: '#00ff88', marginBottom: 8 }}>✓ Players can see this image now</div>
                      <button style={s.hideRevealBtn} onClick={() => toggleReveal(qIdx)}>Hide Reveal Image</button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>Drop the reveal after players have answered.</div>
                      <button style={s.showRevealBtn} onClick={() => toggleReveal(qIdx)}>🎉 Show Reveal to Players</button>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#333', marginBottom: 12, padding: '10px 14px', background: '#0d0d1a', borderRadius: 4, border: '1px dashed #1e1e2e' }}>No reveal image for this question.</div>
              )}
              <button style={{ ...s.bigBtn, background: '#ffd166', color: '#111', marginTop: 12 }} onClick={nextQuestion}>
                {qIdx + 1 >= currentGame.questions.length ? 'Finish Game →' : 'Next Question →'}
              </button>
            </div>
          )}
          {currentGame.status === 'finished' && <div style={{ textAlign: 'center', fontSize: 28, padding: '30px 0', color: '#ffd166' }}>🎉 Game Over!</div>}
          {scores.length > 0 && (
            <div style={s.section}>
              <h2 style={s.sectionTitle}>LIVE SCOREBOARD</h2>
              {scores.map(([name, score], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 28, fontSize: 16, textAlign: 'center' }}>{['🏆','🥈','🥉'][i] || `#${i+1}`}</div>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{name}</div>
                  <div style={{ fontSize: 13, color: '#ffd166', minWidth: 50, textAlign: 'right' }}>{score} pt{score !== 1 ? 's' : ''}</div>
                  <div style={{ width: 80, height: 4, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#ffd166', borderRadius: 2, width: `${scores[0][1] > 0 ? (score / scores[0][1]) * 100 : 0}%`, transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 28 }}>
            <button style={{ ...s.ghost, color: '#ff6b6b' }} onClick={resetGame}>↺ Reset Game</button>
          </div>
          {saveError && <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 12 }}>{saveError}</div>}
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

function ColorField({ label, value, onChange }) {
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ padding: '10px 8px', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 700, background: theme.primaryColor, color: contrastColor(theme.primaryColor) }}>Alex</div>
          <div style={{ padding: '10px 8px', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 700, background: theme.secondaryColor, color: contrastColor(theme.secondaryColor) }}>Jordan ✓</div>
        </div>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#0a0a12', color: '#f0f0f0', fontFamily: "'Courier New', monospace", padding: '0 0 80px' },
  container: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  header: { textAlign: 'center', padding: '40px 0 32px' },
  logo: { fontSize: 42, fontWeight: 900, letterSpacing: 4, color: '#f0f0f0', fontFamily: "'Arial Black', sans-serif" },
  accent: { color: '#ffd166' },
  tagline: { color: '#666', fontSize: 14, marginTop: 8, letterSpacing: 2 },
  bigBtn: { width: '100%', padding: '18px 24px', background: '#ffd166', color: '#111', border: 'none', borderRadius: 4, fontSize: 16, fontWeight: 900, cursor: 'pointer', letterSpacing: 2, fontFamily: "'Arial Black', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 },
  section: { marginTop: 36 },
  sectionTitle: { fontSize: 11, letterSpacing: 3, color: '#555', marginBottom: 16, fontWeight: 700 },
  gameCard: { background: '#111120', border: '1px solid #222', borderRadius: 6, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  gameCardTitle: { fontSize: 16, fontWeight: 700 },
  badge: { padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: 1 },
  meta: { fontSize: 12, color: '#555' },
  ghost: { background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 13, fontFamily: "'Courier New', monospace" },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  back: { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14, fontFamily: "'Courier New', monospace" },
  step: { fontSize: 11, letterSpacing: 3, color: '#555' },
  tabs: { display: 'flex', gap: 2, marginBottom: 28, borderBottom: '1px solid #222' },
  tab: { background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '10px 20px', fontSize: 11, letterSpacing: 2, fontFamily: "'Courier New', monospace" },
  tabOn: { color: '#ffd166', borderBottom: '2px solid #ffd166' },
  label: { display: 'block', fontSize: 10, letterSpacing: 2, color: '#555', marginBottom: 8, fontWeight: 700 },
  input: { width: '100%', background: '#111120', border: '1px solid #222', borderRadius: 4, color: '#f0f0f0', padding: '12px 14px', fontSize: 14, fontFamily: "'Courier New', monospace", boxSizing: 'border-box' },
  textarea: { width: '100%', background: '#111120', border: '1px solid #222', borderRadius: 4, color: '#f0f0f0', padding: '12px 14px', fontSize: 14, fontFamily: "'Courier New', monospace", boxSizing: 'border-box', minHeight: 80, resize: 'vertical', marginBottom: 16 },
  addBox: { background: '#111120', border: '1px solid #222', borderRadius: 6, padding: 20, marginTop: 24 },
  addTitle: { fontSize: 11, letterSpacing: 3, color: '#ffd166', marginBottom: 16, fontWeight: 700 },
  addBtn: { background: '#ffd166', color: '#111', border: 'none', borderRadius: 4, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 900, letterSpacing: 1, fontFamily: "'Arial Black', sans-serif" },
  qRow: { background: '#111120', border: '1px solid #1e1e2e', borderRadius: 6, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 10 },
  qNum: { color: '#ffd166', fontSize: 11, fontWeight: 700, minWidth: 24, paddingTop: 2 },
  qText: { fontSize: 13, color: '#ddd', marginBottom: 4, fontStyle: 'italic' },
  qSub: { fontSize: 11, color: '#555' },
  x: { background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: 16 },
  arrowBtn: { background: '#1a1a2e', border: '1px solid #2e2e3e', color: '#aaa', cursor: 'pointer', fontSize: 10, borderRadius: 3, padding: '4px 8px', lineHeight: 1 },
  editIconBtn: { background: 'none', border: 'none', color: '#ffd166', cursor: 'pointer', fontSize: 15 },
  prevCard: { background: '#111120', border: '1px solid #1e1e2e', borderRadius: 6, padding: 20, marginBottom: 14 },
  prevPost: { fontSize: 15, color: '#f0f0f0', fontStyle: 'italic', marginBottom: 16, lineHeight: 1.5 },
  shareBox: { background: '#111120', border: '1px solid #ffd16633', borderRadius: 6, padding: '16px 20px', marginBottom: 20 },
  copyBtn: { background: '#ffd166', color: '#111', border: 'none', borderRadius: 3, padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 900, letterSpacing: 1, fontFamily: "'Courier New', monospace" },
  activeCard: { background: '#111120', border: '1px solid #00ff8833', borderRadius: 6, padding: 24, marginBottom: 20 },
  revealBox: { background: '#0d0d1a', border: '1px solid #00ff8822', borderRadius: 6, padding: 16, marginBottom: 12 },
  showRevealBtn: { width: '100%', padding: '13px 16px', background: '#00ff8822', color: '#00ff88', border: '1px solid #00ff8844', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: "'Courier New', monospace", letterSpacing: 1 },
  hideRevealBtn: { background: 'none', border: '1px solid #ff6b6b44', color: '#ff6b6b', borderRadius: 3, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontFamily: "'Courier New', monospace" },
  editBtn: { flex: 1, padding: '12px 16px', background: '#111120', color: '#ffd166', border: '1px solid #ffd16644', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 700, letterSpacing: 1, fontFamily: "'Courier New', monospace" },
  presetGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 },
  presetBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: '#111120', border: '1px solid #222', borderRadius: 6, padding: '14px 10px', cursor: 'pointer', fontFamily: "'Courier New', monospace" },
  colorSwatch: { width: 40, height: 40, padding: 0, border: '1px solid #222', borderRadius: 4, background: 'none', cursor: 'pointer' },
}
