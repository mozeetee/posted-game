import { useState } from 'react'
import { injectBuzzerCss } from './bzShared'
import { BZ } from './board'

// The manual join path for guests who can't scan the TV's QR code: they go to
// <domain>/play, type the short game code shown on the TV, and land on their
// phone's buzzer (the player link). Keeps "type a short code" quick at a party.
export default function BuzzerJoin({ initialCode = '' }) {
  injectBuzzerCss()
  const [code, setCode] = useState(initialCode)
  const go = () => {
    const c = code.trim().toUpperCase()
    if (!c) return
    window.location.href = `${location.origin}/?game=${encodeURIComponent(c)}&type=buzzer`
  }
  return (
    <div className="bz" style={{ minHeight: '100vh', background: BZ.paper, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="bz-fd" style={{ color: BZ.plum, fontWeight: 600, fontSize: 32 }}>Join the game</div>
        <div style={{ color: BZ.muted, fontWeight: 700, fontSize: 16 }}>Enter the code shown on the TV</div>
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') go() }}
          placeholder="ABC123"
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="bz-fd"
          style={{ textAlign: 'center', fontSize: 34, fontWeight: 700, letterSpacing: '.18em',
            padding: '16px 14px', borderRadius: 16, border: `2px solid ${BZ.line}`, color: BZ.ink,
            background: '#fff', outlineColor: BZ.plum, fontFamily: 'inherit', textTransform: 'uppercase' }}
        />
        <button onClick={go}
          style={{ border: 0, borderRadius: 16, padding: '16px 20px', fontWeight: 800, fontSize: 18,
            color: '#fff', background: BZ.plum, cursor: 'pointer', fontFamily: 'inherit' }}>
          Join →
        </button>
      </div>
    </div>
  )
}
