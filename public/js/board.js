// Het tekenbord: oneindig canvas met camera (verschuiven/zoomen), alle tools,
// live meekijken met de anderen en ongedaan maken.
//
// Twee canvassen: `base` (achtergrond + alle afgewerkte items) wordt enkel
// hertekend als er iets verandert; `live` (lijnen die nu getekend worden,
// cursors, sticker-voorbeeld) elk frame. Zo blijft het vlot, ook met veel items.

import { BALLS, EMOJIS, LIMITS, REACTIONS, STICKERS, itemBounds, sanitizeItem } from './shared.js'
import { BG_COLORS, FIELD, boundsOf, drawBackground, drawItem, EMOJI_FONT } from './render.js'
import { STICKER_LABELS, onStickerLoad, preloadStickers, stickerUrl } from './stickers.js'
import { sound } from './sound.js'

const $ = (id) => document.getElementById(id)

const COLORS = [
  '#111827', '#ffffff', '#9ca3af', '#7c4a1e', '#ef4444', '#f97316', '#facc15', '#84cc16',
  '#22c55e', '#06d6a0', '#06b6d4', '#3b82f6', '#2563eb', '#a855f7', '#ec4899', '#fda4af',
]

const TOOLS = [
  { id: 'pen', icon: '✏️', label: 'Potlood' },
  { id: 'marker', icon: '🖍️', label: 'Stift' },
  { id: 'neon', icon: '✨', label: 'Neon' },
  { id: 'rainbow', icon: '🌈', label: 'Regenboog' },
  { id: 'spray', icon: '💨', label: 'Spray' },
  { id: 'balls', icon: 'ball', label: 'Ballen' },
  'sep',
  { id: 'fill', icon: '🪣', label: 'Vullen' },
  { id: 'sticker', icon: '⭐', label: 'Stickers' },
  { id: 'text', icon: '🔤', label: 'Tekst' },
  'sep',
  { id: 'eraser', icon: '🧽', label: 'Gom' },
  { id: 'hand', icon: '✋', label: 'Schuif' },
]
const BRUSH_TOOLS = ['pen', 'marker', 'neon', 'rainbow', 'spray', 'balls']

const PATTERN_LIST = [
  { id: 'solid', label: 'Effen' },
  { id: 'checker', label: 'Dambord' },
  { id: 'dots', label: 'Bolletjes' },
  { id: 'stripes', label: 'Strepen' },
  { id: 'balls', label: 'Krachtballen' },
]

const IDEAS = [
  'Teken jouw ploeg op het veld! 🏟️',
  'Teken de scheidsrechter met een reuzegrote fluit 😄',
  'Ontwerp een nieuwe trui voor je club 👕',
  'Teken een stadion vol supporters 📣',
  'Teken een krachtbal met superkrachten ⚡',
  'Teken je trainer als superheld 🦸',
  'Teken een doelpunt van heel ver 🎯',
  'Maak een supportersbord voor je club 🪧',
  'Bedenk een mascotte voor krachtbal 🦁',
  'Teken de bekerfinale 🏆',
  'Teken wat je na de match gaat eten 🍟',
  'Teken jezelf terwijl je een krachtschot geeft 💪',
  'Teken een krachtbalveld op de maan 🌙',
  'Teken je favoriete krachtbalspeler ⭐',
  'Teken een bal in alle kleuren: oranje, geel, rood, blauw en wit 🎨',
]

export class Board {
  constructor({ net, toast }) {
    this.net = net
    this.toast = toast
    this.el = $('board')
    this.base = $('baseCanvas')
    this.live = $('liveCanvas')
    this.bctx = this.base.getContext('2d')
    this.lctx = this.live.getContext('2d')
    this.items = new Map()
    this.bounds = new Map()
    this.view = { x: 0, y: 0, s: 1 }
    this.room = null
    this.owner = ''
    this.uid = 0
    this.me = { name: '', avatar: '', color: '#06d6a0' }

    this.tool = 'pen'
    this.color = '#ef4444'
    this.size = 12
    this.sticker = 'bal-rood'
    this.pattern = 'checker'

    this.undoStack = []
    this.redoStack = []
    this.lives = new Map()
    this.cursors = new Map()
    this.users = []

    this.pointers = new Map()
    this.gesture = null
    this.current = null
    this.penSeen = false
    this.space = false
    this.hover = null
    this.idCounter = 0
    this.lastCursorSent = 0
    this.dirtyBase = true
    this.dirtyLive = true
    this.viewDirty = false
    this.lastViewChange = 0
    this.lastRenderMs = 0
    this.changedSinceThumb = false
    this.active = false

    preloadStickers()
    onStickerLoad(() => {
      this.dirtyBase = true
      this.dirtyLive = true
    })
    this.#buildUi()
    this.#bindInput()
    this.#resize()
    window.addEventListener('resize', () => this.#resize())
    const loop = () => {
      if (this.active) this.#frame()
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
    setInterval(() => this.#maybeThumb(), 30_000)
  }

  // ── Openen / sluiten ─────────────────────────────────────────────────────
  open(roomId) {
    this.room = { id: roomId, name: '', bg: 'wit' }
    this.items.clear()
    this.bounds.clear()
    this.lives.clear()
    this.cursors.clear()
    this.undoStack = []
    this.redoStack = []
    this.firstSnapshot = true
    $('roomName').textContent = 'Laden…'
    this.active = true
    this.dirtyBase = true
    this.#updateUndo()
    this.net.join(roomId)
  }

  close() {
    this.#maybeThumb(true)
    this.active = false
    this.net.leave()
    this.room = null
    this.#cancelCurrent()
    $('stickerSheet').hidden = true
    $('fillSheet').hidden = true
    $('reactSheet').hidden = true
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }

  // ── Berichten van de server ──────────────────────────────────────────────
  handle(m) {
    switch (m.t) {
      case 'welcome':
        this.owner = m.owner
        this.uid = m.u
        return
      case 'snapshot': {
        if (!this.room || m.room?.id !== this.room.id) return
        this.room = m.room
        this.el.style.background = BG_COLORS[m.room.bg] ?? '#fff'
        $('roomName').textContent = m.room.name
        this.items.clear()
        this.bounds.clear()
        for (const it of m.items) this.#put(it)
        // Wat we offline al tekenden, staat nog in de wachtrij: lokaal opnieuw toepassen.
        for (const q of this.net.queue) {
          if (q.t === 'add') this.#put(q.item)
          else if (q.t === 'del') this.#drop(q.id)
        }
        if (this.firstSnapshot) {
          this.firstSnapshot = false
          this.home(false)
        }
        this.dirtyBase = true
        return
      }
      case 'users': {
        this.users = m.list
        for (const u of m.list) {
          const c = this.cursors.get(u.u)
          if (c) Object.assign(c, { name: u.name, avatar: u.avatar, color: u.color })
        }
        this.#renderPeople()
        return
      }
      case 'hi':
        this.toast(`${m.avatar} ${m.name} komt meetekenen!`)
        sound.join()
        return
      case 'gone': {
        this.cursors.delete(m.u)
        for (const k of this.lives.keys()) if (k.startsWith(m.u + ':')) this.lives.delete(k)
        this.dirtyLive = true
        return
      }
      case 'live': {
        const key = `${m.u}:${m.sid}`
        let l = this.lives.get(key)
        if (!l) {
          l = { b: m.b, c: m.c, w: m.w, sd: m.sd, p: [], t: 0 }
          this.lives.set(key, l)
        }
        for (const v of m.pts) l.p.push(v)
        l.t = performance.now()
        this.dirtyLive = true
        return
      }
      case 'liveEnd':
        this.lives.delete(`${m.u}:${m.sid}`)
        this.dirtyLive = true
        return
      case 'add':
        if (m.sid) this.lives.delete(`${m.u}:${m.sid}`)
        this.#put(m.item)
        this.dirtyBase = true
        this.dirtyLive = true
        return
      case 'del':
        this.#drop(m.id)
        this.dirtyBase = true
        return
      case 'cleared':
        this.items.clear()
        this.bounds.clear()
        this.dirtyBase = true
        return
      case 'cur': {
        let c = this.cursors.get(m.u)
        const u = this.users.find((x) => x.u === m.u)
        if (!c) {
          c = { x: m.x, y: m.y, tx: m.x, ty: m.y, name: u?.name ?? '', avatar: u?.avatar ?? '🙂', color: u?.color ?? '#888' }
          this.cursors.set(m.u, c)
        }
        c.tx = m.x
        c.ty = m.y
        c.t = performance.now()
        this.dirtyLive = true
        return
      }
      case 'react': {
        const u = this.users.find((x) => x.u === m.u)
        this.#floatReaction(m.e, m.x, m.y, m.u === this.uid ? '' : u?.name ?? '')
        return
      }
      case 'err':
        if (m.code === 'full') this.toast(m.msg)
        return
    }
  }

  // ── Items ────────────────────────────────────────────────────────────────
  #put(it) {
    this.items.delete(it.id) // opnieuw toevoegen = bovenaan
    this.items.set(it.id, it)
    this.bounds.set(it.id, itemBounds(it))
  }

  #drop(id) {
    this.items.delete(id)
    this.bounds.delete(id)
  }

  #newId() {
    return `${this.owner.slice(0, 6)}-${Date.now().toString(36)}-${(this.idCounter++).toString(36)}`
  }

  #commit(raw, sid) {
    const item = sanitizeItem(raw, this.owner)
    if (!item) return null
    this.#put(item)
    this.net.send({ t: 'add', item, sid })
    this.undoStack.push({ a: 'add', item })
    if (this.undoStack.length > 200) this.undoStack.shift()
    this.redoStack = []
    this.changedSinceThumb = true
    this.dirtyBase = true
    this.#updateUndo()
    return item
  }

  #erase(item) {
    this.#drop(item.id)
    this.net.send({ t: 'del', id: item.id })
    this.undoStack.push({ a: 'del', item })
    this.redoStack = []
    this.changedSinceThumb = true
    this.dirtyBase = true
    this.#updateUndo()
  }

  undo() {
    const op = this.undoStack.pop()
    if (!op) return
    this.#apply(op, true)
    this.redoStack.push(op)
    this.#updateUndo()
    sound.undo()
  }

  redo() {
    const op = this.redoStack.pop()
    if (!op) return
    this.#apply(op, false)
    this.undoStack.push(op)
    this.#updateUndo()
  }

  #apply(op, reverse) {
    const add = (op.a === 'add') !== reverse
    if (add) {
      this.#put(op.item)
      this.net.send({ t: 'add', item: op.item })
    } else {
      this.#drop(op.item.id)
      this.net.send({ t: 'del', id: op.item.id })
    }
    this.changedSinceThumb = true
    this.dirtyBase = true
  }

  #updateUndo() {
    $('undoBtn').disabled = !this.undoStack.length
    $('redoBtn').disabled = !this.redoStack.length
  }

  // ── Camera ───────────────────────────────────────────────────────────────
  #resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    this.dpr = dpr
    this.w = this.el.clientWidth || window.innerWidth
    this.h = this.el.clientHeight || window.innerHeight
    for (const c of [this.base, this.live]) {
      c.width = Math.round(this.w * dpr)
      c.height = Math.round(this.h * dpr)
    }
    this.dirtyBase = true
    this.dirtyLive = true
  }

  toWorld(sx, sy) {
    return [this.view.x + sx / this.view.s, this.view.y + sy / this.view.s]
  }

  toScreen(wx, wy) {
    return [(wx - this.view.x) * this.view.s, (wy - this.view.y) * this.view.s]
  }

  zoomAt(sx, sy, factor) {
    const s = Math.min(8, Math.max(0.01, this.view.s * factor))
    const [wx, wy] = this.toWorld(sx, sy)
    this.view.s = s
    this.view.x = wx - sx / s
    this.view.y = wy - sy / s
    this.#viewChanged()
  }

  #viewChanged() {
    this.viewDirty = true
    this.lastViewChange = performance.now()
    this.dirtyLive = true
    $('zoomLabel').textContent = Math.round(this.view.s * 100) + '%'
  }

  /** Zet de camera zo dat de rechthoek [x0,y0,x1,y1] mooi in beeld komt. */
  fit(b, animate = true) {
    const padL = 100, padR = 100, padT = 80, padB = 30
    const aw = Math.max(100, this.w - padL - padR), ah = Math.max(100, this.h - padT - padB)
    const s = Math.min(8, Math.max(0.01, Math.min(aw / Math.max(b[2] - b[0], 1), ah / Math.max(b[3] - b[1], 1))))
    const target = {
      s,
      x: (b[0] + b[2]) / 2 - (padL + aw / 2) / s,
      y: (b[1] + b[3]) / 2 - (padT + ah / 2) / s,
    }
    if (!animate) {
      this.view = target
      this.#viewChanged()
      return
    }
    const from = { ...this.view }
    const t0 = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 450)
      const e = 1 - (1 - t) ** 3
      // Schaal logaritmisch interpoleren voelt natuurlijker bij grote zoomsprongen.
      const s = Math.exp(Math.log(from.s) + (Math.log(target.s) - Math.log(from.s)) * e)
      const cx0 = from.x + this.w / 2 / from.s, cy0 = from.y + this.h / 2 / from.s
      const cx1 = target.x + this.w / 2 / target.s, cy1 = target.y + this.h / 2 / target.s
      const cx = cx0 + (cx1 - cx0) * e, cy = cy0 + (cy1 - cy0) * e
      this.view = { s, x: cx - this.w / 2 / s, y: cy - this.h / 2 / s }
      this.#viewChanged()
      if (t < 1) requestAnimationFrame(step)
    }
    step()
  }

  home(animate = true) {
    const all = boundsOf(this.items.values(), (it) => this.bounds.get(it.id))
    if (this.room?.bg === 'veld') {
      const f = [FIELD.x0 - 100, FIELD.y0 - 100, FIELD.x1 + 100, FIELD.y1 + 100]
      this.fit(all ? [Math.min(f[0], all[0]), Math.min(f[1], all[1]), Math.max(f[2], all[2]), Math.max(f[3], all[3])] : f, animate)
    } else if (all) {
      this.fit(all, animate)
    } else {
      this.fit([-600, -400, 600, 400], animate)
    }
  }

  // ── Tekenen per frame ────────────────────────────────────────────────────
  #frame() {
    const now = performance.now()
    // cursors van anderen zacht laten meeglijden
    for (const [u, c] of this.cursors) {
      const dx = c.tx - c.x, dy = c.ty - c.y
      if (Math.abs(dx) + Math.abs(dy) > 0.5 / this.view.s) {
        c.x += dx * 0.35
        c.y += dy * 0.35
        this.dirtyLive = true
      }
      if (now - c.t > 15_000) {
        this.cursors.delete(u)
        this.dirtyLive = true
      }
    }
    for (const [k, l] of this.lives) {
      if (now - l.t > 6000) {
        this.lives.delete(k)
        this.dirtyLive = true
      }
    }
    if (this.dirtyBase || this.viewDirty) {
      // Is een volledige hertekening traag (heel volle ruimte), dan tonen we tijdens
      // het schuiven/zoomen een verschoven kopie en tekenen we pas alles opnieuw
      // als de camera even stilstaat.
      const moving = now - this.lastViewChange < 140
      if (!this.dirtyBase && moving && this.lastRenderMs > 12) {
        this.#drawQuick()
      } else {
        this.dirtyBase = false
        this.viewDirty = false
        const t0 = performance.now()
        this.#drawBase()
        this.lastRenderMs = performance.now() - t0
        if (this.lastRenderMs > 12) this.#saveSnap()
      }
    }
    if (this.dirtyLive) {
      this.dirtyLive = false
      this.#drawLive()
    }
  }

  #worldTransform(ctx) {
    const { s, x, y } = this.view
    const d = this.dpr
    ctx.setTransform(d * s, 0, 0, d * s, -x * s * d, -y * s * d)
  }

  #drawBase() {
    const ctx = this.bctx
    this.#worldTransform(ctx)
    drawBackground(ctx, this.room?.bg ?? 'wit', this.view, this.w, this.h)
    const vx0 = this.view.x, vy0 = this.view.y
    const vx1 = vx0 + this.w / this.view.s, vy1 = vy0 + this.h / this.view.s
    const tiny = 0.6 / this.view.s
    for (const it of this.items.values()) {
      const b = this.bounds.get(it.id)
      if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue
      if (b[2] - b[0] < tiny && b[3] - b[1] < tiny) continue
      drawItem(ctx, it)
    }
  }

  #saveSnap() {
    if (!this.snap) this.snap = document.createElement('canvas')
    if (this.snap.width !== this.base.width || this.snap.height !== this.base.height) {
      this.snap.width = this.base.width
      this.snap.height = this.base.height
    }
    const g = this.snap.getContext('2d')
    g.drawImage(this.base, 0, 0)
    this.snapView = { ...this.view }
  }

  #drawQuick() {
    if (!this.snapView) return
    const ctx = this.bctx
    const v = this.view, sv = this.snapView, d = this.dpr
    const k = v.s / sv.s
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = BG_COLORS[this.room?.bg] ?? '#fff'
    ctx.fillRect(0, 0, this.base.width, this.base.height)
    ctx.drawImage(this.snap, (sv.x - v.x) * v.s * d, (sv.y - v.y) * v.s * d, this.snap.width * k, this.snap.height * k)
  }

  #drawLive() {
    const ctx = this.lctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.live.width, this.live.height)
    this.#worldTransform(ctx)
    for (const l of this.lives.values()) this.#drawLiveStroke(ctx, l)
    if (this.current) this.#drawLiveStroke(ctx, this.current)

    // sticker-voorbeeld onder de muis/pen
    if (this.hover && this.tool === 'sticker' && !this.current) {
      const [wx, wy] = this.toWorld(this.hover.x, this.hover.y)
      ctx.globalAlpha = 0.55
      drawItem(ctx, { k: 'k', s: this.sticker, x: wx, y: wy, z: this.#stickerPx() / this.view.s, r: 0 })
      ctx.globalAlpha = 1
    }

    // cursors (schermcoördinaten)
    const d = this.dpr
    ctx.setTransform(d, 0, 0, d, 0, 0)
    ctx.textBaseline = 'middle'
    for (const c of this.cursors.values()) {
      const [sx, sy] = this.toScreen(c.x, c.y)
      if (sx < -40 || sy < -40 || sx > this.w + 40 || sy > this.h + 40) continue
      ctx.fillStyle = c.color
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + 4, sy + 17)
      ctx.lineTo(sx + 9, sy + 11)
      ctx.lineTo(sx + 17, sy + 6)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
      const label = `${c.avatar} ${c.name}`
      ctx.font = `800 14px "Baloo 2", system-ui, sans-serif`
      const tw = ctx.measureText(label).width + 16
      ctx.fillStyle = c.color
      roundRect(ctx, sx + 14, sy + 14, tw, 24, 12)
      ctx.fill()
      ctx.fillStyle = contrastText(c.color)
      ctx.fillText(label, sx + 22, sy + 27)
    }
  }

  #drawLiveStroke(ctx, l) {
    if (l.p.length < 2) return
    if (l.b === 'lasso') {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(l.p[0], l.p[1])
      for (let i = 2; i < l.p.length; i += 2) ctx.lineTo(l.p[i], l.p[i + 1])
      ctx.closePath()
      ctx.globalAlpha = 0.25
      ctx.fillStyle = l.c
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.setLineDash([8 / this.view.s, 6 / this.view.s])
      ctx.lineWidth = 3 / this.view.s
      ctx.strokeStyle = l.c
      ctx.stroke()
      ctx.restore()
      return
    }
    drawItem(ctx, { k: 's', b: l.b, c: l.c, w: l.w, sd: l.sd, p: l.p }, true)
  }

  // ── Invoer ───────────────────────────────────────────────────────────────
  #bindInput() {
    const cv = this.live
    cv.addEventListener('pointerdown', (e) => this.#down(e))
    cv.addEventListener('pointermove', (e) => this.#move(e))
    cv.addEventListener('pointerup', (e) => this.#up(e))
    cv.addEventListener('pointercancel', (e) => this.#up(e, true))
    cv.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch') {
        this.hover = null
        this.dirtyLive = true
      }
    })
    cv.addEventListener('wheel', (e) => this.#wheel(e), { passive: false })
    cv.addEventListener('contextmenu', (e) => e.preventDefault())
    // iOS: dubbeltik-zoom en pinch van Safari zelf tegenhouden
    this.el.addEventListener('gesturestart', (e) => e.preventDefault())
    this.el.addEventListener('dblclick', (e) => e.preventDefault())

    window.addEventListener('keydown', (e) => {
      if (!this.active || e.target instanceof HTMLInputElement) return
      if (e.code === 'Space') {
        this.space = true
        e.preventDefault()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? this.redo() : this.undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        this.redo()
      } else if (e.key === '+' || e.key === '=') this.zoomAt(this.w / 2, this.h / 2, 1.3)
      else if (e.key === '-') this.zoomAt(this.w / 2, this.h / 2, 1 / 1.3)
      else if (e.key === '0') this.home()
    })
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.space = false
    })
  }

  #pos(e) {
    const r = this.live.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  #down(e) {
    if (!this.active) return
    e.preventDefault()
    this.live.setPointerCapture?.(e.pointerId)
    if (e.pointerType === 'pen') this.penSeen = true
    const p = this.#pos(e)
    this.pointers.set(e.pointerId, { ...p, type: e.pointerType })
    this.#closeSheetsOnDraw()

    const touches = [...this.pointers.values()].filter((q) => q.type === 'touch')
    if (e.pointerType === 'touch' && touches.length === 2) {
      // Tweede vinger: knijpen/schuiven. Een net begonnen lijn weggooien.
      this.#cancelCurrent()
      const [a, b] = touches
      this.gesture = {
        type: 'pinch',
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        v0: { ...this.view },
      }
      return
    }
    if (this.pointers.size > 1 || this.gesture) return

    const panOnly = e.button === 1 || e.button === 2 || this.tool === 'hand' || this.space || (this.penSeen && e.pointerType === 'touch')
    if (panOnly) {
      this.gesture = { type: 'pan', last: p }
      this.live.style.cursor = 'grabbing'
      return
    }
    this.#toolDown(p)
  }

  #move(e) {
    if (!this.active) return
    const p = this.#pos(e)
    const ptr = this.pointers.get(e.pointerId)
    if (ptr) {
      ptr.x = p.x
      ptr.y = p.y
    }
    if (e.pointerType !== 'touch') {
      this.hover = p
      if (this.tool === 'sticker') this.dirtyLive = true
    }
    this.#sendCursor(p)

    const g = this.gesture
    if (g?.type === 'pinch') {
      const touches = [...this.pointers.values()].filter((q) => q.type === 'touch')
      if (touches.length < 2) return
      const [a, b] = touches
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const s = Math.min(8, Math.max(0.01, g.v0.s * (d / g.d0)))
      const wx = g.v0.x + g.c0.x / g.v0.s, wy = g.v0.y + g.c0.y / g.v0.s
      this.view = { s, x: wx - c.x / s, y: wy - c.y / s }
      this.#viewChanged()
      return
    }
    if (g?.type === 'pan') {
      if (!ptr) return
      this.view.x -= (p.x - g.last.x) / this.view.s
      this.view.y -= (p.y - g.last.y) / this.view.s
      g.last = p
      this.#viewChanged()
      return
    }
    if (!ptr) return
    if (this.current) {
      const evs = e.getCoalescedEvents?.() ?? [e]
      const r = this.live.getBoundingClientRect()
      for (const ce of evs.length ? evs : [e]) this.#addPoint(ce.clientX - r.left, ce.clientY - r.top)
    } else if (this.tool === 'eraser' && this.erasing) {
      this.#eraseAt(p)
    }
  }

  #up(e, cancelled = false) {
    this.pointers.delete(e.pointerId)
    if (this.gesture) {
      if (this.pointers.size === 0) {
        this.gesture = null
        this.live.style.cursor = ''
      }
      return
    }
    if (this.current) {
      if (cancelled) this.#cancelCurrent()
      else this.#finishCurrent()
    }
    this.erasing = false
  }

  #wheel(e) {
    if (!this.active) return
    e.preventDefault()
    const p = this.#pos(e)
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY))
    if (e.ctrlKey || e.metaKey || mouseWheel) {
      const k = e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.012 : 0.0025
      this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * k))
    } else {
      this.view.x += e.deltaX / this.view.s
      this.view.y += e.deltaY / this.view.s
      this.#viewChanged()
    }
  }

  #sendCursor(p) {
    const now = performance.now()
    if (now - this.lastCursorSent < 60) return
    this.lastCursorSent = now
    const [x, y] = this.toWorld(p.x, p.y)
    this.net.volatile({ t: 'cur', x, y })
  }

  // ── Tools ────────────────────────────────────────────────────────────────
  #stickerPx() {
    return 40 + this.size * 3
  }

  #toolDown(p) {
    const [wx, wy] = this.toWorld(p.x, p.y)
    if (BRUSH_TOOLS.includes(this.tool) || this.tool === 'fill') {
      const isFill = this.tool === 'fill'
      const sid = Math.random().toString(36).slice(2, 10)
      this.current = {
        sid,
        b: isFill ? 'lasso' : this.tool,
        c: this.color,
        w: Math.max(this.size / this.view.s, 0.05),
        sd: (Math.random() * 1e9) >>> 0,
        p: [],
        sent: 0,
        lastSend: 0,
      }
      this.#addPoint(p.x, p.y)
      if (this.tool === 'balls') sound.boing()
      return
    }
    if (this.tool === 'sticker') {
      const item = this.#commit({ id: this.#newId(), k: 'k', s: this.sticker, x: wx, y: wy, z: this.#stickerPx() / this.view.s, r: (Math.random() - 0.5) * 0.5 })
      if (item) {
        this.#sparks(p.x, p.y)
        sound.pop()
      }
      return
    }
    if (this.tool === 'text') {
      this.#startText(p)
      return
    }
    if (this.tool === 'eraser') {
      this.erasing = true
      this.#eraseAt(p)
    }
  }

  #addPoint(sx, sy) {
    const c = this.current
    const [wx, wy] = this.toWorld(sx, sy)
    const n = c.p.length
    if (n >= 2) {
      const dx = (wx - c.p[n - 2]) * this.view.s, dy = (wy - c.p[n - 1]) * this.view.s
      if (dx * dx + dy * dy < 2.2) return
    }
    c.p.push(Math.round(wx * 10) / 10, Math.round(wy * 10) / 10)
    this.dirtyLive = true
    // Heel lange lijn: afsluiten en naadloos verder in een nieuwe.
    if (c.p.length >= (LIMITS.maxPoints - 5) * 2 && c.b !== 'lasso') {
      const last = c.p.slice(-2)
      this.#finishCurrent()
      this.current = { ...c, sid: Math.random().toString(36).slice(2, 10), p: [...last], sent: 0, lastSend: 0 }
    }
    this.#flushLive()
  }

  #flushLive(force = false) {
    const c = this.current
    if (!c) return
    const now = performance.now()
    if (!force && now - c.lastSend < 40) return
    if (c.sent >= c.p.length) return
    // Eén punt overlap, zodat de lijn bij de anderen netjes doorloopt.
    const pts = c.p.slice(c.sent).slice(0, 400)
    this.net.volatile({ t: 'live', sid: c.sid, b: c.b, c: c.c, w: c.w, sd: c.sd, pts })
    c.sent += pts.length
    c.lastSend = now
  }

  #finishCurrent() {
    const c = this.current
    this.current = null
    this.dirtyLive = true
    if (!c) return
    if (c.b === 'lasso') {
      this.net.volatile({ t: 'liveEnd', sid: c.sid })
      if (c.p.length >= 6) {
        const color = this.pattern === 'balls' ? nearestBall(c.c) : c.c
        this.#commit({ id: this.#newId(), k: 'f', pat: this.pattern, c: color, sc: 36 / this.view.s, p: c.p }, c.sid)
        sound.fill()
      }
      return
    }
    this.#commit({ id: this.#newId(), k: 's', b: c.b, c: c.c, w: c.w, sd: c.sd, p: c.p }, c.sid)
  }

  #cancelCurrent() {
    if (!this.current) return
    this.net.volatile({ t: 'liveEnd', sid: this.current.sid })
    this.current = null
    this.dirtyLive = true
  }

  #eraseAt(p) {
    const [wx, wy] = this.toWorld(p.x, p.y)
    const r = 14 / this.view.s
    const list = [...this.items.values()]
    let hitOther = false
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i]
      const b = this.bounds.get(it.id)
      if (wx < b[0] - r || wx > b[2] + r || wy < b[1] - r || wy > b[3] + r) continue
      if (!hitTest(it, wx, wy, r)) continue
      if (it.o === this.owner) {
        this.#erase(it)
        sound.erase()
      } else hitOther = true
    }
    if (hitOther && !this.warnedErase) {
      this.warnedErase = true
      this.toast('🧽 Je kan enkel je eigen tekening uitgommen')
      setTimeout(() => (this.warnedErase = false), 5000)
    }
  }

  #startText(p) {
    const inp = $('textInput')
    const px = 18 + this.size * 1.4
    const [wx, wy] = this.toWorld(p.x, p.y)
    inp.hidden = false
    inp.value = ''
    inp.style.left = p.x + 'px'
    inp.style.top = p.y - px * 0.85 + 'px'
    inp.style.fontSize = px + 'px'
    inp.style.color = this.color
    inp.style.fontFamily = '"Trebuchet MS","Avenir Next",system-ui,sans-serif'
    const done = (ok) => {
      inp.onkeydown = null
      inp.onblur = null
      inp.hidden = true
      const v = inp.value.trim()
      if (ok && v) {
        this.#commit({ id: this.#newId(), k: 't', v, c: this.color, x: wx, y: wy, z: px / this.view.s })
        sound.pop()
      }
    }
    inp.onkeydown = (ev) => {
      if (ev.key === 'Enter') done(true)
      else if (ev.key === 'Escape') done(false)
    }
    inp.onblur = () => done(true)
    setTimeout(() => inp.focus(), 0)
  }

  // ── Effecten ─────────────────────────────────────────────────────────────
  #sparks(x, y) {
    const fx = $('fx')
    const colors = ['#ffd166', '#06d6a0', '#ff5d6c', '#4cc9f0', '#f97316']
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('i')
      s.className = 'spark'
      const a = (i / 12) * Math.PI * 2
      const d = 40 + Math.random() * 40
      s.style.left = x + 'px'
      s.style.top = y + 'px'
      s.style.background = colors[i % colors.length]
      s.style.setProperty('--dx', Math.cos(a) * d + 'px')
      s.style.setProperty('--dy', Math.sin(a) * d + 'px')
      fx.appendChild(s)
      setTimeout(() => s.remove(), 750)
    }
  }

  #floatReaction(emoji, wx, wy, name) {
    let [x, y] = this.toScreen(wx, wy)
    x = Math.min(this.w - 40, Math.max(40, x))
    y = Math.min(this.h - 40, Math.max(80, y))
    const el = document.createElement('div')
    el.className = 'float'
    el.textContent = emoji
    if (name) {
      const s = document.createElement('small')
      s.textContent = name
      el.appendChild(s)
    }
    el.style.left = x + 'px'
    el.style.top = y + 'px'
    $('fx').appendChild(el)
    setTimeout(() => el.remove(), 1900)
    sound.pop()
  }

  // ── Foto's ───────────────────────────────────────────────────────────────
  #renderTo(width, height, b) {
    const cv = document.createElement('canvas')
    cv.width = width
    cv.height = height
    const ctx = cv.getContext('2d')
    const s = Math.min(width / (b[2] - b[0]), height / (b[3] - b[1]))
    const view = { s, x: (b[0] + b[2]) / 2 - width / 2 / s, y: (b[1] + b[3]) / 2 - height / 2 / s }
    ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s)
    drawBackground(ctx, this.room?.bg ?? 'wit', view, width, height)
    for (const it of this.items.values()) drawItem(ctx, it)
    return cv
  }

  async photo() {
    const b = [this.view.x, this.view.y, this.view.x + this.w / this.view.s, this.view.y + this.h / this.view.s]
    const cv = this.#renderTo(Math.round(this.w * 2), Math.round(this.h * 2), b)
    sound.camera()
    const flash = document.createElement('div')
    flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:.8;transition:opacity .4s'
    $('fx').appendChild(flash)
    requestAnimationFrame(() => (flash.style.opacity = '0'))
    setTimeout(() => flash.remove(), 450)
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
    if (!blob) return
    const name = `tekenclub-${(this.room?.name ?? 'tekening').replace(/[^\w-]+/g, '-')}.png`
    const file = new File([blob], name, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: 'Mijn krachtbaltekening' }).catch(() => {})
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    this.toast('📷 Foto bewaard!')
  }

  #maybeThumb(force = false) {
    if (!this.room || !this.changedSinceThumb || !this.items.size) return
    if (!force && !this.active) return
    this.changedSinceThumb = false
    let b = boundsOf(this.items.values(), (it) => this.bounds.get(it.id))
    if (this.room.bg === 'veld') b = [Math.min(b[0], FIELD.x0), Math.min(b[1], FIELD.y0), Math.max(b[2], FIELD.x1), Math.max(b[3], FIELD.y1)]
    // verhouding van de lobbykaart (≈ 1.6) aanhouden
    const w = b[2] - b[0], h = b[3] - b[1], pad = Math.max(w, h) * 0.04
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2
    const hw = Math.max(w / 2 + pad, ((h / 2 + pad) * 1.6)), hh = hw / 1.6
    const cv = this.#renderTo(400, 250, [cx - hw, cy - hh, cx + hw, cy + hh])
    this.net.send({ t: 'thumb', data: cv.toDataURL('image/png') })
  }

  // ── Gebruikersinterface ──────────────────────────────────────────────────
  #buildUi() {
    const tools = $('tools')
    for (const t of TOOLS) {
      if (t === 'sep') {
        tools.insertAdjacentHTML('beforeend', '<div class="tool-sep"></div>')
        continue
      }
      const b = document.createElement('button')
      b.className = 'tool'
      b.dataset.tool = t.id
      b.title = t.label
      if (t.icon === 'ball') {
        const img = document.createElement('img')
        img.src = stickerUrl('bal-geel')
        img.alt = ''
        b.appendChild(img)
      } else b.append(t.icon)
      const sm = document.createElement('small')
      sm.textContent = t.label
      b.appendChild(sm)
      b.onclick = () => this.setTool(t.id)
      tools.appendChild(b)
    }

    const sw = $('swatches')
    for (const c of COLORS) {
      const b = document.createElement('button')
      b.className = 'swatch'
      b.style.background = c
      b.dataset.color = c
      b.title = c
      b.onclick = () => this.setColor(c)
      sw.appendChild(b)
    }
    $('customColor').oninput = (e) => this.setColor(e.target.value)
    $('sizeRange').oninput = (e) => {
      this.size = Number(e.target.value)
      this.#updateSizePreview()
    }

    // stickers
    const grid = $('stickerGrid')
    const fillGrid = (tab) => {
      grid.innerHTML = ''
      const list = tab === 'emoji' ? EMOJIS.map((e) => 'e:' + e) : STICKERS
      for (const id of list) {
        const b = document.createElement('button')
        b.dataset.sticker = id
        if (id.startsWith('e:')) {
          b.textContent = id.slice(2)
          b.style.fontFamily = EMOJI_FONT
        } else {
          const img = document.createElement('img')
          img.src = stickerUrl(id)
          img.alt = STICKER_LABELS[id] ?? id
          img.loading = 'lazy'
          b.appendChild(img)
          b.title = STICKER_LABELS[id] ?? id
        }
        b.classList.toggle('on', id === this.sticker)
        b.onclick = () => {
          this.sticker = id
          grid.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
          sound.tick()
          this.dirtyLive = true
          // Blad dicht zodat je meteen overal kan plakken; ⭐ opnieuw aantikken opent het weer.
          $('stickerSheet').hidden = true
          this.#updateStickerTool()
          if (!this.stickerHintShown) this.toast('Tik op het blad om te plakken!')
          this.stickerHintShown = true
        }
        grid.appendChild(b)
      }
    }
    document.querySelectorAll('.sheet-tabs button').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('.sheet-tabs button').forEach((x) => x.classList.toggle('active', x === b))
        fillGrid(b.dataset.tab)
      }
    })
    fillGrid('krachtbal')

    // vulpatronen
    const row = $('patternRow')
    for (const p of PATTERN_LIST) {
      const b = document.createElement('button')
      b.title = p.label
      b.dataset.pattern = p.id
      const cv = document.createElement('canvas')
      cv.width = cv.height = 60
      b.appendChild(cv)
      b.onclick = () => {
        this.pattern = p.id
        this.#updatePatternPreviews()
        sound.tick()
      }
      row.appendChild(b)
    }

    // reacties
    const rs = $('reactSheet')
    for (const e of REACTIONS) {
      const b = document.createElement('button')
      b.textContent = e
      b.onclick = () => {
        const [x, y] = this.hover ? this.toWorld(this.hover.x, this.hover.y) : this.toWorld(this.w / 2, this.h / 2)
        this.net.volatile({ t: 'react', e, x, y })
        rs.hidden = true
      }
      rs.appendChild(b)
    }

    $('undoBtn').onclick = () => this.undo()
    $('redoBtn').onclick = () => this.redo()
    $('zoomIn').onclick = () => this.zoomAt(this.w / 2, this.h / 2, 1.4)
    $('zoomOut').onclick = () => this.zoomAt(this.w / 2, this.h / 2, 1 / 1.4)
    $('zoomLabel').onclick = () => this.home()
    $('photoBtn').onclick = () => this.photo()
    $('reactBtn').onclick = () => ($('reactSheet').hidden = !$('reactSheet').hidden)
    $('ideaBtn').onclick = () => this.#idea()
    $('fsBtn').onclick = () => this.#toggleFullscreen()
    $('focusBtn').onclick = () => this.#setFocus(true)
    $('unfocusBtn').onclick = () => this.#setFocus(false)
    $('soundBtn').onclick = () => {
      sound.enabled = !sound.enabled
      $('soundBtn').textContent = sound.enabled ? '🔊' : '🔇'
      try { localStorage.setItem('tc-sound', sound.enabled ? '1' : '0') } catch {}
    }
    try { sound.enabled = localStorage.getItem('tc-sound') !== '0' } catch {}
    $('soundBtn').textContent = sound.enabled ? '🔊' : '🔇'
    if (!document.fullscreenEnabled && !document.documentElement.webkitRequestFullscreen) $('fsBtn').hidden = true

    this.setTool('pen')
    this.setColor(this.color)
    this.#updateSizePreview()
  }

  setTool(id) {
    const again = this.tool === id
    this.tool = id
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === id))
    $('stickerSheet').hidden = id !== 'sticker' || (again && !$('stickerSheet').hidden)
    $('fillSheet').hidden = id !== 'fill'
    if (id === 'fill') this.#updatePatternPreviews()
    this.live.style.cursor = id === 'hand' ? 'grab' : id === 'text' ? 'text' : 'crosshair'
    this.dirtyLive = true
    sound.tick()
  }

  setColor(c) {
    this.color = c
    document.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.color === c))
    this.#updateSizePreview()
    this.#updatePatternPreviews()
    // Na een kleurkeuze met de gom of de hand: terug naar tekenen.
    if (this.tool === 'eraser' || this.tool === 'hand') this.setTool('pen')
  }

  #updateStickerTool() {
    const btn = document.querySelector('.tool[data-tool=sticker]')
    const small = btn.querySelector('small')
    btn.textContent = ''
    if (this.sticker.startsWith('e:')) btn.append(this.sticker.slice(2))
    else {
      const img = document.createElement('img')
      img.src = stickerUrl(this.sticker)
      img.alt = ''
      btn.appendChild(img)
    }
    btn.appendChild(small)
  }

  #updateSizePreview() {
    const s = $('sizePreview').firstElementChild
    const d = Math.min(60, Math.max(3, this.size * 0.75))
    s.style.width = s.style.height = d + 'px'
    s.style.background = this.color
    s.style.boxShadow = this.color.toLowerCase() === '#ffffff' ? '0 0 0 1px #999' : ''
    this.dirtyLive = true
  }

  #updatePatternPreviews() {
    document.querySelectorAll('#patternRow button').forEach((b) => {
      b.classList.toggle('on', b.dataset.pattern === this.pattern)
      const cv = b.firstElementChild
      const ctx = cv.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, 60, 60)
      const color = b.dataset.pattern === 'balls' ? nearestBall(this.color) : this.color
      drawItem(ctx, { k: 'f', pat: b.dataset.pattern, c: color, sc: 30, p: [0, 0, 60, 0, 60, 60, 0, 60] }, true)
    })
  }

  #closeSheetsOnDraw() {
    $('reactSheet').hidden = true
  }

  #idea() {
    const el = $('ideaBanner')
    let idea
    do idea = IDEAS[Math.floor(Math.random() * IDEAS.length)]
    while (idea === el.textContent && IDEAS.length > 1)
    el.textContent = '💡 ' + idea
    el.hidden = false
    el.style.animation = 'none'
    void el.offsetWidth
    el.style.animation = ''
    sound.join()
    clearTimeout(this.ideaTimer)
    this.ideaTimer = setTimeout(() => (el.hidden = true), 7000)
  }

  #toggleFullscreen() {
    const d = document
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      ;(d.exitFullscreen || d.webkitExitFullscreen)?.call(d)
    } else {
      const el = d.documentElement
      ;(el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
    }
  }

  #setFocus(on) {
    this.el.classList.toggle('focus', on)
    $('unfocusBtn').hidden = !on
  }

  #renderPeople() {
    const box = $('people')
    box.innerHTML = ''
    const others = this.users.filter((u) => u.u !== this.uid)
    const me = this.users.find((u) => u.u === this.uid)
    const list = me ? [me, ...others] : others
    for (const u of list.slice(0, 8)) {
      const b = document.createElement('button')
      b.style.background = u.color
      b.textContent = u.avatar
      b.title = u.u === this.uid ? `${u.name} (jij)` : `${u.name}: tik om erheen te gaan`
      b.onclick = () => {
        const c = this.cursors.get(u.u)
        if (u.u !== this.uid && c) {
          const s = Math.max(this.view.s, 0.5)
          this.fit([c.tx - this.w / 2 / s, c.ty - this.h / 2 / s, c.tx + this.w / 2 / s, c.ty + this.h / 2 / s])
        } else if (u.u !== this.uid) this.toast(`${u.avatar} ${u.name} heeft nog niet getekend`)
      }
      box.appendChild(b)
    }
    if (list.length > 8) {
      const more = document.createElement('button')
      more.className = 'more'
      more.textContent = '+' + (list.length - 8)
      box.appendChild(more)
    }
  }
}

// ── Hulpfuncties ─────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function contrastText(hex) {
  const n = parseInt(hex.slice(1), 16)
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return l > 150 ? '#06140d' : '#ffffff'
}

function nearestBall(hex) {
  const n = parseInt(hex.slice(1), 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  let best = BALLS[0], bd = Infinity
  for (const b of BALLS) {
    const m = parseInt(b.hex.slice(1), 16)
    const d = Math.hypot(rgb[0] - ((m >> 16) & 255), rgb[1] - ((m >> 8) & 255), rgb[2] - (m & 255))
    if (d < bd) {
      bd = d
      best = b
    }
  }
  return best.hex
}

function segDist2(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0
  const l2 = dx * dx + dy * dy
  let t = l2 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  const qx = x0 + dx * t - px, qy = y0 + dy * t - py
  return qx * qx + qy * qy
}

function hitTest(it, x, y, r) {
  if (it.k === 's') {
    const mult = { marker: 1.1, neon: 1.5, spray: 1.3, balls: 0.6 }[it.b] ?? 0.5
    const lim = (it.w * mult + r) ** 2
    const p = it.p
    if (p.length === 2) return (p[0] - x) ** 2 + (p[1] - y) ** 2 <= lim
    for (let i = 2; i < p.length; i += 2) if (segDist2(x, y, p[i - 2], p[i - 1], p[i], p[i + 1]) <= lim) return true
    return false
  }
  if (it.k === 'f') {
    let inside = false
    const p = it.p
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
  const b = itemBounds(it)
  const shrink = it.k === 'k' ? it.z * 0.2 : 0
  return x >= b[0] + shrink - r && x <= b[2] - shrink + r && y >= b[1] + shrink - r && y <= b[3] - shrink + r
}
