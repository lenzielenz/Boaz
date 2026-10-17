// Het tekenbord: oneindig canvas met camera (verschuiven/zoomen), alle tools,
// live meekijken met de anderen en ongedaan maken.
//
// Twee canvassen: `base` (achtergrond + alle afgewerkte items) wordt enkel
// hertekend als er iets verandert; `live` (lijnen die nu getekend worden,
// cursors, sticker-voorbeeld) elk frame. Zo blijft het vlot, ook met veel items.

import { BALLS, EMOJIS, IDEA_COUNT, LIMITS, REACTIONS, STICKERS, isColoringPage, itemBounds, sanitizeItem } from './shared.js'
import { BG_COLORS, FIELD, boundsOf, drawBackground, drawItem, drawItems, EMOJI_FONT } from './render.js'
import { STICKER_LABELS, onStickerLoad, preloadStickers, stickerUrl } from './stickers.js'
import { sound } from './sound.js'
import { award, collect, count } from './medals.js'
import { confetti } from './fx.js'

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
  { id: 'glitter', icon: '💎', label: 'Glitter' },
  { id: 'spray', icon: '💨', label: 'Spray' },
  { id: 'balls', icon: 'ball', label: 'Ballen' },
  'sep',
  { id: 'shape', icon: '🔷', label: 'Vormen' },
  { id: 'fill', icon: '🪣', label: 'Vullen' },
  { id: 'sticker', icon: '⭐', label: 'Stickers' },
  { id: 'text', icon: '🔤', label: 'Tekst' },
  'sep',
  { id: 'eraser', icon: '🧽', label: 'Gom' },
  { id: 'hand', icon: '✋', label: 'Schuif' },
]
const BRUSH_TOOLS = ['pen', 'marker', 'neon', 'rainbow', 'glitter', 'spray', 'balls']

const SHAPES = [
  { id: 'circle', icon: '⭕', label: 'Cirkel' },
  { id: 'square', icon: '🟦', label: 'Vierkant' },
  { id: 'triangle', icon: '🔺', label: 'Driehoek' },
  { id: 'star', icon: '⭐', label: 'Ster' },
  { id: 'heart', icon: '❤️', label: 'Hart' },
  { id: 'line', icon: '📏', label: 'Rechte lijn' },
]

// Spiegelstanden: 0 = uit, 2 = vlinder (links/rechts), 4 = vier hoeken, 6 = caleidoscoop.
const MIRRORS = [
  { n: 0, icon: '🦋', label: 'uit' },
  { n: 2, icon: '🦋', label: '↔' },
  { n: 4, icon: '🦋', label: '✚' },
  { n: 6, icon: '🦋', label: '✳' },
]

const CHALLENGE_SECONDS = 90

const PATTERN_LIST = [
  { id: 'solid', label: 'Effen' },
  { id: 'checker', label: 'Dambord' },
  { id: 'dots', label: 'Bolletjes' },
  { id: 'stripes', label: 'Strepen' },
  { id: 'balls', label: 'Krachtballen' },
]

// Tekenuitdagingen, van heel makkelijk (6 jaar) tot pittig (12 jaar).
// Het aantal moet gelijk blijven aan IDEA_COUNT in shared.js (de server checkt de index).
const IDEAS = [
  'Teken een krachtbal met een grappig gezichtje 😊',
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
  'Teken een regenboog boven het veld 🌈',
  'Teken een dier dat krachtbal speelt 🐸',
  'Maak samen de grootste zon van de wereld ☀️',
  'Teken een krachtbal-robot 🤖',
  'Teken een medaille voor je beste vriend(in) 🥇',
  'Teken het weer tijdens de match: zon, regen of sneeuw? 🌦️',
  'Teken een sporttas en alles wat erin zit 🎒',
  'Teken een krachtbal die kan vliegen 🚀',
  'Teken iedereen die naar jouw match komt kijken 👨‍👩‍👧',
  'Maak samen een bloementuin rond het veld 🌸',
  'Teken een kasteel voor de kampioenen 🏰',
  'Teken een krachtbalveld onder water 🐠',
  'Teken je eigen clubwapen 🛡️',
  'Teken hoe krachtbal eruit ziet in het jaar 3000 🛸',
]

if (IDEAS.length !== IDEA_COUNT) console.warn('IDEAS en IDEA_COUNT lopen niet gelijk')

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
    this.shape = 'circle'
    this.shapeFill = false
    this.mirror = 0
    this.lastBrush = 'pen'

    this.undoStack = []
    this.redoStack = []
    this.lives = new Map()
    this.cursors = new Map()
    this.users = []
    this.drawing = new Map() // uid -> tot wanneer die persoon "aan het tekenen" is
    this.recent = [] // naamlabels die even blijven hangen na een afgewerkte lijn
    this.edgeHits = [] // pijltjes aan de rand (tik = ernaartoe)
    this.challenge = null

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
    this.drawing.clear()
    this.recent = []
    this.undoStack = []
    this.redoStack = []
    this.firstSnapshot = true
    this.#endChallenge()
    if (collect('rooms', roomId) >= 3) award('ontdekker')
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
    $('shapeSheet').hidden = true
    $('reactSheet').hidden = true
    this.#endChallenge()
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
        if (m.list.length >= 3) award('team')
        return
      }
      case 'idea':
        this.#startChallenge(m)
        return
      case 'hi':
        this.toast(`${m.avatar} ${m.name} komt meetekenen!`)
        sound.join()
        return
      case 'gone': {
        this.cursors.delete(m.u)
        this.drawing.delete(m.u)
        for (const k of this.lives.keys()) if (k.startsWith(m.u + ':')) this.lives.delete(k)
        this.dirtyLive = true
        return
      }
      case 'live': {
        const key = `${m.u}:${m.sid}`
        let l = this.lives.get(key)
        if (!l) {
          l = { u: m.u, b: m.b, c: m.c, w: m.w, sd: m.sd, p: [], t: 0 }
          this.lives.set(key, l)
        }
        for (const v of m.pts) l.p.push(v)
        l.t = performance.now()
        this.drawing.set(m.u, l.t + 900)
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
        if (m.u && m.u !== this.uid) this.#othersAdded(m.u, m.item)
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
        if (m.code === 'full' || m.code === 'idea') this.toast(m.msg)
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
    return this.#commitMany([raw], sid)[0] ?? null
  }

  /** Meerdere items als één stap toevoegen (spiegeltekenen, vorm + vulling): één keer ongedaan maken. */
  #commitMany(raws, sid) {
    const items = []
    for (const raw of raws) {
      const item = sanitizeItem(raw, this.owner)
      if (!item) continue
      this.#put(item)
      // De live lijn hoort bij het eerste item; de spiegelkopieën krijgen geen sid.
      this.net.send({ t: 'add', item, sid: items.length ? undefined : sid })
      items.push(item)
      this.#medalsFor(item)
    }
    if (!items.length) return items
    this.undoStack.push({ a: 'add', items })
    if (this.undoStack.length > 200) this.undoStack.shift()
    this.redoStack = []
    this.changedSinceThumb = true
    this.dirtyBase = true
    this.#updateUndo()
    return items
  }

  #medalsFor(it) {
    if (it.k === 's') {
      const n = count('lines')
      if (n >= 1) award('eerste')
      if (n >= 25) award('tekenaar')
      if (n >= 150) award('kunstenaar')
      if (it.b === 'rainbow') award('regenboog')
      if (it.b === 'glitter') award('glitter')
    } else if (it.k === 'k') {
      if (count('stickers') >= 10) award('plakker')
      if (isColoringPage(it.s)) award('inkleuren')
      if (it.s.startsWith('bal-') && collect('balls', it.s) >= 5) award('ballen')
    } else if (it.k === 'f') {
      if (count('fills') >= 5) award('vuller')
    }
  }

  #erase(item) {
    this.#drop(item.id)
    this.net.send({ t: 'del', id: item.id })
    this.undoStack.push({ a: 'del', items: [item] })
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
    for (const item of op.items) {
      if (add) {
        this.#put(item)
        this.net.send({ t: 'add', item })
      } else {
        this.#drop(item.id)
        this.net.send({ t: 'del', id: item.id })
      }
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
    // Naamlabels bij wie tekent bewegen (puntjes "tekent…") en vervagen: blijven hertekenen.
    if (this.recent.length) this.recent = this.recent.filter((r) => now - r.t < 2600)
    if (this.lives.size || this.recent.length) this.dirtyLive = true
    if (now - (this.lastPeople ?? 0) > 250) {
      this.lastPeople = now
      for (const b of $('people').children) {
        const u = Number(b.dataset.u)
        b.classList.toggle('drawing', u !== this.uid && (this.drawing.get(u) ?? 0) > now)
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
    drawItems(ctx, this.items.values(), (it) => {
      const b = this.bounds.get(it.id)
      if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) return false
      return !(b[2] - b[0] < tiny && b[3] - b[1] < tiny)
    })
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
    const now = performance.now()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.live.width, this.live.height)
    this.#worldTransform(ctx)
    for (const l of this.lives.values()) this.#drawLiveStroke(ctx, l)
    if (this.current) {
      const pts = this.#currentPoints()
      for (const p of this.current.b === 'lasso' ? [pts] : this.#copies(pts)) {
        if (this.current.shape && this.shapeFill && this.shape !== 'line') {
          ctx.globalAlpha = 0.35
          drawItem(ctx, { k: 'f', pat: this.pattern, c: this.current.c, sc: 36 / this.view.s, p }, true)
          ctx.globalAlpha = 1
        }
        this.#drawLiveStroke(ctx, { ...this.current, p })
      }
    }

    // sticker-voorbeeld onder de muis/pen
    if (this.hover && this.tool === 'sticker' && !this.current) {
      const [wx, wy] = this.toWorld(this.hover.x, this.hover.y)
      ctx.globalAlpha = 0.55
      drawItem(ctx, { k: 'k', s: this.sticker, x: wx, y: wy, z: this.#stickerPx() / this.view.s, r: 0 })
      ctx.globalAlpha = 1
    }

    // schermcoördinaten vanaf hier
    const d = this.dpr
    ctx.setTransform(d, 0, 0, d, 0, 0)
    this.#drawMirrorGuides(ctx)

    ctx.textBaseline = 'middle'
    const justDone = new Set(this.recent.map((r) => r.u))
    for (const [u, c] of this.cursors) {
      // Wie tekent, krijgt een naamlabel aan zijn/haar lijn; dan geen dubbel cursorlabel.
      if ((this.drawing.get(u) ?? 0) > now) continue
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
      if (!justDone.has(u)) this.#tag(ctx, sx + 14, sy + 14, `${c.avatar} ${c.name}`, c.color, 1)
    }

    // Wie tekent er? Een naamlabel aan het puntje van elke lijn die nu getekend wordt.
    this.edgeHits = []
    const dots = '.'.repeat(1 + (Math.floor(now / 350) % 3))
    for (const l of this.lives.values()) {
      if (l.p.length < 2) continue
      const u = this.#user(l.u)
      const wx = l.p[l.p.length - 2], wy = l.p[l.p.length - 1]
      const [sx, sy] = this.toScreen(wx, wy)
      if (this.#onScreen(sx, sy)) {
        const bob = Math.sin(now / 160) * 2
        this.#tag(ctx, sx + 12, sy + 10 + bob, `${u.avatar} ${u.name} tekent${dots}`, u.color, 1)
      } else {
        this.#edgeMarker(ctx, sx, sy, wx, wy, u)
      }
    }
    for (const r of this.recent) {
      const [sx, sy] = this.toScreen(r.x, r.y)
      if (!this.#onScreen(sx, sy)) continue
      const u = this.#user(r.u)
      const a = Math.min(1, 2.6 - (now - r.t) / 1000)
      this.#tag(ctx, sx + 12, sy + 10, `${u.avatar} ${u.name} ✓`, u.color, a)
    }
  }

  #user(uid) {
    const u = this.users.find((x) => x.u === uid)
    return u ?? { u: uid, name: '…', avatar: '🙂', color: '#888888' }
  }

  #onScreen(sx, sy) {
    return sx > 0 && sy > 0 && sx < this.w && sy < this.h
  }

  /** Een gekleurd naamlabel (pilvorm) op schermcoördinaten. */
  #tag(ctx, x, y, text, color, alpha, alignEnd = false) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, alpha)
    ctx.font = `800 15px "Baloo 2", system-ui, sans-serif`
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(text).width + 18
    if (alignEnd) x -= tw
    x = Math.max(4, Math.min(x, this.w - tw - 4))
    ctx.shadowColor = 'rgba(0,0,0,.25)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 2
    ctx.fillStyle = color
    roundRect(ctx, x, y, tw, 26, 13)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = 'rgba(255,255,255,.9)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = contrastText(color)
    ctx.fillText(text, x + 9, y + 14)
    ctx.restore()
  }

  /** Iemand tekent buiten beeld: een rondje met zijn/haar dier aan de rand, met pijltje. */
  #edgeMarker(ctx, sx, sy, wx, wy, u) {
    // binnen de knoppenbalken blijven (gereedschap links, kleuren rechts)
    const mL = 120, mR = this.w - 125, mT = 100, mB = this.h - 40
    const cx = this.w / 2, cy = this.h / 2
    const dx = sx - cx, dy = sy - cy
    const t = Math.min(dx > 0 ? (mR - cx) / dx : dx < 0 ? (mL - cx) / dx : Infinity, dy > 0 ? (mB - cy) / dy : dy < 0 ? (mT - cy) / dy : Infinity)
    const x = cx + dx * t, y = cy + dy * t
    const a = Math.atan2(dy, dx)
    ctx.save()
    ctx.fillStyle = u.color
    ctx.translate(x, y)
    ctx.save()
    ctx.rotate(a)
    ctx.beginPath()
    ctx.moveTo(34, 0)
    ctx.lineTo(20, -10)
    ctx.lineTo(20, 10)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.arc(0, 0, 22, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.font = `22px ${EMOJI_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(u.avatar, 0, 1)
    ctx.restore()
    const right = x > this.w / 2
    this.#tag(ctx, right ? x - 28 : x + 28, y - 13, `${u.name} tekent daar`, u.color, 1, right)
    this.edgeHits.push({ x, y, wx, wy })
  }

  #drawMirrorGuides(ctx) {
    if (!this.mirror || !(BRUSH_TOOLS.includes(this.tool) || this.tool === 'shape')) return
    const cx = this.w / 2, cy = this.h / 2, R = Math.hypot(this.w, this.h)
    ctx.save()
    ctx.strokeStyle = 'rgba(168,85,247,.45)'
    ctx.lineWidth = 2
    ctx.setLineDash([10, 8])
    ctx.beginPath()
    const angles = this.mirror === 2 ? [Math.PI / 2] : this.mirror === 4 ? [0, Math.PI / 2] : [0, 1, 2].map((k) => Math.PI / 2 + (k * Math.PI) / 3)
    for (const a of angles) {
      ctx.moveTo(cx - Math.cos(a) * R, cy - Math.sin(a) * R)
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(168,85,247,.8)'
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
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
    try {
      this.live.setPointerCapture(e.pointerId)
    } catch {
      /* pointer al weg (bv. heel kort tikje): niet erg */
    }
    if (e.pointerType === 'pen') this.penSeen = true
    const p = this.#pos(e)
    // Tik op een pijltje aan de rand: vlieg naar wie daar tekent.
    const hit = this.edgeHits.find((h) => Math.hypot(h.x - p.x, h.y - p.y) < 30)
    if (hit && this.pointers.size === 0) {
      const s = Math.max(this.view.s, 0.3)
      this.fit([hit.wx - this.w / 3 / s, hit.wy - this.h / 3 / s, hit.wx + this.w / 3 / s, hit.wy + this.h / 3 / s])
      sound.join()
      return
    }
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
    return isColoringPage(this.sticker) ? 320 + this.size * 4 : 40 + this.size * 3
  }

  #toolDown(p) {
    const [wx, wy] = this.toWorld(p.x, p.y)
    // Het spiegelpunt is het midden van het scherm op het moment dat je begint.
    this.mirrorCenter = this.toWorld(this.w / 2, this.h / 2)
    if (this.tool === 'shape') {
      this.current = {
        sid: Math.random().toString(36).slice(2, 10),
        shape: this.shape,
        b: this.lastBrush,
        c: this.color,
        w: Math.max(this.size / this.view.s, 0.05),
        sd: (Math.random() * 1e9) >>> 0,
        a: [wx, wy],
        z: [wx, wy],
        p: [],
      }
      this.dirtyLive = true
      return
    }
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
      if (this.tool === 'glitter') sound.sparkle()
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
    if (c.shape) {
      c.z = [wx, wy]
      this.dirtyLive = true
      return
    }
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
    const copies = this.#copies(c.shape ? this.#shapePoints(c) : c.p)
    const raws = []
    if (c.shape && this.shapeFill && c.shape !== 'line') {
      const color = this.pattern === 'balls' ? nearestBall(c.c) : c.c
      for (const p of copies) raws.push({ id: this.#newId(), k: 'f', pat: this.pattern, c: color, sc: 36 / this.view.s, p })
    }
    for (const p of copies) raws.push({ id: this.#newId(), k: 's', b: c.b, c: c.c, w: c.w, sd: c.sd, p })
    if (!c.shape) this.net.volatile({ t: 'liveEnd', sid: c.sid })
    this.#commitMany(raws, c.shape ? undefined : c.sid)
    if (copies.length > 1) award('spiegel')
    if (c.shape) {
      sound.pop()
      if (count('shapes') >= 5) award('vormen')
    }
  }

  /** De punten van wat je nu tekent (bij een vorm: berekend uit begin- en eindpunt). */
  #currentPoints() {
    const c = this.current
    return c.shape ? this.#shapePoints(c) : c.p
  }

  /** Spiegelkopieën rond het spiegelpunt (inclusief het origineel). */
  #copies(p) {
    const n = this.mirror
    if (!n || !this.mirrorCenter || p.length < 2) return [p]
    const [cx, cy] = this.mirrorCenter
    const map = (fn) => {
      const out = new Array(p.length)
      for (let i = 0; i < p.length; i += 2) {
        const [x, y] = fn(p[i] - cx, p[i + 1] - cy)
        out[i] = Math.round((x + cx) * 10) / 10
        out[i + 1] = Math.round((y + cy) * 10) / 10
      }
      return out
    }
    if (n === 2) return [p, map((x, y) => [-x, y])]
    if (n === 4) return [p, map((x, y) => [-x, y]), map((x, y) => [x, -y]), map((x, y) => [-x, -y])]
    const out = [p]
    for (let k = 1; k < n; k++) {
      const a = (k * 2 * Math.PI) / n, ca = Math.cos(a), sa = Math.sin(a)
      out.push(map((x, y) => [x * ca - y * sa, x * sa + y * ca]))
    }
    return out
  }

  /** Punten voor een vorm tussen begin- (a) en eindpunt (z). Een tikje = een vorm op standaardgrootte. */
  #shapePoints(c) {
    let [x0, y0] = c.a, [x1, y1] = c.z
    if (Math.hypot(x1 - x0, y1 - y0) * this.view.s < 12) {
      const r = 70 / this.view.s
      if (c.shape === 'line') [x0, y0, x1, y1] = [x0 - r, y0, x0 + r, y0]
      else [x0, y0, x1, y1] = [x0 - r, y0 - r, x0 + r, y0 + r]
    }
    if (c.shape === 'line') return densify([x0, y0, x1, y1], false)
    const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1)
    const w = r - l, h = b - t, mx = (l + r) / 2, my = (t + b) / 2
    const pts = []
    if (c.shape === 'circle') {
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2
        pts.push(mx + Math.cos(a) * w / 2, my + Math.sin(a) * h / 2)
      }
      return round(pts)
    }
    if (c.shape === 'heart') {
      for (let i = 0; i <= 90; i++) {
        const a = (i / 90) * Math.PI * 2
        const x = 16 * Math.sin(a) ** 3
        const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))
        pts.push(mx + (x / 34) * w, t + ((y + 12) / 29) * h)
      }
      return round(pts)
    }
    if (c.shape === 'square') return densify([l, t, r, t, r, b, l, b], true)
    if (c.shape === 'triangle') return densify([mx, t, r, b, l, b], true)
    // ster: 5 punten, binnenstraal 45 %
    const poly = []
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const k = i % 2 ? 0.45 : 1
      poly.push(mx + Math.cos(a) * (w / 2) * k, my + Math.sin(a) * (h / 2) * k + h * 0.05)
    }
    return densify(poly, true)
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

  /** Iemand anders voegde iets toe: naamlabel laten hangen en stickers laten "poppen". */
  #othersAdded(uid, it) {
    const now = performance.now()
    let x, y
    if (it.k === 's' || it.k === 'f') [x, y] = [it.p[it.p.length - 2], it.p[it.p.length - 1]]
    else [x, y] = [it.x, it.y]
    // Spiegelkopieën komen vlak na elkaar: één label per persoon is genoeg.
    if (!this.recent.some((r) => r.u === uid && now - r.t < 300)) this.recent.push({ u: uid, x, y, t: now })
    this.drawing.delete(uid)
    if (it.k === 'k') {
      const [sx, sy] = this.toScreen(it.x, it.y)
      if (this.#onScreen(sx, sy)) this.#sparks(sx, sy)
    }
  }

  // ── Tekenuitdaging voor de hele ruimte ────────────────────────────────────
  #sendChallenge() {
    if (this.challenge && this.challenge.left > 0) {
      $('ideaBanner').hidden = false
      return
    }
    this.net.volatile({ t: 'idea', i: Math.floor(Math.random() * IDEAS.length) })
    award('uitdager')
  }

  #startChallenge(m) {
    this.#endChallenge()
    const idea = IDEAS[m.i % IDEAS.length]
    const el = $('ideaBanner')
    el.innerHTML = ''
    const who = document.createElement('div')
    who.className = 'idea-who'
    who.textContent = m.u === this.uid ? '💡 Jouw uitdaging voor iedereen:' : `💡 Uitdaging van ${m.avatar} ${m.name}:`
    const text = document.createElement('div')
    text.className = 'idea-text'
    text.textContent = idea
    const timer = document.createElement('div')
    timer.className = 'idea-timer'
    el.append(who, text, timer)
    el.hidden = false
    el.classList.remove('done')
    sound.join()
    this.challenge = { left: CHALLENGE_SECONDS, timer }
    const tick = () => {
      const c = this.challenge
      if (!c) return
      const m2 = Math.floor(c.left / 60), s2 = String(c.left % 60).padStart(2, '0')
      c.timer.textContent = `⏱️ ${m2}:${s2}`
      c.timer.classList.toggle('hurry', c.left <= 10)
      if (c.left <= 10 && c.left > 0) sound.tick2()
      if (c.left <= 0) {
        this.#finishChallenge()
        return
      }
      c.left--
      c.handle = setTimeout(tick, 1000)
    }
    tick()
  }

  #finishChallenge() {
    const el = $('ideaBanner')
    el.hidden = false
    el.classList.add('done')
    this.challenge.timer.textContent = '⏰ Tijd om! Kijk wat iedereen tekende 👀'
    confetti(120)
    sound.fanfare()
    if (!this.current && !this.gesture) this.home()
    this.challenge.handle = setTimeout(() => this.#endChallenge(), 6000)
  }

  #endChallenge() {
    if (this.challenge) clearTimeout(this.challenge.handle)
    this.challenge = null
    $('ideaBanner').hidden = true
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
    drawItems(ctx, this.items.values())
    return cv
  }

  async photo() {
    const b = [this.view.x, this.view.y, this.view.x + this.w / this.view.s, this.view.y + this.h / this.view.s]
    const cv = this.#renderTo(Math.round(this.w * 2), Math.round(this.h * 2), b)
    sound.camera()
    award('fotograaf')
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
      const list = tab === 'emoji' ? EMOJIS.map((e) => 'e:' + e) : tab === 'kleurplaat' ? STICKERS.filter(isColoringPage) : STICKERS.filter((x) => !isColoringPage(x))
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
          if (isColoringPage(id)) this.toast('🖍️ Plak de kleurplaat en kleur hem in. De lijnen blijven altijd bovenaan!')
          else if (!this.stickerHintShown) this.toast('Tik op het blad om te plakken!')
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

    // vormen
    const srow = $('shapeRow')
    for (const sh of SHAPES) {
      const b = document.createElement('button')
      b.dataset.shape = sh.id
      b.title = sh.label
      b.textContent = sh.icon
      b.onclick = () => {
        this.shape = sh.id
        srow.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
        sound.tick()
      }
      b.classList.toggle('on', sh.id === this.shape)
      srow.appendChild(b)
    }
    $('shapeFill').onchange = (e) => {
      this.shapeFill = e.target.checked
      sound.tick()
    }

    $('mirrorBtn').onclick = () => {
      const i = (MIRRORS.findIndex((m) => m.n === this.mirror) + 1) % MIRRORS.length
      this.mirror = MIRRORS[i].n
      $('mirrorBtn').querySelector('small').textContent = MIRRORS[i].label
      $('mirrorBtn').classList.toggle('on', this.mirror > 0)
      if (this.mirror && !BRUSH_TOOLS.includes(this.tool) && this.tool !== 'shape') this.setTool(this.lastBrush)
      // Pas na even wachten melden, zodat snel doorklikken geen stapel meldingen geeft.
      clearTimeout(this.mirrorToast)
      this.mirrorToast = setTimeout(() => {
        if (this.mirror) this.toast(this.mirror === 2 ? '🦋 Vlinder: wat je tekent, wordt gespiegeld!' : this.mirror === 4 ? '🦋 Vier keer gespiegeld!' : '✳️ Caleidoscoop: zes keer rondom!')
      }, 700)
      this.dirtyLive = true
      sound.sparkle()
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
        if (count('reactions') >= 10) award('fan')
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
    $('ideaBtn').onclick = () => this.#sendChallenge()
    $('ideaBanner').onclick = () => ($('ideaBanner').hidden = true)
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
    if (BRUSH_TOOLS.includes(id)) this.lastBrush = id
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === id))
    $('stickerSheet').hidden = id !== 'sticker' || (again && !$('stickerSheet').hidden)
    $('fillSheet').hidden = id !== 'fill'
    $('shapeSheet').hidden = id !== 'shape' || (again && !$('shapeSheet').hidden)
    if (id === 'fill' || id === 'shape') this.#updatePatternPreviews()
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
      b.dataset.u = u.u
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

function round(pts) {
  return pts.map((v) => Math.round(v * 10) / 10)
}

/** Extra punten op elke zijde, zodat het afronden bij het tekenen de hoeken niet wegpoetst. */
function densify(poly, closed) {
  const out = []
  const n = poly.length / 2
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const x0 = poly[i * 2], y0 = poly[i * 2 + 1]
    const j = (i + 1) % n
    const x1 = poly[j * 2], y1 = poly[j * 2 + 1]
    for (let k = 0; k < 8; k++) out.push(x0 + ((x1 - x0) * k) / 8, y0 + ((y1 - y0) * k) / 8)
  }
  out.push(closed ? poly[0] : poly[poly.length - 2], closed ? poly[1] : poly[poly.length - 1])
  return round(out)
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
    const mult = { marker: 1.1, neon: 1.5, spray: 1.3, balls: 0.6, glitter: 1 }[it.b] ?? 0.5
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
