import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getTheme, ensureGoogleFont, withAlpha, contrastColor } from './theme'
import { ImageUploadSlot } from './ImageUpload'

// The guest-contributed survey for the "Who Posted This?" / Social Media
// edition (role=guest). Instead of the host digging up everyone's posts, the
// host texts this one link to the whole group. Each guest opens it, enters
// their name, and submits one or more of their OWN posts — a caption/quote/hot
// take plus an optional screenshot. Each submission becomes a question where
// that guest is the correct answer; the host pulls them in and adds the final
// touches (the guess options auto-fill from everyone who contributed).
//
// Unlike the single-bride survey, MANY people fill this in from the same link,
// so each browser gets a stable per-guest id (localStorage) — that lets a guest
// reopen the link and edit their own posts without touching anyone else's.

const guestIdKey = (gameId) => `wpt_guest_id_${gameId}`
const guestNameKey = (gameId) => `wpt_guest_name_${gameId}`
const guestDoneKey = (gameId) => `wpt_guest_done_${gameId}`

function makeGuestId() {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export default function GuestSurvey({ gameId, surveyKey = '' }) {
  const [status, setStatus] = useState('loading') // loading | error | form | done
  const [game, setGame] = useState(null)
  const [name, setName] = useState('')
  const [posts, setPosts] = useState([])          // [{ id, text, image }]
  const [saveState, setSaveState] = useState('')   // '', 'saving', 'saved', 'error'
  const [imageBlocked, setImageBlocked] = useState(false) // screenshot column not set up yet
  const guestId = useRef('')
  const saveTimers = useRef({})
  // If the DB hasn't had the guest-survey migration run yet, the `image` column
  // won't exist. We detect that once and fall back to saving text-only, so posts
  // still go through — screenshots just wait until the host runs the migration.
  const imageColumnOk = useRef(true)

  const theme = getTheme(game)
  const s = buildStyles(theme)

  useEffect(() => {
    ensureGoogleFont(theme.headingFont)
    ensureGoogleFont(theme.bodyFont)
  }, [theme.headingFont, theme.bodyFont])

  // Stable per-guest id so this browser edits only its own submissions.
  if (!guestId.current) {
    let id = localStorage.getItem(guestIdKey(gameId))
    if (!id) { id = makeGuestId(); localStorage.setItem(guestIdKey(gameId), id) }
    guestId.current = id
  }
  const rowId = (postId) => `${guestId.current}::${postId}`

  // Load the game, verify the survey key, and prefill this guest's saved posts.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('games').select('data').eq('game_id', gameId).single()
      const g = data?.data
      if (cancelled) return
      // Any non-bride game with a matching survey key can collect from guests.
      if (!g || g.edition === 'bride' || !g.surveyKey || g.surveyKey !== surveyKey) {
        setStatus('error'); return
      }
      setGame(g)
      setName(localStorage.getItem(guestNameKey(gameId)) || '')
      // Pull back only THIS guest's rows (question_id is prefixed with their id).
      const { data: rows } = await supabase.from('survey_responses').select('*').eq('game_id', gameId)
      if (cancelled) return
      const mine = (rows || [])
        .filter(r => String(r.question_id).startsWith(`${guestId.current}::`))
        .map(r => ({ id: String(r.question_id).split('::')[1] || `${Date.now()}`, text: r.prompt || '', image: r.image || null }))
      // Recover their saved name from any of their rows too.
      const savedName = (rows || []).find(r => String(r.question_id).startsWith(`${guestId.current}::`) && (r.answer || '').trim())?.answer
      if (savedName && !localStorage.getItem(guestNameKey(gameId))) setName(savedName)
      setPosts(mine.length ? mine : [blankPost()])
      const done = localStorage.getItem(guestDoneKey(gameId)) === '1' && mine.length > 0
      setStatus(done ? 'done' : 'form')
    })()
    return () => { cancelled = true }
  }, [gameId, surveyKey])

  function blankPost() {
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: '', image: null }
  }

  const contentPosts = posts.filter(p => (p.text || '').trim() || p.image)

  async function upsertRow(post, theName) {
    const base = {
      game_id: gameId,
      question_id: rowId(post.id),
      answer: theName ?? name,
      prompt: post.text || '',
      passed: false,
      updated_at: new Date().toISOString(),
    }
    const send = (withImage) => supabase.from('survey_responses').upsert(
      withImage ? { ...base, image: post.image || null } : base,
      { onConflict: 'game_id,question_id' }
    )
    let res = await send(imageColumnOk.current)
    // Older DBs (migration not run yet) reject the unknown `image` column —
    // remember that and retry text-only so the post still saves.
    if (res.error && /image/i.test(res.error.message || '')) {
      imageColumnOk.current = false
      if (post.image) setImageBlocked(true)
      res = await send(false)
    }
    setSaveState(res.error ? 'error' : 'saved')
    return res
  }
  function deleteRow(postId) {
    return supabase.from('survey_responses').delete().eq('game_id', gameId).eq('question_id', rowId(postId))
  }

  // ── Name ────────────────────────────────────────────────────────────────
  function onName(value) {
    setName(value)
    localStorage.setItem(guestNameKey(gameId), value)
    setSaveState('saving')
    clearTimeout(saveTimers.current._name)
    saveTimers.current._name = setTimeout(async () => {
      // Keep every already-saved post in sync with the (correct) name.
      const results = await Promise.all(contentPosts.map(p => upsertRow(p, value)))
      setSaveState(results.some(r => r.error) ? 'error' : 'saved')
    }, 700)
  }

  // ── Posts ───────────────────────────────────────────────────────────────
  function addPost() {
    setPosts(list => [...list, blankPost()])
  }

  function updatePostText(id, text) {
    const next = posts.map(p => (p.id === id ? { ...p, text } : p))
    setPosts(next)
    const post = next.find(p => p.id === id)
    setSaveState('saving')
    clearTimeout(saveTimers.current[id])
    saveTimers.current[id] = setTimeout(async () => {
      if ((post.text || '').trim() || post.image) await upsertRow(post) // sets saveState
      else { await deleteRow(id); setSaveState('saved') } // emptied out → drop the row
    }, 700)
  }

  async function updatePostImage(id, image) {
    const next = posts.map(p => (p.id === id ? { ...p, image } : p))
    setPosts(next)
    const post = next.find(p => p.id === id)
    if (image) setImageBlocked(false) // give the "needs setup" note a chance to clear
    setSaveState('saving')
    clearTimeout(saveTimers.current[id])
    if ((post.text || '').trim() || post.image) await upsertRow(post) // sets saveState
    else { await deleteRow(id); setSaveState('saved') }
  }

  async function removePost(id) {
    setPosts(list => (list.length > 1 ? list.filter(p => p.id !== id) : [blankPost()]))
    clearTimeout(saveTimers.current[id])
    await deleteRow(id)
  }

  const canSubmit = name.trim() && contentPosts.length > 0

  async function submit() {
    setSaveState('saving')
    // Flush everything with the final name, then clean up any emptied rows.
    const results = await Promise.all(contentPosts.map(p => upsertRow(p)))
    await Promise.all(posts.filter(p => !((p.text || '').trim() || p.image)).map(p => deleteRow(p.id)))
    if (results.some(r => r.error)) {
      // Something genuinely failed to save — keep them on the form to retry
      // rather than telling them they're done when they're not.
      setSaveState('error')
      return
    }
    setSaveState('saved')
    localStorage.setItem(guestDoneKey(gameId), '1')
    setStatus('done')
    window.scrollTo(0, 0)
  }

  // ── States ────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return <Page theme={theme}><div style={s.center}>Loading…</div></Page>
  }

  if (status === 'error') {
    return (
      <Page theme={theme}>
        <div style={{ ...s.card, textAlign: 'center' }}>
          <div style={{ fontSize: 46, marginBottom: 14 }}>🔒</div>
          <div style={s.h2}>This link isn't valid</div>
          <div style={s.muted}>It may be missing its key or was typed in wrong. Ask whoever set up the game to send you a fresh link.</div>
        </div>
      </Page>
    )
  }

  if (status === 'done') {
    return (
      <Page theme={theme}>
        <div style={{ ...s.card, textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🎉</div>
          <div style={s.h1}>You're in, {name.trim() || 'friend'}!</div>
          <div style={{ ...s.muted, marginBottom: 24 }}>Your {contentPosts.length === 1 ? 'post is' : `${contentPosts.length} posts are`} saved. The host will build them into the game — the rest of the group will try to guess which ones are yours. You can close this page or add more anytime. 🕵️</div>
          <button style={s.ghostBtn} onClick={() => { localStorage.removeItem(guestDoneKey(gameId)); setStatus('form') }}>Add or edit my posts</button>
        </div>
      </Page>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <Page theme={theme}>
      <div style={s.card}>
        <div style={s.eyebrow}>{game.title || "That's So Them"}</div>
        <div style={s.h1}>Dig up your own posts 🕵️</div>
        <div style={{ ...s.muted, marginBottom: 22 }}>
          Add a few of your own gems — an old status, a spicy hot take, a caption, a throwback screenshot. At the party, everyone will try to guess who posted each one. The more <em>so-you</em> it is, the better. Everything saves automatically.
        </div>

        <div style={{ marginBottom: 26 }}>
          <label style={s.qPrompt}>Your name</label>
          <input style={s.input} value={name} onChange={e => onName(e.target.value)} placeholder="e.g. Sarah" />
          <div style={{ ...s.muted, textAlign: 'left', marginTop: 6, fontSize: 12 }}>This is the answer your friends will be guessing — use the name they'd know you by.</div>
        </div>

        <div style={s.roundLabel}>Your Posts</div>
        {posts.map((p, i) => (
          <div key={p.id} style={s.addedCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: withAlpha(theme.textColor, 0.6) }}>Post {i + 1}</span>
              <button style={s.removeLink} onClick={() => removePost(p.id)}>Remove</button>
            </div>
            <textarea
              style={s.textarea}
              value={p.text}
              onChange={e => updatePostText(p.id, e.target.value)}
              placeholder="Type your post — a caption, quote, or hot take. (Optional if you upload a screenshot.)"
            />
            <div style={{ marginTop: 10 }}>
              <ImageUploadSlot
                label="SCREENSHOT (OPTIONAL)"
                hint="Add a screenshot of the actual post if you have one"
                value={p.image}
                onChange={v => updatePostImage(p.id, v)}
                accentColor={theme.secondaryColor}
                cropAspect={1}
              />
            </div>
          </div>
        ))}
        <button style={s.addBtn} onClick={addPost}>＋ Add another post</button>

        {imageBlocked && (
          <div style={s.warnNote}>Your text is saved, but screenshots aren't set up on this game yet — let the host know, or just share your post as text.</div>
        )}
        <div style={{ ...s.saveNote, ...(saveState === 'error' ? { color: '#e2725b' } : {}) }}>
          {saveState === 'saving' ? '● Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'error' ? '⚠ Couldn’t save — check your connection and try again' : ''}
        </div>
        <div style={{ ...s.muted, textAlign: 'center', marginBottom: 12 }}>
          {contentPosts.length} {contentPosts.length === 1 ? 'post' : 'posts'} ready
          {!name.trim() && ' · add your name to submit'}
        </div>
        <button
          style={{ ...s.submitBtn, opacity: !canSubmit ? 0.5 : 1 }}
          disabled={!canSubmit}
          onClick={submit}
        >
          Send to the host →
        </button>
        <div style={{ ...s.muted, textAlign: 'center', marginTop: 12, fontSize: 11 }}>
          You can come back to this link and add more anytime.
        </div>
      </div>
    </Page>
  )
}

function Page({ theme, children }) {
  return (
    <div style={{ minHeight: '100vh', background: theme.backgroundColor, position: 'relative', overflow: 'hidden' }}>
      {theme.backgroundImage && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${theme.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.5 }} />
      )}
      <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', fontFamily: theme.bodyFont, padding: '28px 16px 80px' }}>
        {children}
      </div>
    </div>
  )
}

function buildStyles(theme) {
  const { primaryColor: primary, secondaryColor: secondary, cardColor: card, textColor: text, headingFont, bodyFont } = theme
  return {
    card: { width: '100%', maxWidth: 460, position: 'relative', zIndex: 1, paddingTop: 20 },
    center: { color: withAlpha(text, 0.6), fontSize: 14, paddingTop: 80, textAlign: 'center', width: '100%' },
    eyebrow: { fontSize: 10, letterSpacing: 2, color: withAlpha(text, 0.5), textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' },
    h1: { fontSize: 30, fontWeight: 900, color: primary, fontFamily: headingFont, textAlign: 'center', marginBottom: 12, lineHeight: 1.15 },
    h2: { fontSize: 20, fontWeight: 800, color: text, fontFamily: headingFont, marginBottom: 10 },
    muted: { fontSize: 13, color: withAlpha(text, 0.6), lineHeight: 1.6, textAlign: 'center' },
    roundLabel: { fontSize: 11, letterSpacing: 3, color: secondary, fontWeight: 700, textTransform: 'uppercase', marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${withAlpha(secondary, 0.25)}` },
    qPrompt: { display: 'block', fontSize: 14, color: text, marginBottom: 8, lineHeight: 1.5, fontWeight: 600 },
    input: { width: '100%', background: card, border: `1px solid ${withAlpha(text, 0.15)}`, borderRadius: 6, color: text, padding: '13px 15px', fontSize: 15, fontFamily: bodyFont, boxSizing: 'border-box' },
    textarea: { width: '100%', minHeight: 70, background: card, border: `1px solid ${withAlpha(text, 0.15)}`, borderRadius: 6, color: text, padding: '13px 15px', fontSize: 15, fontFamily: bodyFont, boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 },
    addedCard: { border: `1px solid ${withAlpha(text, 0.12)}`, borderRadius: 8, padding: 14, marginBottom: 12, background: withAlpha(text, 0.03) },
    removeLink: { background: 'none', border: 'none', color: withAlpha(text, 0.45), fontSize: 12, cursor: 'pointer', fontFamily: bodyFont, textDecoration: 'underline', padding: 0 },
    addBtn: { width: '100%', padding: '12px', background: 'none', border: `1px dashed ${withAlpha(secondary, 0.5)}`, color: secondary, borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: bodyFont },
    saveNote: { textAlign: 'center', fontSize: 11, letterSpacing: 1, color: withAlpha(secondary, 0.9), minHeight: 16, marginTop: 18, marginBottom: 4 },
    warnNote: { fontSize: 12, lineHeight: 1.5, color: withAlpha(text, 0.75), background: withAlpha(secondary, 0.1), border: `1px solid ${withAlpha(secondary, 0.3)}`, borderRadius: 6, padding: '10px 12px', marginTop: 16 },
    submitBtn: { width: '100%', padding: '16px', background: primary, color: contrastColor(primary), border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 900, cursor: 'pointer', letterSpacing: 1, fontFamily: headingFont },
    ghostBtn: { background: 'none', border: `1px solid ${withAlpha(text, 0.3)}`, color: text, borderRadius: 6, padding: '11px 18px', cursor: 'pointer', fontSize: 13, fontFamily: bodyFont },
  }
}
