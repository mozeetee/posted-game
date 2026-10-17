// Original synthesized game-show audio via the Web Audio API — no copyrighted
// clips (and deliberately not the Jeopardy think tune). Everything is generated
// from oscillators so there are no asset files to ship or license.
//
// Kept quiet and in the background on purpose: a low master level, soft sound
// effects, and slow ambient music beds that differ by game phase and theme.
//
// Browsers block audio until a user gesture, so the TV shows a "Sound on"
// button that calls enableAudio() from a click before anything plays.

let ctx = null
let master = null
let enabled = false
let musicTimer = null
let musicKey = null

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.2          // quiet overall — background, not a blast
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return true
}

export function enableAudio() { if (ensure()) enabled = true }
export function disableAudio() { enabled = false; stopMusic() }
export function isAudioEnabled() { return enabled }

// A tone with a soft attack/decay envelope.
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

// Buzz-in: a short electric game-buzzer, softened — lower, gentler attack, and a
// milder tremolo so it reads as a buzzer without being loud or jarring.
export function playBuzz() {
  if (!enabled || !ensure()) return
  const t = ctx.currentTime
  const dur = 0.3
  const env = ctx.createGain()
  const rasp = ctx.createGain()
  env.connect(rasp); rasp.connect(master)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(0.36, t + 0.02)   // softer peak + slower attack
  env.gain.setValueAtTime(0.36, t + dur - 0.09)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  rasp.gain.value = 0.62
  const lfo = ctx.createOscillator()
  const lfoDepth = ctx.createGain()
  lfo.type = 'square'; lfo.frequency.value = 26
  lfoDepth.gain.value = 0.26                              // milder chop = less abrupt
  lfo.connect(lfoDepth); lfoDepth.connect(rasp.gain)
  lfo.start(t); lfo.stop(t + dur)
  ;[{ f: 150, type: 'sawtooth' }, { f: 153, type: 'square' }].forEach(o => {
    const osc = ctx.createOscillator()
    osc.type = o.type; osc.frequency.value = o.f
    osc.connect(env); osc.start(t); osc.stop(t + dur)
  })
}

// Daily Double reveal: a bright rising sparkle — distinct from the buzzer.
export function playDailyDouble() {
  if (!enabled || !ensure()) return
  const t = ctx.currentTime
  ;[523.3, 659.3, 784.0, 1046.5].forEach((f, i) => blip(f, f, t + i * 0.1, 0.5, 'triangle', 0.14))
  blip(1318.5, 1318.5, t + 0.44, 0.6, 'sine', 0.1)
}

// Correct: a bright two-note ping. Wrong / miss: a short low "womp".
export function playDing() {
  if (!enabled || !ensure()) return
  const t = ctx.currentTime
  blip(660, 660, t, 0.14, 'triangle', 0.22)
  blip(990, 990, t + 0.11, 0.22, 'triangle', 0.2)
}
export function playWomp() {
  if (!enabled || !ensure()) return
  const t = ctx.currentTime
  blip(200, 120, t, 0.3, 'sawtooth', 0.16)
}

// Ambient music beds — slow, low, and quiet. `pick` plays while choosing from
// the board; `clue` plays once a prompt is on screen (tenser); `think` is Final.
// 'spooky' swaps in low, minor, eerie tones for themed packs (e.g. Halloween).
const BEDS = {
  default: {
    pick:  { notes: [196.0, 261.6, 220.0, 293.7],        step: 1.0,  type: 'sine',     dur: 1.9, peak: 0.05 },
    clue:  { notes: [293.7, 349.2, 329.6, 392.0],        step: 0.8,  type: 'triangle', dur: 1.5, peak: 0.055 },
    think: { notes: [220.0, 261.6, 329.6, 246.9, 196.0], step: 0.5,  type: 'sine',     dur: 1.0, peak: 0.06 },
  },
  spooky: {
    pick:  { notes: [130.8, 155.6, 138.6, 146.8],        step: 1.15, type: 'sine',     dur: 2.2, peak: 0.055 },
    clue:  { notes: [146.8, 174.6, 155.6, 207.7],        step: 0.8,  type: 'triangle', dur: 1.6, peak: 0.06 },
    think: { notes: [130.8, 155.6, 174.6, 146.8, 123.5], step: 0.55, type: 'sine',     dur: 1.2, peak: 0.065 },
  },
}
export function startMusic(mode = 'pick', theme = 'default') {
  if (!enabled || !ensure()) return
  const key = `${theme}:${mode}`
  if (musicKey === key && musicTimer) return
  stopMusic()
  musicKey = key
  const bed = (BEDS[theme] || BEDS.default)[mode] || BEDS.default.pick
  let i = 0
  const tick = () => {
    const t = ctx.currentTime + 0.02
    const f = bed.notes[i % bed.notes.length]
    blip(f, f, t, bed.dur, bed.type, bed.peak)
    i++
  }
  tick()
  musicTimer = setInterval(tick, bed.step * 1000)
}
export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null }
  musicKey = null
}
