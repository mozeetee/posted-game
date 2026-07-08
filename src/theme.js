// Theme defaults, presets, and small color helpers shared by the host
// dashboard (customizer) and the player room (renderer).

export const BRAND_NAME = "That's So Them"
export const BRAND_TAGLINE = "The party game where it's always SO them"

// Splits the brand name into a leading part and an accent-colored last word,
// e.g. for the logo treatment: "THAT'S SO" + accented "THEM".
export function getBrandParts() {
  const words = BRAND_NAME.split(' ')
  const last = words.pop()
  return { lead: words.join(' '), accent: last }
}

export const DEFAULT_THEME = {
  tagline: BRAND_TAGLINE,
  questionLabel: 'WHO POSTED THIS?',
  primaryColor: '#ffd166',
  secondaryColor: '#00ff88',
  backgroundColor: '#0a0a12',
  cardColor: '#111120',
  textColor: '#f0f0f0',
  headingFont: "'Arial Black', sans-serif",
  bodyFont: "'Courier New', monospace",
  backgroundImage: null,
  logoImage: null,
}

// `google` holds the Google Fonts family spec (as used in the fonts.googleapis.com
// CSS2 URL) for fonts that aren't system fonts. `null` means it's a web-safe font
// that needs no loading.
export const FONT_OPTIONS = [
  { label: 'Courier New (Retro Mono)', value: "'Courier New', monospace", google: null },
  { label: 'Arial Black (Bold Sans)', value: "'Arial Black', sans-serif", google: null },
  { label: 'Georgia (Classic Serif)', value: 'Georgia, serif', google: null },
  { label: 'Poppins (Modern Sans)', value: "'Poppins', sans-serif", google: 'Poppins:wght@400;700;900' },
  { label: 'Montserrat (Clean Sans)', value: "'Montserrat', sans-serif", google: 'Montserrat:wght@400;700;900' },
  { label: 'Playfair Display (Elegant Serif)', value: "'Playfair Display', serif", google: 'Playfair+Display:wght@700;900' },
  { label: 'Pacifico (Playful Script)', value: "'Pacifico', cursive", google: 'Pacifico' },
  { label: 'Bebas Neue (Tall Display)', value: "'Bebas Neue', sans-serif", google: 'Bebas+Neue' },
]

export const THEME_PRESETS = [
  {
    id: 'camp-bach',
    label: 'Pink & Green Camp Bach',
    emoji: '🏕️',
    theme: {
      primaryColor: '#ff6fae',
      secondaryColor: '#7ed957',
      backgroundColor: '#0f1f14',
      cardColor: '#172b1c',
      textColor: '#fff5f9',
      headingFont: "'Pacifico', cursive",
      bodyFont: "'Poppins', sans-serif",
    },
  },
  {
    id: 'mountain-forest',
    label: 'Mountain / Forest',
    emoji: '🏔️',
    theme: {
      primaryColor: '#8fae5d',
      secondaryColor: '#c98a4b',
      backgroundColor: '#101710',
      cardColor: '#1a231a',
      textColor: '#eef2e6',
      headingFont: "'Bebas Neue', sans-serif",
      bodyFont: 'Georgia, serif',
    },
  },
  {
    id: 'christmas',
    label: 'Christmas',
    emoji: '🎄',
    theme: {
      primaryColor: '#d4af37',
      secondaryColor: '#2a9d5c',
      backgroundColor: '#0b1410',
      cardColor: '#132018',
      textColor: '#fdf3e3',
      headingFont: "'Playfair Display', serif",
      bodyFont: 'Georgia, serif',
    },
  },
  {
    id: 'birthday',
    label: 'Birthday',
    emoji: '🎂',
    theme: {
      primaryColor: '#ff5da2',
      secondaryColor: '#ffcc00',
      backgroundColor: '#1a1030',
      cardColor: '#241a3d',
      textColor: '#fff9f0',
      headingFont: "'Pacifico', cursive",
      bodyFont: "'Poppins', sans-serif",
    },
  },
  {
    id: 'bachelorette',
    label: 'Bachelorette',
    emoji: '💍',
    theme: {
      primaryColor: '#d4af37',
      secondaryColor: '#e8a0bf',
      backgroundColor: '#150f14',
      cardColor: '#201820',
      textColor: '#f8ecec',
      headingFont: "'Playfair Display', serif",
      bodyFont: 'Georgia, serif',
    },
  },
]

// Merge a game's saved theme (partial) over the defaults so older games
// without a `theme` field, or games missing individual keys, still render fine.
export function getTheme(game) {
  return { ...DEFAULT_THEME, ...(game?.theme || {}) }
}

// Append an alpha channel to a 6-digit hex color, e.g. withAlpha('#f0f0f0', 0.5) -> '#f0f0f080'
export function withAlpha(hex, alpha) {
  if (!hex || typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7) return hex
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0')
  return `${hex}${a}`
}

// Pick black or white text for readability on top of an arbitrary background color.
export function contrastColor(hex) {
  if (!hex || typeof hex !== 'string' || hex.length < 7) return '#111111'
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#111111' : '#ffffff'
}

const loadedFonts = new Set()

// Injects a <link> tag for a Google Font if the given font-family value needs one.
// Safe to call repeatedly — each family is only loaded once.
export function ensureGoogleFont(fontValue) {
  if (typeof document === 'undefined') return
  const opt = FONT_OPTIONS.find(f => f.value === fontValue)
  if (!opt || !opt.google || loadedFonts.has(opt.google)) return
  loadedFonts.add(opt.google)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${opt.google}&display=swap`
  document.head.appendChild(link)
}
