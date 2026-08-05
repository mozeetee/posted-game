// Hand-drawn "field creature" avatars. Players pick one when they join; it
// follows them onto the lobby, the round scoreboards, the results screen, the
// host's live view, and the big screen. Line-art in a soft tinted circle —
// friendly, gender-neutral, and on-theme with the boutique "Field Notes" look.

export const AVATARS = [
  { id: 'fox',      name: 'Fox',      tint: '#efd9c6', ink: '#b85f37' },
  { id: 'bear',     name: 'Bear',     tint: '#e4d7c1', ink: '#7a5b3a' },
  { id: 'bunny',    name: 'Bunny',    tint: '#e9dfd0', ink: '#8a7256' },
  { id: 'cat',      name: 'Cat',      tint: '#dfe3d4', ink: '#5c6f4c' },
  { id: 'owl',      name: 'Owl',      tint: '#e6ddc9', ink: '#997e3d' },
  { id: 'bee',      name: 'Bee',      tint: '#f0e4c4', ink: '#a9842a' },
  { id: 'deer',     name: 'Deer',     tint: '#e7dccb', ink: '#8a6a45' },
  { id: 'frog',     name: 'Frog',     tint: '#dbe4d3', ink: '#5f7a4a' },
  { id: 'hedgehog', name: 'Hedgehog', tint: '#eaddcb', ink: '#916f4c' },
]

const dot = { fill: 'currentColor', stroke: 'none' }

const PATHS = {
  fox: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 12 L18 20 M38 12 L30 20" />
      <path d="M12 14 C12 30 18 38 24 38 C30 38 36 30 36 14 C31 19 17 19 12 14 Z" />
      <circle cx="19" cy="24" r="1.6" {...dot} /><circle cx="29" cy="24" r="1.6" {...dot} />
      <path d="M24 28 L24 31 M22 31 h4" />
    </g>
  ),
  bear: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="14" cy="15" r="5" /><circle cx="34" cy="15" r="5" /><circle cx="24" cy="26" r="13" />
      <circle cx="19" cy="24" r="1.6" {...dot} /><circle cx="29" cy="24" r="1.6" {...dot} />
      <ellipse cx="24" cy="29" rx="2.6" ry="2" {...dot} />
      <path d="M24 31 q-3 3 -5 1 M24 31 q3 3 5 1" />
    </g>
  ),
  bunny: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20 C15 10 17 5 19 5 C22 5 22 14 21 21 M30 20 C33 10 31 5 29 5 C26 5 26 14 27 21" />
      <ellipse cx="24" cy="29" rx="11" ry="10" />
      <circle cx="20" cy="28" r="1.5" {...dot} /><circle cx="28" cy="28" r="1.5" {...dot} />
      <path d="M24 31 v2 M22 33 q2 2 4 0" />
    </g>
  ),
  cat: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 12 L17 22 M35 12 L31 22" /><circle cx="24" cy="26" r="13" />
      <circle cx="19" cy="25" r="1.6" {...dot} /><circle cx="29" cy="25" r="1.6" {...dot} />
      <path d="M24 28 l0 2 M22 30 q2 1.5 4 0" />
      <path d="M9 26 h7 M9 30 h7 M39 26 h-7 M39 30 h-7" />
    </g>
  ),
  owl: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 14 C12 6 16 8 18 12 M36 14 C36 6 32 8 30 12" />
      <path d="M11 22 C11 12 18 9 24 9 C30 9 37 12 37 22 C37 32 31 39 24 39 C17 39 11 32 11 22 Z" />
      <circle cx="19" cy="22" r="4" /><circle cx="29" cy="22" r="4" />
      <circle cx="19" cy="22" r="1.4" {...dot} /><circle cx="29" cy="22" r="1.4" {...dot} />
      <path d="M23 27 l1 2 l1 -2 z" {...dot} />
    </g>
  ),
  bee: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10 C16 6 14 6 13 8 M30 10 C32 6 34 6 35 8" />
      <ellipse cx="24" cy="27" rx="11" ry="12" />
      <path d="M14 24 h20 M14 30 h20" />
      <ellipse cx="12" cy="20" rx="4" ry="6" transform="rotate(-25 12 20)" />
      <ellipse cx="36" cy="20" rx="4" ry="6" transform="rotate(25 36 20)" />
      <circle cx="21" cy="20" r="1.3" {...dot} /><circle cx="27" cy="20" r="1.3" {...dot} />
    </g>
  ),
  deer: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 12 C16 5 13 5 12 8 M18 12 C19 7 22 8 22 5" />
      <path d="M30 12 C32 5 35 5 36 8 M30 12 C29 7 26 8 26 5" />
      <path d="M15 17 C11 15 11 19 15 20 M33 17 C37 15 37 19 33 20" />
      <path d="M24 15 C31 15 31 24 30 30 C29 36 27 39 24 39 C21 39 19 36 18 30 C17 24 17 15 24 15 Z" />
      <circle cx="20" cy="26" r="1.6" {...dot} /><circle cx="28" cy="26" r="1.6" {...dot} />
      <ellipse cx="24" cy="33" rx="2.6" ry="2" {...dot} />
    </g>
  ),
  frog: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 24 C8 17 15 18 24 18 C33 18 40 17 40 24 C40 33 33 39 24 39 C15 39 8 33 8 24 Z" />
      <circle cx="16" cy="15" r="5" /><circle cx="32" cy="15" r="5" />
      <circle cx="16" cy="15" r="1.6" {...dot} /><circle cx="32" cy="15" r="1.6" {...dot} />
      <path d="M15 28 Q24 34 33 28" />
      <circle cx="21" cy="24" r="1" {...dot} /><circle cx="27" cy="24" r="1" {...dot} />
    </g>
  ),
  hedgehog: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 26 C13 33 18 38 24 38 C30 38 35 33 35 26" />
      <path d="M11 27 L13 20 L16 26 L19 18 L22 25 L24 17 L26 25 L29 18 L32 26 L35 20 L37 27" />
      <circle cx="20" cy="30" r="1.5" {...dot} /><circle cx="28" cy="30" r="1.5" {...dot} />
      <ellipse cx="24" cy="35" rx="2" ry="1.5" {...dot} />
    </g>
  ),
}

// Resolve an avatar id, tolerating unknown/legacy values.
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
        {PATHS[def.id]}
      </svg>
    </span>
  )
}
