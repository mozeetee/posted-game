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
  // Boutique "Field Notes" system: warm oat paper, sage lead, clay + honey
  // warmth, ink text — rounded Fredoka display over friendly Nunito Sans.
  primaryColor: '#4f6b50',   // sage — buttons, brand, the current pick
  secondaryColor: '#5f8f6b', // leaf green — the correct answer / success
  accentColor: '#c26742',    // clay — eyebrows, question card, letter badges
  backgroundColor: '#ece4d2',// oat paper
  cardColor: '#fffdf7',      // warm white
  textColor: '#332f27',      // warm ink
  headingFont: "'Fredoka', sans-serif",
  bodyFont: "'Nunito Sans', sans-serif",
  backgroundImage: null,
  logoImage: null,
}

// `google` holds the Google Fonts family spec (as used in the fonts.googleapis.com
// CSS2 URL) for fonts that aren't system fonts. `null` means it's a web-safe font
// that needs no loading.
export const FONT_OPTIONS = [
  { label: 'Fredoka (Rounded Display)', value: "'Fredoka', sans-serif", google: 'Fredoka:wght@400;500;600;700' },
  { label: 'Nunito Sans (Friendly Sans)', value: "'Nunito Sans', sans-serif", google: 'Nunito+Sans:wght@400;600;700;800' },
  { label: 'Quicksand (Rounded, Lighter)', value: "'Quicksand', sans-serif", google: 'Quicksand:wght@400;500;600;700' },
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
    id: 'sage',
    label: 'Sage & Clay',
    emoji: '🌿',
    theme: { primaryColor: '#4f6b50', secondaryColor: '#5f8f6b', accentColor: '#c26742', backgroundColor: '#ece4d2', cardColor: '#fffdf7', textColor: '#332f27', headingFont: "'Fredoka', sans-serif", bodyFont: "'Nunito Sans', sans-serif" },
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    emoji: '🏺',
    theme: { primaryColor: '#b85f3c', secondaryColor: '#6f8f5e', accentColor: '#d99a52', backgroundColor: '#f2e6d4', cardColor: '#fffdf7', textColor: '#3a2c22', headingFont: "'Fredoka', sans-serif", bodyFont: "'Nunito Sans', sans-serif" },
  },
  {
    id: 'plum',
    label: 'Plum & Rose',
    emoji: '🍇',
    theme: { primaryColor: '#8f5a73', secondaryColor: '#6f8f6a', accentColor: '#b06f86', backgroundColor: '#f0e7dd', cardColor: '#fffdf8', textColor: '#3a2e30', headingFont: "'Fredoka', sans-serif", bodyFont: "'Nunito Sans', sans-serif" },
  },
  {
    id: 'forest',
    label: 'Forest & Honey',
    emoji: '🌲',
    theme: { primaryColor: '#3f5742', secondaryColor: '#6f8f5e', accentColor: '#dca04a', backgroundColor: '#e9e3d1', cardColor: '#fdfaf1', textColor: '#2c2b22', headingFont: "'Fredoka', sans-serif", bodyFont: "'Nunito Sans', sans-serif" },
  },
  {
    id: 'dusk',
    label: 'Dusk & Berry',
    emoji: '🫐',
    theme: { primaryColor: '#5b6b86', secondaryColor: '#6f8f6a', accentColor: '#b0617a', backgroundColor: '#e8e6dd', cardColor: '#fffef9', textColor: '#2e2f33', headingFont: "'Fredoka', sans-serif", bodyFont: "'Nunito Sans', sans-serif" },
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

// Guest-of-honor starter questions. The guest of honor fills in the real answer
// via their survey; the host then adds decoy choices. So `author`/`choices`
// start empty and `round` groups them for the survey + big-screen labels.
// Kept occasion-neutral so the same edition works for a bridal shower, birthday,
// baby shower, retirement, or any party with a guest of honor.
export const BRIDE_SAMPLE_QUESTIONS = [
  { id: 101, round: 'Their Past', post: "What's their middle name?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 102, round: 'Their Past', post: "What was their first job?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 103, round: 'Their Past', post: "What elementary school did they go to?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 104, round: 'Their Past', post: "What city were they born in?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 105, round: 'Their Past', post: "What did they want to be when they grew up?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 106, round: 'Their Past', post: "What was the make and model of their first car?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 107, round: 'Their Past', post: "How many siblings do they have?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 108, round: 'Their Present', post: "What's their go-to coffee or drink order?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 109, round: 'Their Present', post: "What's one thing they're weirdly good at?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 110, round: 'Their Present', post: "What's their most-used emoji in texts?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 111, round: 'Their Present', post: "What's a habit their friends always tease them about?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 112, round: 'Their Present', post: "If they had a theme song, what would it be?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 113, round: 'Their Present', post: "What's their karaoke go-to song?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 114, round: 'Their Present', post: "What's their star sign?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 115, round: 'Just for Fun', post: "What's their go-to comfort food?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 116, round: 'Just for Fun', post: "What show could they rewatch forever?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 117, round: 'Just for Fun', post: "Where's their dream vacation?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 118, round: 'Just for Fun', post: "What's their most-used app?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 119, round: 'Just for Fun', post: "What's a hidden talent most people don't know about?", author: '', choices: [], questionImage: null, revealImage: null },
  { id: 120, round: 'Just for Fun', post: "What three words best describe them?", author: '', choices: [], questionImage: null, revealImage: null },
]

// Elegant bridal default theme (light/airy blush + gold on deep plum).
// Every key is editable in the host's Colors/Fonts customizer.
// Bride edition — same boutique bones, shifted to a warm plum + rose accent so
// the two games read as siblings rather than strangers.
export const BRIDE_THEME = {
  ...DEFAULT_THEME,
  tagline: 'How well do you know them?',
  questionLabel: 'WHAT DID THEY SAY?',
  primaryColor: '#8f5a73',   // plum
  secondaryColor: '#6f8f6a', // leaf green — success stays legible
  accentColor: '#b06f86',    // rose
  backgroundColor: '#f0e7dd',// warm blush cream
  cardColor: '#fffdf8',
  textColor: '#3a2e30',      // warm aubergine ink
  headingFont: "'Fredoka', sans-serif",
  bodyFont: "'Nunito Sans', sans-serif",
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
    // Optional: the host can text a survey link to the group so each guest
    // digs up and submits their OWN posts, instead of the host sourcing them
    // all. The host still keeps the build-it-yourself flow. See GuestSurvey.jsx.
    hasGuestSurvey: true,
  },
  // Kept the internal id 'bride' for data compatibility with games already
  // created, but the edition is now the occasion-neutral "guest of honor" game.
  bride: {
    id: 'bride',
    label: 'How Well Do You Know Them?',
    emoji: '🎉',
    blurb: "A guest of honor fills in a survey, and everyone guesses their answers.",
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
