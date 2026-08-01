import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getTheme, ensureGoogleFont, withAlpha, contrastColor } from './theme'

// The bride's private survey page (role=bride). She opens the host's link,
// fills in her real answers to the trivia prompts, and submits. Answers
// autosave to `survey_responses`; Submit flips `survey_meta.submitted`. She
// never sees the decoy choices — the host adds those afterward.
//
// She can also PASS on any question (skip it) and SUGGEST HER OWN questions
// (stored with a `prompt`), which the host can then fold into the game.
export default function BrideSurvey({ gameId, surveyKey = '' }) {
  const [status, setStatus] = useState('loading') // loading | error | form | done
  const [game, setGame] = useState(null)
  const [answers, setAnswers] = useState({})       // { [questionId]: answer }
  const [passed, setPassed] = useState({})         // { [questionId]: true }
  const [added, setAdded] = useState([])           // [{ id, prompt, answer }]
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
      // select('*') so a project that hasn't added the prompt/passed columns yet
      // still loads (those fields just come back undefined).
      const [resp, meta] = await Promise.all([
        supabase.from('survey_responses').select('*').eq('game_id', gameId),
        supabase.from('survey_meta').select('submitted').eq('game_id', gameId).maybeSingle(),
      ])
      if (cancelled) return
      const ans = {}, pas = {}, add = []
      ;(resp.data || []).forEach(r => {
        if (r.prompt && r.prompt.trim()) add.push({ id: r.question_id, prompt: r.prompt, answer: r.answer || '' })
        else { ans[r.question_id] = r.answer || ''; if (r.passed) pas[r.question_id] = true }
      })
      setAnswers(ans); setPassed(pas); setAdded(add)
      setStatus(meta.data?.submitted ? 'done' : 'form')
    })()
    return () => { cancelled = true }
  }, [gameId, surveyKey])

  function upsertRow(row) {
    return supabase.from('survey_responses').upsert(
      { game_id: gameId, updated_at: new Date().toISOString(), ...row },
      { onConflict: 'game_id,question_id' }
    )
  }

  // Debounced per-question autosave (mirrors the host editor's autosave).
  function onAnswer(qid, value) {
    setAnswers(a => ({ ...a, [qid]: value }))
    if (passed[qid]) setPassed(p => ({ ...p, [qid]: false }))
    setSaveState('saving')
    clearTimeout(saveTimers.current[qid])
    saveTimers.current[qid] = setTimeout(async () => {
      await upsertRow({ question_id: String(qid), answer: value, passed: false, prompt: null })
      setSaveState('saved')
    }, 700)
  }

  // Toggle "pass / skip" on a question. Saves right away (no debounce).
  async function togglePass(qid) {
    const next = !passed[qid]
    setPassed(p => ({ ...p, [qid]: next }))
    if (next) setAnswers(a => ({ ...a, [qid]: '' }))
    setSaveState('saving')
    clearTimeout(saveTimers.current[qid])
    await upsertRow({ question_id: String(qid), answer: next ? '' : (answers[qid] || ''), passed: next, prompt: null })
    setSaveState('saved')
  }

  // ── Bride's own suggested questions ────────────────────────────────────────
  function addOwnQuestion() {
    const id = `bride-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setAdded(list => [...list, { id, prompt: '', answer: '' }])
  }

  function updateAdded(id, field, value) {
    const row = { ...(added.find(a => a.id === id) || { id, prompt: '', answer: '' }), [field]: value }
    setAdded(list => list.map(a => (a.id === id ? row : a)))
    setSaveState('saving')
    clearTimeout(saveTimers.current[id])
    saveTimers.current[id] = setTimeout(async () => {
      // Only persist once she's actually written a question.
      if (!row.prompt.trim()) { setSaveState('saved'); return }
      await upsertRow({ question_id: id, prompt: row.prompt, answer: row.answer || '', passed: false })
      setSaveState('saved')
    }, 700)
  }

  async function removeAdded(id) {
    setAdded(list => list.filter(a => a.id !== id))
    clearTimeout(saveTimers.current[id])
    await supabase.from('survey_responses').delete().eq('game_id', gameId).eq('question_id', id)
  }

  const questions = game?.questions || []
  const answeredCount = questions.filter(q => !passed[String(q.id)] && (answers[String(q.id)] || '').trim()).length
  const passedCount = questions.filter(q => passed[String(q.id)]).length
  const addedValid = added.filter(a => a.prompt.trim())
  const canSubmit = answeredCount > 0 || passedCount > 0 || addedValid.length > 0

  async function submitSurvey() {
    setSubmitting(true)
    // Flush everything (in case a debounce is still pending), then mark submitted.
    const preRows = questions.map(q => {
      const qid = String(q.id)
      const isPassed = !!passed[qid]
      return { game_id: gameId, question_id: qid, answer: isPassed ? '' : (answers[qid] || ''), passed: isPassed, prompt: null, updated_at: new Date().toISOString() }
    })
    const addedRows = addedValid.map(a => ({ game_id: gameId, question_id: a.id, prompt: a.prompt, answer: a.answer || '', passed: false, updated_at: new Date().toISOString() }))
    await supabase.from('survey_responses').upsert([...preRows, ...addedRows], { onConflict: 'game_id,question_id' })
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
          Fill in your real answers below — your friends will try to guess them at the party. No wrong answers here! Everything saves automatically as you type. Not into a question? Just tap <strong>Pass</strong>.
        </div>

        {rounds.map((round, ri) => (
          <div key={ri} style={{ marginBottom: 26 }}>
            {round.name && <div style={s.roundLabel}>{round.name}</div>}
            {round.items.map(q => {
              const qid = String(q.id)
              const isPassed = !!passed[qid]
              return (
                <div key={qid} style={s.qBlock}>
                  <label style={s.qPrompt}>{q.post}</label>
                  {isPassed ? (
                    <div style={s.passedBox}>
                      <span>⤼ Skipped — the host will fill this in or drop it</span>
                      <button style={s.undoBtn} onClick={() => togglePass(qid)}>Undo</button>
                    </div>
                  ) : (
                    <>
                      <input
                        style={s.input}
                        value={answers[qid] || ''}
                        onChange={e => onAnswer(qid, e.target.value)}
                        placeholder="Your answer…"
                      />
                      <button style={s.passLink} onClick={() => togglePass(qid)}>Pass on this one</button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {/* Bride's own questions */}
        <div style={{ marginBottom: 26 }}>
          <div style={s.roundLabel}>Your Own Questions <span style={{ color: withAlpha(theme.textColor, 0.5), fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
          <div style={{ ...s.muted, textAlign: 'left', marginBottom: 14 }}>
            Have a question you'd love the group to guess? Add it here. Include the answer so it can be scored.
          </div>
          {added.map(a => (
            <div key={a.id} style={s.addedCard}>
              <input style={s.input} value={a.prompt} onChange={e => updateAdded(a.id, 'prompt', e.target.value)} placeholder="Your question, e.g. What's my hidden talent?" />
              <input style={{ ...s.input, marginTop: 10 }} value={a.answer} onChange={e => updateAdded(a.id, 'answer', e.target.value)} placeholder="The answer (optional)" />
              <button style={s.removeLink} onClick={() => removeAdded(a.id)}>Remove</button>
            </div>
          ))}
          <button style={s.addBtn} onClick={addOwnQuestion}>＋ Add a question</button>
        </div>

        <div style={s.saveNote}>
          {saveState === 'saving' ? '● Saving…' : saveState === 'saved' ? '✓ Saved' : ''}
        </div>
        <div style={{ ...s.muted, textAlign: 'center', marginBottom: 12 }}>
          {answeredCount} of {questions.length} answered
          {passedCount > 0 && ` · ${passedCount} passed`}
          {addedValid.length > 0 && ` · ${addedValid.length} of your own`}
        </div>
        <button
          style={{ ...s.submitBtn, opacity: !canSubmit || submitting ? 0.5 : 1 }}
          disabled={!canSubmit || submitting}
          onClick={submitSurvey}
        >
          {submitting ? 'Submitting…' : 'Submit my answers →'}
        </button>
        {answeredCount + passedCount < questions.length && (
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
    passLink: { marginTop: 8, background: 'none', border: 'none', color: withAlpha(text, 0.5), fontSize: 12, cursor: 'pointer', fontFamily: bodyFont, textDecoration: 'underline', padding: 0 },
    passedBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderRadius: 6, background: withAlpha(text, 0.05), border: `1px dashed ${withAlpha(text, 0.22)}`, color: withAlpha(text, 0.6), fontSize: 12.5, lineHeight: 1.4 },
    undoBtn: { background: 'none', border: 'none', color: secondary, fontSize: 12, cursor: 'pointer', fontFamily: bodyFont, textDecoration: 'underline', whiteSpace: 'nowrap', flexShrink: 0 },
    addedCard: { border: `1px solid ${withAlpha(text, 0.12)}`, borderRadius: 8, padding: 14, marginBottom: 12, background: withAlpha(text, 0.03) },
    removeLink: { background: 'none', border: 'none', color: withAlpha(text, 0.45), fontSize: 12, cursor: 'pointer', fontFamily: bodyFont, textDecoration: 'underline', padding: 0, marginTop: 10 },
    addBtn: { width: '100%', padding: '12px', background: 'none', border: `1px dashed ${withAlpha(secondary, 0.5)}`, color: secondary, borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: bodyFont },
    saveNote: { textAlign: 'center', fontSize: 11, letterSpacing: 1, color: withAlpha(secondary, 0.9), height: 16, marginBottom: 4 },
    submitBtn: { width: '100%', padding: '16px', background: primary, color: contrastColor(primary), border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 900, cursor: 'pointer', letterSpacing: 1, fontFamily: headingFont },
    ghostBtn: { background: 'none', border: `1px solid ${withAlpha(text, 0.3)}`, color: text, borderRadius: 6, padding: '11px 18px', cursor: 'pointer', fontSize: 13, fontFamily: bodyFont },
  }
}
