// Original synthesized game-show sound effects via the Web Audio API — no
// copyrighted clips and no asset files; everything is generated from oscillators.
//
// Just three short one-shot cues, no background music: the buzz-in, the Daily
// Double reveal, and a transition swell when the host shows a clue to the room.
//
// Browsers block audio until a user gesture, so the host controller has a
// "Sound on" button that calls enableAudio() from a click before anything plays.

let ctx = null
let master = null
let enabled = false
let lifecycleInstalled = false

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.2          // quiet overall — present, not a blast
    master.connect(ctx.destination)
    installLifecycle()
  }
  // Only wake the context back up when sound is actually meant to be on, so a
  // stray call can't un-mute audio the user (or a hidden tab) just silenced.
  if (ctx.state === 'suspended' && enabled) ctx.resume()
  return true
}

// Cut all audio the instant the page is backgrounded or going away, so nothing
// can keep ringing in a tab that's hidden or closing.
function installLifecycle() {
  if (lifecycleInstalled || typeof document === 'undefined') return
  lifecycleInstalled = true
  const silence = () => { if (ctx && ctx.state === 'running') ctx.suspend() }
  document.addEventListener('visibilitychange', () => { if (document.hidden) silence() })
  window.addEventListener('pagehide', silence)
}

export function enableAudio() { if (ensure()) { enabled = true; if (ctx.state === 'suspended') ctx.resume() } }
// Turning sound off stops everything immediately — suspend the whole context,
// which cuts any cue still ringing.
export function disableAudio() {
  enabled = false
  if (ctx && ctx.state === 'running') ctx.suspend()
}
export function isAudioEnabled() { return enabled }

// A tone with a soft attack/decay envelope, optionally gliding in pitch.
function blip(freqFrom, freqTo, start, dur, type = 'sine', peak = 0.3) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freqFrom, start)
  if (freqTo !== freqFrom) o.frequency.exponentialRampToValueAtTime(freqTo, start + dur)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(peak, start + 0.03)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(g); g.connect(master)
  o.start(start); o.stop(start + dur + 0.02)
}

// Buzz-in: an electric game-buzzer — clearly audible, but with a gentler attack
// and milder tremolo than a harsh raw buzzer so it's present without being jarring.
export function playBuzz() {
  if (!enabled || !ensure()) return
  const t = ctx.currentTime
  const dur = 0.42
  const env = ctx.createGain()
  const rasp = ctx.createGain()
  env.connect(rasp); rasp.connect(master)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(0.62, t + 0.02)   // soft-ish attack, full level
  env.gain.setValueAtTime(0.62, t + dur - 0.1)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  rasp.gain.value = 0.72
  const lfo = ctx.createOscillator()
  const lfoDepth = ctx.createGain()
  lfo.type = 'square'; lfo.frequency.value = 24
  lfoDepth.gain.value = 0.3                               // mild chop = buzzer, not jarring
  lfo.connect(lfoDepth); lfoDepth.connect(rasp.gain)
  lfo.start(t); lfo.stop(t + dur)
  ;[{ f: 150, type: 'sawtooth' }, { f: 153, type: 'square' }].forEach(o => {
    const osc = ctx.createOscillator()
    osc.type = o.type; osc.frequency.value = o.f
    osc.connect(env); osc.start(t); osc.stop(t + dur)
  })
}

// Daily Double reveal ("double jeopardy"): a bright rising sparkle.
export function playDailyDouble() {
  if (!enabled || !ensure()) return
  const t = ctx.currentTime
  ;[523.3, 659.3, 784.0, 1046.5].forEach((f, i) => blip(f, f, t + i * 0.1, 0.5, 'triangle', 0.2))
  blip(1318.5, 1318.5, t + 0.44, 0.6, 'sine', 0.16)
}

// Transition: a quick upward swell when the host shows a clue to the room —
// a smooth glide, distinct from the buzzer and the Daily Double sparkle.
export function playTransition() {
  if (!enabled || !ensure()) return
  const t = ctx.currentTime
  blip(220, 660, t, 0.36, 'sine', 0.18)
  blip(330, 988, t + 0.05, 0.3, 'triangle', 0.12)
}
