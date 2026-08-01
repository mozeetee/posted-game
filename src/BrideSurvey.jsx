import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getTheme, ensureGoogleFont, withAlpha, contrastColor } from './theme'

// The bride's private survey page (role=bride). She opens the host's link,
// fills in her real answers to the trivia prompts, and submits. Answers
// autosave to `survey_responses`; Submit flips `survey_meta.submitted`. She
// never sees the decoy choices — the host adds those afterward.
export default function BrideSurvey({ gameId, surveyKey = '' }) {
  const [status, setStatus] = useState('loading') // loading | error | form | done
  const [game, setGame] = useState(null)
  const [answers, setAnswers] = useState({})       // { [questionId]: answer }
  const [saveState, setSaveState] = useState('')    // '', 'saving', 'saved'
  const [submitting, setSubmitting] = useState(false)
  const saveTimers = useRef({})

  const theme = getTheme(game)
  const s = buildStyles(theme)

  useEffect(() => {
    ensureGoogleFont(theme.headingFont)
    ensureGoogleFont(theme.bodyFont)
  }, [theme.headingFont, theme.bodyFont])

  // Load the game, verify the survey key, and prefill any saved answers.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('games').select('data').eq('game_id', gameId).single()
      const g = data?.data
      if (cancelled) return
      if (!g || g.edition !== 'bride' || !g.surveyKey || g.surveyKey !== surveyKey) {
        setStatus('error'); return
      }
      setGame(g)
      const [resp, meta] = await Promise.all([
        supabase.from('survey_responses').select('question_id, answer').eq('game_id', gameId),
        supabase.from('survey_meta').select('submitted').eq('game_id', gameId).maybeSingle(),
      ])
      if (cancelled) return
      if (resp.data) setAnswers(Object.fromEntries(resp.data.map(r => [r.question_id, r.answer || ''])))
      setStatus(meta.data?.submitted ? 'done' : 'form')
    })()
    return () => { cancelled = true }
  }, [gameId, surveyKey])

  // Debounced per-question autosave (mirrors the host editor's autosave).
  function onAnswer(qid, value) {
    setAnswers(a => ({ ...a, [qid]: value }))
    setSaveState('saving')
    clearTimeout(saveTimers.current[qid])
    saveTimers.current[qid] = setTimeout(async () => {
      await supabase.from('survey_responses').upsert(
        { game_id: gameId, question_id: String(qid), answer: value, updated_at: new Date().toISOString() },
        { onConflict: 'game_id,question_id' }
      )
      setSaveState('saved')
    }, 700)
  }

  const questions = game?.questions || []
  const answeredCount = questions.filter(q => (answers[String(q.id)] || '').trim()).length

  async function submitSurvey() {
    setSubmitting(true)
    // Flush every answer (in case a debounce is still pending), then mark submitted.
    const rows = questions.map(q => ({
      game_id: gameId, question_id: String(q.id), answer: answers[String(q.id)] || '', updated_at: new Date().toISOString(),
    }))
    await supabase.from('survey_responses').upsert(rows, { onConflict: 'game_id,question_id' })
    await supabase.from('survey_meta').upsert(
      { game_id: gameId, submitted: true, updated_at: new Date().toISOString() },
      { onConflict: 'game_id' }
    )
    setSubmitting(false)
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
          <div style={s.muted}>It may be missing its key or was typed in wrong. Ask whoever set up the game to send you a fresh survey link.</div>
        </div>
      </Page>
    )
  }

  if (status === 'done') {
    return (
      <Page theme={theme}>
        <div style={{ ...s.card, textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>💍</div>
          <div style={s.h1}>All done!</div>
          <div style={{ ...s.muted, marginBottom: 24 }}>Your answers are saved. The host has been notified and will build the game from here. You can close this page — or give your host a heads up that you're finished. 🎉</div>
          <button style={s.ghostBtn} onClick={() => setStatus('form')}>Review or edit my answers</button>
        </div>
      </Page>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  // Group questions by round while preserving order.
  const rounds = []
  questions.forEach(q => {
    const name = q.round || ''
    let bucket = rounds.find(r => r.name === name)
    if (!bucket) { bucket = { name, items: [] }; rounds.push(bucket) }
    bucket.items.push(q)
  })

  return (
    <Page theme={theme}>
      <div style={s.card}>
        <div style={s.eyebrow}>{game.title || "That's So Them"} · Bride Survey</div>
        <div style={s.h1}>Tell us about you 💌</div>
        <div style={{ ...s.muted, marginBottom: 22 }}>
          Fill in your real answers below — your friends will try to guess them at the party. No wrong answers here! Everything saves automatically as you type.
        </div>

        {rounds.map((round, ri) => (
          <div key={ri} style={{ marginBottom: 26 }}>
            {round.name && <div style={s.roundLabel}>{round.name}</div>}
            {round.items.map(q => {
              const qid = String(q.id)
              return (
                <div key={qid} style={s.qBlock}>
                  <label style={s.qPrompt}>{q.post}</label>
                  <input
                    style={s.input}
                    value={answers[qid] || ''}
                    onChange={e => onAnswer(qid, e.target.value)}
                    placeholder="Your answer…"
                  />
                </div>
              )
            })}
          </div>
        ))}

        <div style={s.saveNote}>
          {saveState === 'saving' ? '● Saving…' : saveState === 'saved' ? '✓ Saved' : ''}
        </div>
        <div style={{ ...s.muted, textAlign: 'center', marginBottom: 12 }}>
          {answeredCount} of {questions.length} answered
        </div>
        <button
          style={{ ...s.submitBtn, opacity: answeredCount === 0 || submitting ? 0.5 : 1 }}
          disabled={answeredCount === 0 || submitting}
          onClick={submitSurvey}
        >
          {submitting ? 'Submitting…' : 'Submit my answers →'}
        </button>
        {answeredCount < questions.length && (
          <div style={{ ...s.muted, textAlign: 'center', marginTop: 12, fontSize: 11 }}>
            You can submit with a few blank — the host can fill in or drop those.
          </div>
        )}
      </div>
    </Page>
  )
}

function Page({ theme, children }) {
  return (
    <div style={{ minHeight: '100vh', background: theme.backgroundColor, position: 'relative', overflow: 'hidden' }}>
      {theme.backgroundImage && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${theme.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.35 }} />
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
    qBlock: { marginBottom: 18 },
    qPrompt: { display: 'block', fontSize: 14, color: text, marginBottom: 8, lineHeight: 1.5, fontWeight: 600 },
    input: { width: '100%', background: card, border: `1px solid ${withAlpha(text, 0.15)}`, borderRadius: 6, color: text, padding: '13px 15px', fontSize: 15, fontFamily: bodyFont, boxSizing: 'border-box' },
    saveNote: { textAlign: 'center', fontSize: 11, letterSpacing: 1, color: withAlpha(secondary, 0.9), height: 16, marginBottom: 4 },
    submitBtn: { width: '100%', padding: '16px', background: primary, color: contrastColor(primary), border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 900, cursor: 'pointer', letterSpacing: 1, fontFamily: headingFont },
    ghostBtn: { background: 'none', border: `1px solid ${withAlpha(text, 0.3)}`, color: text, borderRadius: 6, padding: '11px 18px', cursor: 'pointer', fontSize: 13, fontFamily: bodyFont },
  }
}
