// Tekent items en achtergronden op een canvas-context die al in wereld-coördinaten
// staat (de aanroeper zet de transform van de camera). Alles hier is deterministisch:
// elke tablet tekent exact dezelfde lijnen, ook de spray en de regenboog.

import { BALLS, isColoringPage } from './shared.js'
import { STICKER_ASPECT, stickerImage } from './stickers.js'

export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
export const TEXT_FONT = '"Trebuchet MS","Avenir Next",system-ui,sans-serif'

export function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const cache = new WeakMap()

function smoothPath(p, close = false) {
  const path = new Path2D()
  const n = p.length / 2
  if (n === 1) {
    path.moveTo(p[0], p[1])
    path.lineTo(p[0] + 0.01, p[1])
    return path
  }
  path.moveTo(p[0], p[1])
  if (n === 2) {
    path.lineTo(p[2], p[3])
  } else {
    for (let i = 1; i < n - 1; i++) {
      const x = p[i * 2], y = p[i * 2 + 1]
      const nx = p[i * 2 + 2], ny = p[i * 2 + 3]
      path.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
    }
    path.lineTo(p[(n - 1) * 2], p[(n - 1) * 2 + 1])
  }
  if (close) path.closePath()
  return path
}

/** Punten op gelijke afstand langs een lijn (voor spray en ballen-borstel). */
function walk(p, step, fn) {
  let carry = 0
  let idx = 0
  fn(p[0], p[1], idx++, 0)
  for (let i = 2; i < p.length; i += 2) {
    const x0 = p[i - 2], y0 = p[i - 1], x1 = p[i], y1 = p[i + 1]
    const len = Math.hypot(x1 - x0, y1 - y0)
    let d = step - carry
    while (d <= len) {
      const t = d / len
      fn(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, idx++, Math.atan2(y1 - y0, x1 - x0))
      d += step
    }
    carry = len - (d - step)
  }
}

function sprayPath(it) {
  const rnd = mulberry32(it.sd || 1)
  const path = new Path2D()
  const r = it.w * 1.3
  const dot = Math.max(it.w * 0.13, 0.3)
  walk(it.p, Math.max(it.w * 0.15, 0.5), (x, y) => {
    for (let k = 0; k < 5; k++) {
      const a = rnd() * Math.PI * 2
      const d = Math.sqrt(rnd()) * r
      path.rect(x + Math.cos(a) * d, y + Math.sin(a) * d, dot, dot)
    }
  })
  return path
}

// Glitter: fonkelende sterretjes rond de lijn, in de gekozen kleur, lichter en wit.
function glitterPaths(it) {
  const rnd = mulberry32(it.sd || 1)
  const paths = [new Path2D(), new Path2D(), new Path2D()]
  walk(it.p, Math.max(it.w * 0.35, 0.5), (x, y) => {
    for (let k = 0; k < 2; k++) {
      const a = rnd() * Math.PI * 2
      const d = Math.sqrt(rnd()) * it.w * 0.9
      const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d
      const r = it.w * (0.18 + rnd() * 0.4)
      const p = paths[Math.floor(rnd() * 3)]
      // vierpuntige ster
      p.moveTo(cx, cy - r)
      p.quadraticCurveTo(cx, cy, cx + r, cy)
      p.quadraticCurveTo(cx, cy, cx, cy + r)
      p.quadraticCurveTo(cx, cy, cx - r, cy)
      p.quadraticCurveTo(cx, cy, cx, cy - r)
    }
  })
  return paths
}

function ballStamps(it) {
  const rnd = mulberry32(it.sd || 1)
  const out = []
  walk(it.p, it.w * 1.25, (x, y, i) => out.push({ x, y, id: 'bal-' + BALLS[(i + (it.sd % 5)) % 5].id, r: rnd() * 6.28 }))
  return out
}

function rainbowSegs(it) {
  const segs = []
  const p = it.p
  let dist = 0
  const base = (it.sd % 360)
  for (let i = 2; i < p.length; i += 2) {
    const len = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1])
    const hue = (base + (dist / (it.w * 3)) * 24) % 360
    segs.push([p[i - 2], p[i - 1], p[i], p[i + 1], `hsl(${hue.toFixed(0)} 95% 55%)`])
    dist += len
  }
  return segs
}

function getCache(it, live) {
  let c = live ? null : cache.get(it)
  if (c) return c
  c = {}
  if (it.k === 's') {
    if (it.b === 'spray') c.spray = sprayPath(it)
    else if (it.b === 'balls') c.balls = ballStamps(it)
    else if (it.b === 'rainbow') c.segs = rainbowSegs(it)
    else if (it.b === 'glitter') {
      c.glitter = glitterPaths(it)
      c.path = smoothPath(it.p)
    }
    else c.path = smoothPath(it.p)
  } else if (it.k === 'f') {
    c.path = smoothPath(it.p, true)
  }
  if (!live) cache.set(it, c)
  return c
}

// ── Vulpatronen ────────────────────────────────────────────────────────────
const patterns = new Map()

function tint(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const m = (v) => Math.round(v + (255 - v) * amt)
  return `rgb(${m(r)},${m(g)},${m(b)})`
}

function makePattern(ctx, pat, color) {
  const key = pat + color
  const hit = patterns.get(key)
  if (hit) return hit
  const S = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')
  if (pat === 'checker') {
    g.fillStyle = tint(color, 0.45)
    g.fillRect(0, 0, S, S)
    g.fillStyle = color
    g.fillRect(0, 0, S / 2, S / 2)
    g.fillRect(S / 2, S / 2, S / 2, S / 2)
  } else if (pat === 'dots') {
    g.fillStyle = tint(color, 0.75)
    g.fillRect(0, 0, S, S)
    g.fillStyle = color
    for (const [x, y] of [[16, 16], [48, 48]]) {
      g.beginPath()
      g.arc(x, y, 10, 0, Math.PI * 2)
      g.fill()
    }
  } else if (pat === 'stripes') {
    g.fillStyle = tint(color, 0.6)
    g.fillRect(0, 0, S, S)
    g.strokeStyle = color
    g.lineWidth = 14
    g.beginPath()
    for (let o = -S; o <= S * 2; o += 32) {
      g.moveTo(o, 0)
      g.lineTo(o - S, S)
    }
    g.stroke()
  } else if (pat === 'balls') {
    const img = stickerImage('bal-' + (BALLS.find((b) => b.hex === color)?.id ?? 'rood'))
    if (!img) return null
    g.fillStyle = tint(color, 0.7)
    g.fillRect(0, 0, S, S)
    g.drawImage(img, 4, 4, 26, 26)
    g.drawImage(img, 36, 36, 26, 26)
  }
  const p = ctx.createPattern(cv, 'repeat')
  patterns.set(key, p)
  return p
}

// ── Items tekenen ──────────────────────────────────────────────────────────
export function drawItem(ctx, it, live = false) {
  if (it.k === 's') return drawStroke(ctx, it, live)
  if (it.k === 'f') return drawFill(ctx, it, live)
  if (it.k === 'k') return drawSticker(ctx, it)
  if (it.k === 't') return drawText(ctx, it)
}

/**
 * Tekent een reeks items in de juiste lagen: kleurplaten komen altijd bovenaan,
 * zodat hun lijnen zichtbaar blijven als kinderen eronder inkleuren.
 * `visible(it)` mag items overslaan (bv. buiten beeld).
 */
export function drawItems(ctx, items, visible = () => true) {
  let pages = null
  for (const it of items) {
    if (!visible(it)) continue
    if (it.k === 'k' && isColoringPage(it.s)) (pages ??= []).push(it)
    else drawItem(ctx, it)
  }
  if (pages) for (const it of pages) drawItem(ctx, it)
}

function drawStroke(ctx, it, live) {
  const c = getCache(it, live)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  switch (it.b) {
    case 'pen':
      ctx.strokeStyle = it.c
      ctx.lineWidth = it.w
      ctx.stroke(c.path)
      break
    case 'marker':
      ctx.globalAlpha = 0.45
      ctx.strokeStyle = it.c
      ctx.lineWidth = it.w * 2.2
      ctx.lineCap = 'square'
      ctx.stroke(c.path)
      ctx.globalAlpha = 1
      break
    case 'neon':
      ctx.strokeStyle = it.c
      ctx.globalAlpha = 0.18
      ctx.lineWidth = it.w * 3
      ctx.stroke(c.path)
      ctx.globalAlpha = 0.45
      ctx.lineWidth = it.w * 1.7
      ctx.stroke(c.path)
      ctx.globalAlpha = 1
      ctx.lineWidth = it.w
      ctx.stroke(c.path)
      ctx.strokeStyle = 'rgba(255,255,255,.9)'
      ctx.lineWidth = it.w * 0.38
      ctx.stroke(c.path)
      break
    case 'rainbow':
      ctx.lineWidth = it.w
      for (const s of c.segs) {
        ctx.strokeStyle = s[4]
        ctx.beginPath()
        ctx.moveTo(s[0], s[1])
        ctx.lineTo(s[2], s[3])
        ctx.stroke()
      }
      if (!c.segs.length) {
        ctx.fillStyle = `hsl(${it.sd % 360} 95% 55%)`
        ctx.beginPath()
        ctx.arc(it.p[0], it.p[1], it.w / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'spray':
      ctx.fillStyle = it.c
      ctx.fill(c.spray)
      break
    case 'glitter':
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = it.c
      ctx.lineWidth = it.w * 0.5
      ctx.stroke(c.path)
      ctx.globalAlpha = 1
      ctx.fillStyle = it.c
      ctx.fill(c.glitter[0])
      ctx.fillStyle = tint(it.c, 0.5)
      ctx.fill(c.glitter[1])
      ctx.fillStyle = '#ffffff'
      ctx.fill(c.glitter[2])
      break
    case 'balls':
      for (const b of c.balls) {
        const img = stickerImage(b.id)
        if (!img) continue
        const s = it.w * 1.15
        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(b.r)
        ctx.drawImage(img, -s / 2, -s / 2, s, s)
        ctx.restore()
      }
      break
  }
}

function drawFill(ctx, it, live) {
  const c = getCache(it, live)
  const pat = it.pat === 'solid' ? null : makePattern(ctx, it.pat, it.c)
  if (pat) {
    pat.setTransform(new DOMMatrix().scaleSelf(it.sc / 64, it.sc / 64))
    ctx.fillStyle = pat
  } else {
    ctx.fillStyle = it.c
  }
  ctx.fill(c.path)
  ctx.strokeStyle = it.c
  ctx.lineWidth = it.sc * 0.08
  ctx.lineJoin = 'round'
  ctx.stroke(c.path)
}

function drawSticker(ctx, it) {
  ctx.save()
  ctx.translate(it.x, it.y)
  if (it.r) ctx.rotate(it.r)
  if (it.s.startsWith('e:')) {
    ctx.font = `${it.z * 0.86}px ${EMOJI_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#000'
    ctx.fillText(it.s.slice(2), 0, it.z * 0.06)
  } else {
    const img = stickerImage(it.s)
    if (img) {
      const a = STICKER_ASPECT[it.s] ?? 1
      const w = a >= 1 ? it.z : it.z * a
      const h = a >= 1 ? it.z / a : it.z
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
    }
  }
  ctx.restore()
}

function drawText(ctx, it) {
  ctx.font = `bold ${it.z}px ${TEXT_FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineWidth = it.z * 0.16
  ctx.strokeStyle = '#ffffff'
  ctx.strokeText(it.v, it.x, it.y)
  ctx.fillStyle = it.c
  ctx.fillText(it.v, it.x, it.y)
}

// ── Achtergronden ──────────────────────────────────────────────────────────
// Het krachtbalveld op ware grootte: 1 meter = 100 wereld-eenheden.
// 46 m lang (2 doelgebieden van 10 m + 26 m middenstuk), 14 m breed.
export const M = 100
export const FIELD = { x0: -23 * M, x1: 23 * M, y0: -7 * M, y1: 7 * M }

export const BG_COLORS = { wit: '#fbfaf6', ruitjes: '#fdfdff', nacht: '#0d1530', veld: '#9ed99c' }

/** view = { x, y, s } (wereldcoördinaat linksboven + schaal); w,h = schermgrootte in css-px. */
export function drawBackground(ctx, bg, view, w, h) {
  const x0 = view.x, y0 = view.y, x1 = view.x + w / view.s, y1 = view.y + h / view.s
  ctx.fillStyle = BG_COLORS[bg] ?? BG_COLORS.wit
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0)

  if (bg === 'wit' || bg === 'ruitjes') {
    let step = 50
    while (step * view.s < 18) step *= 5
    const sx = Math.floor(x0 / step) * step, sy = Math.floor(y0 / step) * step
    if (bg === 'wit') {
      ctx.fillStyle = 'rgba(30,40,60,.13)'
      const r = 1.6 / view.s
      for (let x = sx; x <= x1; x += step) for (let y = sy; y <= y1; y += step) ctx.fillRect(x - r, y - r, r * 2, r * 2)
    } else {
      ctx.strokeStyle = 'rgba(70,120,220,.18)'
      ctx.lineWidth = 1 / view.s
      ctx.beginPath()
      for (let x = sx; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1) }
      for (let y = sy; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y) }
      ctx.stroke()
    }
  } else if (bg === 'nacht') {
    // Sterren per vak van 600 eenheden, telkens met een vaste seed.
    const cell = 600
    if (cell * view.s > 25) {
      const cx0 = Math.floor(x0 / cell), cy0 = Math.floor(y0 / cell)
      for (let cx = cx0; cx * cell <= x1; cx++) {
        for (let cy = cy0; cy * cell <= y1; cy++) {
          const rnd = mulberry32((cx * 73856093) ^ (cy * 19349663))
          for (let k = 0; k < 7; k++) {
            const sx = cx * cell + rnd() * cell, sy = cy * cell + rnd() * cell
            const r = 2 + rnd() * 5
            ctx.fillStyle = `rgba(255,255,${200 + Math.floor(rnd() * 55)},${0.4 + rnd() * 0.6})`
            ctx.beginPath()
            ctx.arc(sx, sy, Math.max(r, 1 / view.s), 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }
  } else if (bg === 'veld') {
    drawField(ctx, view)
  }
}

function drawField(ctx, view) {
  const { x0, x1, y0, y1 } = FIELD
  // grasstroken
  for (let i = 0; i < 23; i++) {
    ctx.fillStyle = i % 2 ? '#3fa34d' : '#47b356'
    ctx.fillRect(x0 + i * 2 * M, y0, 2 * M, y1 - y0)
  }
  // doelgebieden iets donkerder
  ctx.fillStyle = 'rgba(0,60,20,.12)'
  ctx.fillRect(x0, y0, 10 * M, y1 - y0)
  ctx.fillRect(x1 - 10 * M, y0, 10 * M, y1 - y0)

  const lw = Math.max(10, 1.5 / view.s)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = lw
  ctx.lineCap = 'butt'
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
  const gl = 13 * M // doellijnen op 13 m van het midden (26 m middenstuk)
  ctx.beginPath()
  for (const x of [-gl, gl, 0]) {
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y1)
  }
  // inworphoek: doellijn 50 cm doorgetrokken voorbij de zijlijn
  for (const x of [-gl, gl]) {
    ctx.moveTo(x, y0 - 50); ctx.lineTo(x, y0)
    ctx.moveTo(x, y1); ctx.lineTo(x, y1 + 50)
  }
  ctx.stroke()
  // vrijeworplijnen op 4 m van de doellijn (stippellijn)
  ctx.setLineDash([60, 40])
  ctx.beginPath()
  for (const x of [-gl + 4 * M, gl - 4 * M]) {
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y1)
  }
  ctx.stroke()
  ctx.setLineDash([])
  // middenstip
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(0, 0, 25, 0, Math.PI * 2)
  ctx.fill()
  // opschriften
  if (view.s > 0.04) {
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.font = `900 ${1.6 * M}px ${TEXT_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const x of [-18 * M, 18 * M]) {
      ctx.save()
      ctx.translate(x, 0)
      ctx.rotate(x < 0 ? -Math.PI / 2 : Math.PI / 2)
      ctx.fillText('DOELGEBIED', 0, 0)
      ctx.restore()
    }
    ctx.restore()
  }
}

/** Bounding box van alle items (voor "alles tonen" en de lobby-foto). */
export function boundsOf(items, boundsFn) {
  let b = null
  for (const it of items) {
    const [a, c, d, e] = boundsFn(it)
    if (!b) b = [a, c, d, e]
    else {
      if (a < b[0]) b[0] = a
      if (c < b[1]) b[1] = c
      if (d > b[2]) b[2] = d
      if (e > b[3]) b[3] = e
    }
  }
  return b
}
