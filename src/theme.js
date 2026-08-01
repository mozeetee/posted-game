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
  welcomeMessage: '',
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

// ── Editions ──────────────────────────────────────────────────────────────
// "That's So Them" ships in flavors. Each edition sets a default theme, the
// prompt label, and the starter questions a new game is seeded with. The game
// blob stores `edition`; anything without one is the original 'posted' game.

// The original "Who Posted This?" starter questions (moved here from
// HostDashboard so both editions are defined in one place).
export const POSTED_SAMPLE_QUESTIONS = [
  { id: 1, post: "Just spent 3 hours reorganizing my spice cabinet alphabetically. No regrets.", author: "Alex", choices: ["Alex", "Jordan", "Sam", "Riley"], questionImage: null, revealImage: null },
  { id: 2, post: "Unpopular opinion: pineapple on pizza is objectively correct and I won't be taking questions.", author: "Sam", choices: ["Alex", "Jordan", "Sam", "Riley"], questionImage: null, revealImage: null },
  { id: 3, post: "Why do I always have the best ideas at 2am? Probably going to patent this tomorrow.", author: "Riley", choices: ["Alex", "Jordan", "Sam", "Riley"], questionImage: null, revealImage: null },
]

// Bride Edition starter questions. The bride fills in the real answer via her
// survey; the host then adds decoy choices. So `author`/`choices` start empty
// and `round` groups them for the survey + big-screen labels.
export const BRIDE_SAMPLE_QUESTIONS = [
  { id: 101, round: 'Her Past', post: "What's the bride's middle name?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 102, round: 'Her Past', post: "What was her first job?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 103, round: 'Her Past', post: "What elementary school did she go to?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 104, round: 'Her Past', post: "What city was she born in?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 105, round: 'Her Past', post: "What did she want to be when she grew up as a kid?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 106, round: 'Her Past', post: "What was the make/model of her first car?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 107, round: 'Her Past', post: "How many siblings does she have?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 108, round: 'Her Past', post: "Who said “I love you” first?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 109, round: 'Her Present', post: "What's her go-to order at a coffee shop?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 110, round: 'Her Present', post: "What's one thing she's weirdly good at?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 111, round: 'Her Present', post: "What's her most-used emoji in texts?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 112, round: 'Her Present', post: "What's a habit of hers her friends always tease her about?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 113, round: 'Her Present', post: "If she had a theme song, what would it be?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 114, round: 'Her Present', post: "What's her karaoke go-to song?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 115, round: 'Her Present', post: "What's her astrological sign?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 116, round: 'Their Future', post: "When's the wedding date?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 117, round: 'Their Future', post: "What's the one wedding detail she's most excited about?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 118, round: 'Their Future', post: "Who cried first when she said yes to the dress/suit?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 119, round: 'Their Future', post: "What song does she want playing when she walks down the aisle?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 120, round: 'Their Future', post: "What's the honeymoon destination, or dream destination if it's a surprise?", author: '', choices: [], questionImage: null, revealImage: null },
]

// Elegant bridal default theme (light/airy blush + gold on deep plum).
// Every key is editable in the host's Colors/Fonts customizer.
export const BRIDE_THEME = {
  ...DEFAULT_THEME,
  tagline: 'How well do you know the bride?',
  questionLabel: 'WHAT DID SHE SAY?',
  primaryColor: '#d8899b',
  secondaryColor: '#c9a227',
  backgroundColor: '#1a1220',
  cardColor: '#241830',
  textColor: '#f7ecf0',
  headingFont: "'Playfair Display', serif",
  bodyFont: 'Georgia, serif',
}

export const EDITIONS = {
  posted: {
    id: 'posted',
    label: "Who Posted This?",
    emoji: '🕵️',
    blurb: 'Guess who posted each quote, photo, or hot take.',
    defaultTheme: DEFAULT_THEME,
    sampleQuestions: POSTED_SAMPLE_QUESTIONS,
    hasSurvey: false,
  },
  bride: {
    id: 'bride',
    label: 'Bride Edition',
    emoji: '💍',
    blurb: "Bridal trivia — the bride fills in a survey, guests guess her answers.",
    defaultTheme: BRIDE_THEME,
    sampleQuestions: BRIDE_SAMPLE_QUESTIONS,
    hasSurvey: true,
  },
}

// Resolve an edition config, defaulting to the original 'posted' game.
export function getEditionConfig(edition) {
  return EDITIONS[edition] || EDITIONS.posted
}

// Merge a game's saved theme (partial) over the defaults so older games
// without a `theme` field, or games missing individual keys, still render fine.
// Uses the game's edition default as the base so bride games fall back to the
// bridal palette, not the dark 'posted' one.
export function getTheme(game) {
  const base = getEditionConfig(game?.edition).defaultTheme
  return { ...base, ...(game?.theme || {}) }
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
