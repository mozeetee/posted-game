// Hand-drawn "field creature" avatars. Players pick one when they join; it
// follows them onto the lobby, the round scoreboards, the results screen, the
// host's live view, and the big screen. Line-art in a soft tinted circle —
// friendly, gender-neutral, and on-theme with the boutique "Field Notes" look.
// The cast + colours were designed with Moriah from her own sketches.

export const AVATARS = [
  { id: 'bear',  name: 'Bear',  tint: '#e7d3ba', ink: '#8a5a34' },
  { id: 'bunny', name: 'Bunny', tint: '#e5d9e6', ink: '#7f6488' },
  { id: 'cat',   name: 'Cat',   tint: '#f1dccb', ink: '#bd6b4c' },
  { id: 'dog',   name: 'Dog',   tint: '#ecdcbf', ink: '#a07a3e' },
  { id: 'pig',   name: 'Pig',   tint: '#f2d9d4', ink: '#c1786c' },
  { id: 'cow',   name: 'Cow',   tint: '#dbe2e2', ink: '#5d6b70' },
  { id: 'frog',  name: 'Frog',  tint: '#d8e4cd', ink: '#5f8a4e' },
  { id: 'bee',   name: 'Bee',   tint: '#f3e6b8', ink: '#bf922f' },
  { id: 'owl',   name: 'Owl',   tint: '#d2e0dc', ink: '#4f7d73' },
]

// Each avatar is the inner markup of a 48×48 SVG: strokes inherit `currentColor`
// (the ink), fills are explicit `currentColor`. Rendered via the shared <g>
// below, which sets the single line weight + rounded caps.
const PATHS = {
  bear: '<circle cx="14" cy="15" r="5"/><circle cx="34" cy="15" r="5"/><circle cx="24" cy="26" r="13"/><circle cx="19" cy="24" r="1.6" fill="currentColor" stroke="none"/><circle cx="29" cy="24" r="1.6" fill="currentColor" stroke="none"/><ellipse cx="24" cy="29" rx="2.6" ry="2" fill="currentColor" stroke="none"/><path d="M24 31 q-3 3 -5 1 M24 31 q3 3 5 1"/>',
  bunny: '<path d="M18 20 C15 10 17 5 19 5 C22 5 22 14 21 21 M30 20 C33 10 31 5 29 5 C26 5 26 14 27 21"/><ellipse cx="24" cy="29" rx="11" ry="10"/><circle cx="20" cy="28" r="1.5" fill="currentColor" stroke="none"/><circle cx="28" cy="28" r="1.5" fill="currentColor" stroke="none"/><path d="M24 31 v2 M22 33 q2 2 4 0"/>',
  cat: '<path d="M15 15 L12 5 L21 12"/><path d="M33 15 L36 5 L27 12"/><circle cx="24" cy="26" r="12.5"/><circle cx="19.5" cy="24" r="1.6" fill="currentColor" stroke="none"/><circle cx="28.5" cy="24" r="1.6" fill="currentColor" stroke="none"/><path d="M22.5 28 L25.5 28 L24 30.2 Z" fill="currentColor" stroke="none"/><path d="M24 30 q-2 2 -4 1 M24 30 q2 2 4 1"/><path d="M19 28 h-11 M19 31 h-11 M29 28 h11 M29 31 h11"/>',
  dog: '<path d="M16 16 C9 15 7 25 10 31 C12 29 14 22 17 19"/><path d="M32 16 C39 15 41 25 38 31 C36 29 34 22 31 19"/><path d="M17 18 C17 12 20 10 24 10 C28 10 31 12 31 18 C33 21 33 27 31 31 C29 36 27 38 24 38 C21 38 19 36 17 31 C15 27 15 21 17 18 Z"/><circle cx="20" cy="22" r="1.6" fill="currentColor" stroke="none"/><circle cx="28" cy="22" r="1.6" fill="currentColor" stroke="none"/><ellipse cx="24" cy="29" rx="2.7" ry="2" fill="currentColor" stroke="none"/><path d="M24 31 v1.6 M24 32.6 q-3 2 -5 0.2 M24 32.6 q3 2 5 0.2"/>',
  pig: '<path d="M15 15 C11 8 13 7 16 9 C18 10 18 14 18 16"/><path d="M33 15 C37 8 35 7 32 9 C30 10 30 14 30 16"/><circle cx="24" cy="25" r="13"/><circle cx="19" cy="22" r="1.6" fill="currentColor" stroke="none"/><circle cx="29" cy="22" r="1.6" fill="currentColor" stroke="none"/><ellipse cx="24" cy="30" rx="6.5" ry="5"/><ellipse cx="21.5" cy="30" rx="1" ry="1.6" fill="currentColor" stroke="none"/><ellipse cx="26.5" cy="30" rx="1" ry="1.6" fill="currentColor" stroke="none"/>',
  cow: '<path d="M16 12 C13 8 11 9 12 11"/><path d="M32 12 C35 8 37 9 36 11"/><ellipse cx="11" cy="18" rx="4.5" ry="3" transform="rotate(-20 11 18)"/><ellipse cx="37" cy="18" rx="4.5" ry="3" transform="rotate(20 37 18)"/><ellipse cx="24" cy="24" rx="13" ry="12"/><path d="M21 13 l1 -3 l1 3 l1 -3 l1 3"/><circle cx="19" cy="22" r="1.6" fill="currentColor" stroke="none"/><circle cx="29" cy="22" r="1.6" fill="currentColor" stroke="none"/><ellipse cx="24" cy="31" rx="8.5" ry="6"/><ellipse cx="21" cy="31" rx="1" ry="1.5" fill="currentColor" stroke="none"/><ellipse cx="27" cy="31" rx="1" ry="1.5" fill="currentColor" stroke="none"/>',
  frog: '<path d="M8 25 C8 18 15 19 24 19 C33 19 40 18 40 25 C40 34 33 39 24 39 C15 39 8 34 8 25 Z"/><circle cx="15" cy="15" r="5.5"/><circle cx="33" cy="15" r="5.5"/><circle cx="15" cy="15" r="1.7" fill="currentColor" stroke="none"/><circle cx="33" cy="15" r="1.7" fill="currentColor" stroke="none"/><path d="M13 27 Q24 37 35 27"/><circle cx="21" cy="24" r="1" fill="currentColor" stroke="none"/><circle cx="27" cy="24" r="1" fill="currentColor" stroke="none"/>',
  bee: '<path d="M18 9 C16 4 14 4 13 6"/><path d="M30 9 C32 4 34 4 35 6"/><ellipse cx="17" cy="13" rx="5.5" ry="4.5" transform="rotate(-25 17 13)"/><ellipse cx="31" cy="13" rx="5.5" ry="4.5" transform="rotate(25 31 13)"/><ellipse cx="24" cy="28" rx="11" ry="11"/><circle cx="20" cy="25" r="1.5" fill="currentColor" stroke="none"/><circle cx="28" cy="25" r="1.5" fill="currentColor" stroke="none"/><path d="M21 28 q3 2.5 6 0"/><path d="M14 32 h20 M17 36 h14"/>',
  owl: '<path d="M12 14 C12 6 16 8 18 12 M36 14 C36 6 32 8 30 12"/><path d="M11 22 C11 12 18 9 24 9 C30 9 37 12 37 22 C37 32 31 39 24 39 C17 39 11 32 11 22 Z"/><circle cx="19" cy="22" r="4"/><circle cx="29" cy="22" r="4"/><circle cx="19" cy="22" r="1.4" fill="currentColor" stroke="none"/><circle cx="29" cy="22" r="1.4" fill="currentColor" stroke="none"/><path d="M23 27 l1 2 l1 -2 z" fill="currentColor" stroke="none"/>',
}

// Resolve an avatar id, tolerating unknown/legacy values (e.g. a retired
// creature a player picked before this update — they just fall back to a chip).
export function getAvatar(id) {
  return AVATARS.find(a => a.id === id) || null
}

// One avatar. Pass `fallback` (e.g. a name) to render a lettered chip when the
// player has no avatar yet — so older games and mid-join players still look fine.
export function Avatar({ id, size = 40, fallback = '', ringColor = null, style = {} }) {
  const def = getAvatar(id)
  const base = {
    width: size, height: size, borderRadius: '50%', display: 'inline-grid', placeItems: 'center',
    flex: 'none', boxSizing: 'border-box',
    ...(ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : {}),
    ...style,
  }
  if (!def) {
    return (
      <span style={{ ...base, background: '#e6ddcb', color: '#8a7d64', fontWeight: 800, fontSize: Math.round(size * 0.42), fontFamily: 'inherit', lineHeight: 1 }}>
        {(fallback || '?').trim().slice(0, 1).toUpperCase() || '?'}
      </span>
    )
  }
  return (
    <span style={{ ...base, background: def.tint, color: def.ink }}>
      <svg viewBox="0 0 48 48" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: PATHS[def.id] }} />
      </svg>
    </span>
  )
}
