// Krachtbal-stickers als SVG. Alles is in code getekend zodat het scherp blijft
// bij elke zoom. De bal is dezelfde als het KrachtbalIcon van Krachtbal Live:
// glanzend leer met 4 stroken (8 naden) die samenkomen in een rozet aan de zijkant.

import { STICKERS } from './shared.js'

const BALL_PALETTE = {
  oranje: { hi: '#ffe0c2', mid: '#f97316', edge: '#b4500c', seam: '#8a3c08', ring: '#9a4409' },
  geel: { hi: '#fff4c2', mid: '#f3c220', edge: '#bd8e0c', seam: '#8f6c08', ring: '#a87d0a' },
  rood: { hi: '#ffd7cf', mid: '#e23b3b', edge: '#9e1f1f', seam: '#7e1818', ring: '#8e1a1a' },
  blauw: { hi: '#d3e3ff', mid: '#2f74d0', edge: '#184a96', seam: '#143a78', ring: '#1a4283' },
  wit: { hi: '#ffffff', mid: '#f1f3f1', edge: '#bcc1bf', seam: '#8d928e', ring: '#9a9f9c' },
}

const norm3 = (v) => {
  const m = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / m, v[1] / m, v[2] / m]
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

const BALL_GEO = (() => {
  const R = 10.4, cx = 12, cy = 12
  const P = norm3([0.45, -0.27, 0.85])
  const U = norm3(cross(P, [0, 1, 0]))
  const V = cross(P, U)
  const project = (d) => [cx + d[0] * R, cy - d[1] * R]
  const seams = []
  for (let i = 0; i < 4; i++) {
    const cc = 0.5 + (i * Math.PI) / 2
    for (const s of [-0.3, 0.3]) {
      const phi = cc + s, cp = Math.cos(phi), sp = Math.sin(phi)
      const pts = []
      for (let t = 0.16; t <= Math.PI; t += 0.09) {
        const ct = Math.cos(t), st = Math.sin(t)
        const d = [0, 1, 2].map((k) => ct * P[k] + st * (cp * U[k] + sp * V[k]))
        if (d[2] < 0.03) break
        const [x, y] = project(d)
        pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
      }
      if (pts.length > 1) seams.push('M' + pts.join(' L'))
    }
  }
  return { seams, node: project(P) }
})()

/** De krachtbal als SVG-fragment in een 24×24-ruimte. */
export function ballSvgInner(kleur, idp = 'b') {
  const c = BALL_PALETTE[kleur] ?? BALL_PALETTE.wit
  const seams = BALL_GEO.seams.map((d) => `<path d="${d}"/>`).join('')
  const [nx, ny] = BALL_GEO.node
  return `<defs>
    <radialGradient id="${idp}l" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="${c.hi}"/><stop offset=".55" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.edge}"/></radialGradient>
    <radialGradient id="${idp}g"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="12" cy="12" r="10.4" fill="url(#${idp}l)" stroke="${c.ring}" stroke-width="1"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="${c.seam}" stroke-width="1.7" opacity=".95">${seams}</g>
    <g stroke="#fff" stroke-width=".55" opacity=".42">${seams}</g>
  </g>
  <circle cx="${nx}" cy="${ny}" r="1.5" fill="none" stroke="${c.seam}" stroke-width="1.5"/>
  <circle cx="${nx}" cy="${ny}" r="1.5" fill="none" stroke="#fff" stroke-width=".5" opacity=".45"/>
  <ellipse cx="9" cy="7.4" rx="4" ry="2.7" fill="url(#${idp}g)"/>
  <ellipse cx="8" cy="6.3" rx="1.6" ry="1.05" fill="#fff" opacity=".95"/>`
}

const svg = (vb, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="256" height="256">${body}</svg>`
const ball = (k) => svg('0 0 24 24', ballSvgInner(k))

function trui(main, dark) {
  return svg('0 0 100 100', `
    <path d="M30 10 L42 6 Q50 14 58 6 L70 10 L94 26 L84 44 L74 38 L74 92 Q50 96 26 92 L26 38 L16 44 L6 26 Z"
      fill="${main}" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M42 6 Q50 18 58 6" fill="none" stroke="${dark}" stroke-width="3"/>
    <path d="M26 38 L26 92 M74 38 L74 92" stroke="#fff" stroke-opacity=".25" stroke-width="4"/>
    <text x="50" y="74" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="36" fill="#fff"
      stroke="${dark}" stroke-width="2" text-anchor="middle">10</text>`)
}

const SVGS = {
  'bal-oranje': ball('oranje'),
  'bal-geel': ball('geel'),
  'bal-rood': ball('rood'),
  'bal-blauw': ball('blauw'),
  'bal-wit': ball('wit'),
  logo: svg('0 0 512 512', `
    <rect width="512" height="512" rx="96" fill="#06140d"/>
    <circle cx="256" cy="256" r="150" fill="none" stroke="#06d6a0" stroke-width="14"/>
    <text x="256" y="335" font-family="Arial Black, Arial, sans-serif" font-size="230" font-weight="900" fill="#ffd166" text-anchor="middle">K</text>`),
  veld: svg('0 0 120 60', `
    <rect x="1" y="9" width="118" height="42" rx="3" fill="#2f9e44" stroke="#1b6b2c" stroke-width="2"/>
    <rect x="3" y="11" width="25" height="38" fill="#37b24d"/><rect x="92" y="11" width="25" height="38" fill="#37b24d"/>
    <g stroke="#fff" stroke-width="1.4" fill="none">
      <rect x="3" y="11" width="114" height="38"/>
      <line x1="28" y1="11" x2="28" y2="49"/><line x1="92" y1="11" x2="92" y2="49"/>
      <line x1="38" y1="11" x2="38" y2="49" stroke-dasharray="3 2"/><line x1="82" y1="11" x2="82" y2="49" stroke-dasharray="3 2"/>
      <line x1="60" y1="11" x2="60" y2="49"/>
    </g>
    <g transform="translate(54 24) scale(.5)">${ballSvgInner('rood', 'v')}</g>`),
  beker: svg('0 0 100 100', `
    <defs><linearGradient id="gd" x1="0" x2="1"><stop offset="0" stop-color="#f5b300"/><stop offset=".45" stop-color="#ffe680"/><stop offset="1" stop-color="#c98a00"/></linearGradient></defs>
    <path d="M22 18 H8 Q6 40 30 46" fill="none" stroke="#d99a00" stroke-width="6"/>
    <path d="M78 18 H92 Q94 40 70 46" fill="none" stroke="#d99a00" stroke-width="6"/>
    <path d="M22 10 H78 V30 Q78 58 50 62 Q22 58 22 30 Z" fill="url(#gd)" stroke="#a87100" stroke-width="2.5"/>
    <rect x="44" y="60" width="12" height="14" fill="url(#gd)" stroke="#a87100" stroke-width="2"/>
    <rect x="30" y="74" width="40" height="10" rx="2" fill="url(#gd)" stroke="#a87100" stroke-width="2"/>
    <rect x="24" y="84" width="52" height="10" rx="2" fill="#5a3b1a"/>
    <g transform="translate(38 20) scale(1)">${ballSvgInner('rood', 'bk')}</g>`),
  medaille: svg('0 0 100 100', `
    <path d="M30 4 L44 44 L56 44 L42 4 Z" fill="#2563eb"/><path d="M70 4 L56 44 L44 44 L58 4 Z" fill="#dc2626"/>
    <circle cx="50" cy="66" r="28" fill="#f5b300" stroke="#a87100" stroke-width="3"/>
    <circle cx="50" cy="66" r="21" fill="#ffd84d" stroke="#d99a00" stroke-width="2"/>
    <text x="50" y="78" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="32" fill="#a87100" text-anchor="middle">1</text>`),
  fluit: svg('0 0 100 100', `
    <path d="M18 60 Q10 30 40 30 H86 Q92 30 92 38 V50 Q92 56 86 56 H62 Q60 86 34 86 Q20 84 18 60 Z" fill="#c9ced6" stroke="#5c6470" stroke-width="3"/>
    <circle cx="38" cy="60" r="12" fill="#8a929e"/><rect x="70" y="30" width="6" height="12" fill="#5c6470"/>
    <path d="M86 30 Q98 10 76 8" fill="none" stroke="#dc2626" stroke-width="4"/>
    <ellipse cx="50" cy="38" rx="20" ry="3" fill="#fff" opacity=".7"/>`),
  'trui-groen': trui('#0fb67f', '#085c40'),
  'trui-rood': trui('#d81e26', '#7e1218'),
  'trui-blauw': trui('#2563eb', '#173f8f'),
  doelpunt: svg('0 0 140 100', `
    <path d="M70 4 L82 22 L104 10 L102 32 L134 30 L114 48 L136 66 L106 68 L114 94 L88 78 L70 98 L58 76 L30 92 L36 66 L4 64 L28 48 L8 28 L38 32 L36 8 L58 22 Z"
      fill="#ffd166" stroke="#e85d04" stroke-width="4" stroke-linejoin="round"/>
    <text x="70" y="59" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="19" fill="#d00000" text-anchor="middle" transform="rotate(-6 70 54)">DOELPUNT!</text>`),
  vuurbal: svg('0 0 100 100', `
    <path d="M60 86 Q20 92 8 60 Q18 70 24 66 Q10 44 22 24 Q24 40 34 42 Q30 20 48 6 Q46 28 62 32 Q60 20 70 14 Q66 34 84 46 Q96 70 60 86 Z" fill="#ff7b00"/>
    <path d="M58 82 Q30 84 24 62 Q32 66 36 62 Q30 46 40 36 Q42 48 52 48 Q52 34 60 28 Q60 44 74 52 Q82 72 58 82 Z" fill="#ffd000"/>
    <g transform="translate(36 46) scale(1.5)">${ballSvgInner('rood', 'vb')}</g>`),
  scorebord: svg('0 0 120 80', `
    <rect x="4" y="8" width="112" height="64" rx="8" fill="#0a0b0d" stroke="#06d6a0" stroke-width="4"/>
    <text x="34" y="24" font-family="Arial, sans-serif" font-weight="700" font-size="10" fill="#9aa4b2" text-anchor="middle">THUIS</text>
    <text x="86" y="24" font-family="Arial, sans-serif" font-weight="700" font-size="10" fill="#9aa4b2" text-anchor="middle">UIT</text>
    <text x="34" y="60" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34" fill="#0fe0a6" text-anchor="middle">12</text>
    <text x="86" y="60" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34" fill="#4cc9f0" text-anchor="middle">9</text>
    <circle cx="60" cy="40" r="2.5" fill="#ffd166"/><circle cx="60" cy="50" r="2.5" fill="#ffd166"/>`),
  speler: svg('0 0 100 100', `
    <g stroke="#1f2937" stroke-width="6" stroke-linecap="round" fill="none">
      <path d="M46 40 L42 66 L28 92"/><path d="M42 66 L58 90"/>
      <path d="M45 46 L30 58"/><path d="M46 44 L64 30 L72 14"/>
    </g>
    <path d="M38 38 Q46 34 54 40 L50 64 L38 64 Z" fill="#0fb67f"/>
    <circle cx="48" cy="26" r="9" fill="#ffcf9e" stroke="#1f2937" stroke-width="3"/>
    <g transform="translate(64 0) scale(1)">${ballSvgInner('geel', 'sp')}</g>`),
  wimpel: svg('0 0 120 80', `
    <rect x="6" y="6" width="5" height="72" rx="2" fill="#6b4423"/>
    <path d="M11 8 L116 26 L11 46 Z" fill="#06d6a0" stroke="#048a66" stroke-width="2"/>
    <text x="50" y="32" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="12" fill="#06140d" text-anchor="middle">KRACHTBAL</text>`),
  supporter: svg('0 0 120 80', `
    <rect x="4" y="6" width="112" height="54" rx="6" fill="#fff" stroke="#dc2626" stroke-width="4"/>
    <text x="60" y="30" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="15" fill="#dc2626" text-anchor="middle">HUP HUP</text>
    <text x="60" y="50" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="15" fill="#2563eb" text-anchor="middle">HUP!</text>
    <rect x="56" y="60" width="8" height="18" fill="#6b4423"/>`),
  ster: svg('0 0 100 100', `<path d="M50 4 L63 36 L97 38 L70 60 L80 94 L50 74 L20 94 L30 60 L3 38 L37 36 Z" fill="#ffd166" stroke="#e8a400" stroke-width="4" stroke-linejoin="round"/><ellipse cx="42" cy="40" rx="8" ry="5" fill="#fff" opacity=".6"/>`),
  hart: svg('0 0 100 100', `<path d="M50 90 Q8 60 8 34 Q8 10 30 10 Q44 10 50 26 Q56 10 70 10 Q92 10 92 34 Q92 60 50 90 Z" fill="#ff4d6d" stroke="#c9184a" stroke-width="4"/><ellipse cx="30" cy="30" rx="9" ry="6" fill="#fff" opacity=".55"/>`),
  bliksem: svg('0 0 100 100', `<path d="M58 4 L18 56 H46 L38 96 L84 38 H54 Z" fill="#ffd60a" stroke="#f08c00" stroke-width="4" stroke-linejoin="round"/>`),
  kroon: svg('0 0 100 100', `<path d="M10 30 L30 52 L50 18 L70 52 L90 30 L82 80 H18 Z" fill="#ffd166" stroke="#e8a400" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="62" r="7" fill="#dc2626"/><circle cx="30" cy="66" r="5" fill="#2563eb"/><circle cx="70" cy="66" r="5" fill="#06d6a0"/>`),
}

// ── Kleurplaten: dikke zwarte lijnen, geen vulling ──────────────────────────
const KP = 'fill="none" stroke="#1f2937" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'

function kpBal() {
  // dezelfde naden als de echte krachtbal, maar dan als lijntekening
  const seams = BALL_GEO.seams.map((d) => `<path d="${d}"/>`).join('')
  const [nx, ny] = BALL_GEO.node
  return svg('0 0 24 24', `<g fill="none" stroke="#1f2937" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10.4" stroke-width=".8"/>
    <g stroke-width=".55">${seams}</g>
    <circle cx="${nx}" cy="${ny}" r="1.5" stroke-width=".6"/>
    <path d="M6.5 7.2 Q8 5.4 10.2 5" stroke-width=".45"/></g>`)
}

Object.assign(SVGS, {
  'kp-bal': kpBal(),
  'kp-speler': svg('0 0 100 100', `<g ${KP}>
    <circle cx="44" cy="18" r="10"/>
    <path d="M40 15 h0.1 M48 15 h0.1" stroke-width="4"/><path d="M39 21 Q44 26 49 21"/>
    <path d="M32 32 Q44 27 56 32 L58 62 L30 62 Z"/>
    <path d="M37 46 h14" stroke-dasharray="3 3"/>
    <path d="M32 34 L18 50 L24 54"/><path d="M56 34 L70 22 L74 12"/>
    <path d="M36 62 L28 82 L18 88"/><path d="M52 62 L58 82 L70 88"/>
    <path d="M14 86 Q18 92 24 88"/><path d="M64 86 Q70 92 76 88"/>
    <circle cx="80" cy="12" r="10"/><path d="M71 9 Q80 16 89 9 M80 2 Q75 12 80 22"/>
  </g>`),
  'kp-beker': svg('0 0 100 100', `<g ${KP}>
    <path d="M22 18 H8 Q6 40 30 46"/><path d="M78 18 H92 Q94 40 70 46"/>
    <path d="M22 10 H78 V30 Q78 58 50 62 Q22 58 22 30 Z"/>
    <rect x="44" y="62" width="12" height="12"/><rect x="30" y="74" width="40" height="10" rx="2"/>
    <rect x="24" y="84" width="52" height="10" rx="2"/>
    <path d="M42 28 L50 20 L58 28 L55 38 H45 Z"/><path d="M36 88 H64" stroke-dasharray="2 4"/>
  </g>`),
  'kp-trui': svg('0 0 100 100', `<g ${KP}>
    <path d="M30 10 L42 6 Q50 14 58 6 L70 10 L94 26 L84 44 L74 38 L74 92 Q50 96 26 92 L26 38 L16 44 L6 26 Z"/>
    <path d="M42 6 Q50 18 58 6"/><path d="M26 38 L26 92 M74 38 L74 92" stroke-dasharray="4 4"/>
    <path d="M18 28 L26 22 M82 28 L74 22"/>
  </g>
  <text x="50" y="72" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34" fill="none" stroke="#1f2937" stroke-width="2" text-anchor="middle">10</text>`),
  'kp-leeuw': svg('0 0 100 100', `<g ${KP}>
    <path d="M50 6 Q60 2 64 12 Q76 8 78 20 Q90 22 88 34 Q98 42 90 52 Q96 64 84 68 Q86 82 72 82 Q68 94 56 90 Q50 98 44 90 Q32 94 28 82 Q14 82 16 68 Q4 64 10 52 Q2 42 12 34 Q10 22 22 20 Q24 8 36 12 Q40 2 50 6 Z"/>
    <circle cx="50" cy="50" r="27"/>
    <circle cx="28" cy="28" r="6"/><circle cx="72" cy="28" r="6"/>
    <circle cx="40" cy="44" r="4"/><circle cx="60" cy="44" r="4"/>
    <path d="M44 56 L56 56 L50 63 Z"/><path d="M50 63 Q50 70 42 70 M50 63 Q50 70 58 70"/>
    <path d="M30 58 L20 56 M30 62 L21 64 M70 58 L80 56 M70 62 L79 64"/>
  </g>`),
  'kp-veld': svg('0 0 120 60', `<g ${KP} stroke-width="2">
    <rect x="3" y="9" width="114" height="42"/>
    <line x1="28" y1="9" x2="28" y2="51"/><line x1="92" y1="9" x2="92" y2="51"/>
    <line x1="38" y1="9" x2="38" y2="51" stroke-dasharray="3 3"/><line x1="82" y1="9" x2="82" y2="51" stroke-dasharray="3 3"/>
    <line x1="60" y1="9" x2="60" y2="51"/><circle cx="60" cy="30" r="1.5"/>
    <circle cx="16" cy="24" r="4"/><circle cx="16" cy="38" r="4"/><circle cx="48" cy="20" r="4"/><circle cx="48" cy="40" r="4"/>
    <circle cx="104" cy="24" r="4"/><circle cx="104" cy="38" r="4"/><circle cx="72" cy="20" r="4"/><circle cx="72" cy="40" r="4"/>
  </g>`),
})

const EXTERNAL = { 'sint-michiels': '/stickers/sint-michiels.svg' }

export const STICKER_LABELS = {
  'bal-oranje': 'Bal 800 g', 'bal-geel': 'Bal 1 kg', 'bal-rood': 'Bal 2 kg', 'bal-blauw': 'Bal 3 kg', 'bal-wit': 'Bal 4 kg',
  logo: 'Krachtbal Live', 'sint-michiels': 'Sint-Michiels', veld: 'Krachtbalveld', beker: 'Beker', medaille: 'Medaille',
  fluit: 'Scheidsrechter', 'trui-groen': 'Trui', 'trui-rood': 'Trui', 'trui-blauw': 'Trui', doelpunt: 'Doelpunt!',
  vuurbal: 'Krachtschot', scorebord: 'Scorebord', speler: 'Speler', wimpel: 'Wimpel', supporter: 'Supporter',
  ster: 'Ster', hart: 'Hart', bliksem: 'Bliksem', kroon: 'Kroon',
  'kp-bal': 'Kleurplaat bal', 'kp-speler': 'Kleurplaat speler', 'kp-beker': 'Kleurplaat beker',
  'kp-trui': 'Kleurplaat trui', 'kp-leeuw': 'Kleurplaat mascotte', 'kp-veld': 'Kleurplaat veld',
}

/** Verhouding breedte/hoogte per sticker (voor stickers die niet vierkant zijn). */
export const STICKER_ASPECT = { veld: 2, 'kp-veld': 2, doelpunt: 1.4, scorebord: 1.5, wimpel: 1.5, supporter: 1.5, 'sint-michiels': 100 / 120 }

const images = new Map()
const listeners = new Set()

export function onStickerLoad(fn) {
  listeners.add(fn)
}

export function stickerUrl(id) {
  if (EXTERNAL[id]) return EXTERNAL[id]
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SVGS[id])
}

/** Geeft een (mogelijk nog ladend) Image terug, of null als het nog niet klaar is. */
export function stickerImage(id) {
  let img = images.get(id)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.onload = () => listeners.forEach((fn) => fn())
    img.src = stickerUrl(id)
    images.set(id, img)
  }
  return img.complete && img.naturalWidth ? img : null
}

export function preloadStickers() {
  for (const id of STICKERS) stickerImage(id)
}
