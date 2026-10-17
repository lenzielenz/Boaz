// Gedeelde constanten + validatie. Wordt zowel door de browser als door de server
// (Node) geladen, dus: puur JavaScript, geen DOM, geen Node-API's.

export const BRUSHES = ['pen', 'marker', 'neon', 'rainbow', 'glitter', 'spray', 'balls']
export const PATTERNS = ['solid', 'checker', 'dots', 'stripes', 'balls']
export const BACKGROUNDS = ['wit', 'veld', 'ruitjes', 'nacht']

// De vijf officiële krachtbalkleuren (KVKBF), per balgewicht.
export const BALLS = [
  { id: 'oranje', label: '800 g', hex: '#f97316' },
  { id: 'geel', label: '1 kg', hex: '#facc15' },
  { id: 'rood', label: '2 kg', hex: '#dc2626' },
  { id: 'blauw', label: '3 kg', hex: '#2563eb' },
  { id: 'wit', label: '4 kg', hex: '#f8fafc' },
]

export const STICKERS = [
  'bal-oranje', 'bal-geel', 'bal-rood', 'bal-blauw', 'bal-wit',
  'logo', 'sint-michiels', 'veld', 'beker', 'medaille', 'fluit', 'trui-groen', 'trui-rood',
  'trui-blauw', 'doelpunt', 'vuurbal', 'scorebord', 'speler', 'wimpel', 'supporter',
  'ster', 'hart', 'bliksem', 'kroon',
  // kleurplaten: enkel lijnen, worden altijd bovenop getekend zodat je eronder kan inkleuren
  'kp-bal', 'kp-speler', 'kp-beker', 'kp-trui', 'kp-leeuw', 'kp-veld',
]

export const isColoringPage = (id) => typeof id === 'string' && id.startsWith('kp-')

/** Aantal tekenuitdagingen (de teksten staan in de browser; de server checkt enkel de index). */
export const IDEA_COUNT = 30

export const EMOJIS = [
  '😀', '😂', '😍', '🤩', '😎', '🥳', '😮', '😜', '👍', '👏', '💪', '🙌', '🎉', '🎊', '⭐',
  '🌟', '🔥', '⚡', '❤️', '💙', '💚', '💛', '🌈', '☀️', '🌙', '☁️', '🌸', '🌳', '🐶', '🐱',
  '🦁', '🐸', '🦄', '🐝', '🦋', '🍕', '🍦', '🍭', '🏆', '🥇', '🎨', '🚀', '👑', '🎈',
]

export const REACTIONS = ['👏', '🎉', '😍', '🔥', '⭐', '😂']

export const AVATARS = ['🦁', '🐯', '🐼', '🐸', '🦊', '🐨', '🐵', '🦄', '🐙', '🐧', '🐝', '🐬', '🐢', '🦖']

export const LIMITS = {
  maxPoints: 4000, // punten per lijn
  maxCoord: 5_000_000,
  maxWidth: 20_000,
  maxItemsPerRoom: 60_000,
  maxText: 60,
  maxName: 16,
  maxRoomName: 28,
  maxRooms: 300,
  maxThumbBytes: 200_000,
}

const HEX = /^#[0-9a-f]{6}$/
const ID = /^[a-z0-9-]{1,40}$/i

const num = (v) => typeof v === 'number' && Number.isFinite(v)
const coord = (v) => num(v) && Math.abs(v) <= LIMITS.maxCoord

export function cleanName(s, max = LIMITS.maxName) {
  if (typeof s !== 'string') return ''
  return s
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} '’\-_.!?]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function cleanPoints(p) {
  if (!Array.isArray(p) || p.length < 2 || p.length % 2 || p.length > LIMITS.maxPoints * 2) return null
  const out = new Array(p.length)
  for (let i = 0; i < p.length; i++) {
    if (!coord(p[i])) return null
    out[i] = Math.round(p[i] * 10) / 10
  }
  return out
}

/**
 * Valideert een tekenitem dat van een client komt en geeft een schone kopie terug
 * (enkel gekende velden), of `null` als het item ongeldig is.
 * Soorten: s = lijn, f = gevulde vorm, k = sticker, t = tekst.
 */
export function sanitizeItem(it, owner) {
  if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !ID.test(it.id)) return null
  const base = { id: it.id, k: it.k, o: owner }
  switch (it.k) {
    case 's': {
      const p = cleanPoints(it.p)
      if (!p || !BRUSHES.includes(it.b) || !HEX.test(it.c) || !num(it.w) || it.w <= 0 || it.w > LIMITS.maxWidth) return null
      return { ...base, b: it.b, c: it.c, w: Math.round(it.w * 100) / 100, sd: (it.sd >>> 0) % 1e9, p }
    }
    case 'f': {
      const p = cleanPoints(it.p)
      if (!p || p.length < 6 || !PATTERNS.includes(it.pat) || !HEX.test(it.c) || !num(it.sc) || it.sc <= 0 || it.sc > LIMITS.maxWidth) return null
      return { ...base, pat: it.pat, c: it.c, sc: Math.round(it.sc * 100) / 100, p }
    }
    case 'k': {
      const isEmoji = typeof it.s === 'string' && it.s.startsWith('e:') && EMOJIS.includes(it.s.slice(2))
      if (!isEmoji && !STICKERS.includes(it.s)) return null
      if (!coord(it.x) || !coord(it.y) || !num(it.z) || it.z <= 0 || it.z > LIMITS.maxWidth * 5 || !num(it.r)) return null
      return { ...base, s: it.s, x: Math.round(it.x), y: Math.round(it.y), z: Math.round(it.z * 100) / 100, r: Math.round(it.r * 1000) / 1000 }
    }
    case 't': {
      const v = typeof it.v === 'string' ? it.v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, LIMITS.maxText) : ''
      if (!v || !HEX.test(it.c) || !coord(it.x) || !coord(it.y) || !num(it.z) || it.z <= 0 || it.z > LIMITS.maxWidth * 5) return null
      return { ...base, v, c: it.c, x: Math.round(it.x), y: Math.round(it.y), z: Math.round(it.z * 100) / 100 }
    }
    default:
      return null
  }
}

export function itemBounds(it) {
  if (it.k === 's' || it.k === 'f') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let i = 0; i < it.p.length; i += 2) {
      const x = it.p[i], y = it.p[i + 1]
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    // Spray en ballen-borstel komen verder dan de lijn zelf.
    const pad = it.k === 's' ? it.w * (it.b === 'spray' || it.b === 'neon' || it.b === 'glitter' ? 1.6 : it.b === 'balls' ? 1.2 : 0.6) : 0
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
  }
  if (it.k === 'k') {
    const h = it.z * 0.72
    return [it.x - h, it.y - h, it.x + h, it.y + h]
  }
  // tekst: ruwe schatting, links uitgelijnd op x, basislijn-midden op y
  const w = it.z * 0.62 * [...it.v].length
  return [it.x, it.y - it.z * 0.7, it.x + w, it.y + it.z * 0.4]
}
