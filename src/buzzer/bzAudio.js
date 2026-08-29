// Original synthesized game-show audio via the Web Audio API — no copyrighted
// clips (and deliberately not the Jeopardy think tune). Everything is generated
// from oscillators so there are no asset files to ship or license.
//
// Browsers block audio until a user gesture, so the TV shows a "Sound on"
// button that calls enableAudio() from a click before anything plays.

let ctx = null
let master = null
let enabled = false
let musicTimer = null
let musicMode = null

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.45
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return true
}

export function enableAudio() { if (ensure()) enabled = true }
export function disableAudio() { enabled = false; stopMusic() }
export function isAudioEnabled() { return enabled }

// A tone with a quick attack/decay envelope.
function blip(freqFrom, freqTo, start, dur, type = 'sine', peak = 0.3) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freqFrom, start)
  if (freqTo !== freqFrom) o.frequency.exponentialRampToValueAtTime(freqTo, start + dur)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(peak, start + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(g); g.connect(master)
  o.start(start); o.stop(start + dur + 0.02)
}

// Buzz-in: a harsh electric game-buzzer "BZZZT" — a low, detuned sawtooth/square
// tone run through a fast square-wave tremolo for that raspy lockout-buzzer bite.
export function playBuzz() {
  if (!enabled || !ensure()) return
  const t = ctx.currentTime
  const dur = 0.42
  const env = ctx.createGain()   // overall attack/hold/release
  const rasp = ctx.createGain()  // tremolo makes it "buzz" rather than hum
  env.connect(rasp); rasp.connect(master)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(0.6, t + 0.006)
  env.gain.setValueAtTime(0.6, t + dur - 0.05)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  // Tremolo LFO chops the tone on/off ~34x a second → the classic buzzer rasp.
  rasp.gain.value = 0.55
  const lfo = ctx.createOscillator()
  const lfoDepth = ctx.createGain()
  lfo.type = 'square'; lfo.frequency.value = 34
  lfoDepth.gain.value = 0.45
  lfo.connect(lfoDepth); lfoDepth.connect(rasp.gain)
  lfo.start(t); lfo.stop(t + dur)
  // Two slightly detuned low, rich oscillators = a fat, angry buzzer tone.
  ;[{ f: 138, type: 'sawtooth' }, { f: 142, type: 'square' }].forEach(o => {
    const osc = ctx.createOscillator()
    osc.type = o.type; osc.frequency.value = o.f
    osc.connect(env); osc.start(t); osc.stop(t + dur)
  })
}

// Correct answer: a bright two-note ping.
export function playDing() {
  if (!enabled || !ensure()) return
  const t = ctx.currentTime
  blip(660, 660, t, 0.14, 'triangle', 0.3)
  blip(990, 990, t + 0.11, 0.22, 'triangle', 0.28)
}

// Wrong / miss: a short low "womp".
export function playWomp() {
  if (!enabled || !ensure()) return
  const t = ctx.currentTime
  blip(200, 120, t, 0.28, 'sawtooth', 0.22)
}

// Looping bed. 'bed' = gentle major arpeggio for the board; 'think' = slower,
// tenser minor pattern for Final. Notes are scheduled a bar at a time.
const BEDS = {
  bed:   { notes: [261.6, 329.6, 392.0, 523.3, 392.0, 329.6], step: 0.34, type: 'triangle', peak: 0.06, dur: 0.5 },
  think: { notes: [220.0, 261.6, 329.6, 261.6, 246.9, 196.0], step: 0.46, type: 'sine',     peak: 0.08, dur: 0.7 },
}
export function startMusic(mode = 'bed') {
  if (!enabled || !ensure()) return
  if (musicMode === mode && musicTimer) return
  stopMusic()
  musicMode = mode
  const bed = BEDS[mode] || BEDS.bed
  let i = 0
  const tick = () => {
    const t = ctx.currentTime + 0.02
    blip(bed.notes[i % bed.notes.length], bed.notes[i % bed.notes.length], t, bed.dur, bed.type, bed.peak)
    i++
  }
  tick()
  musicTimer = setInterval(tick, bed.step * 1000)
}
export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null }
  musicMode = null
}
