// Opslag van de ruimtes. Elke ruimte is een append-only logboek (NDJSON) van
// "toegevoegd"/"verwijderd"-events; de huidige tekening wordt daaruit afgeleid
// (zelfde idee als de worp-events in Krachtbal Live). Bij het laden wordt het
// logboek gecompacteerd als het veel verwijderde items bevat.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

import { BACKGROUNDS, LIMITS, cleanName } from '../public/js/shared.js'

const DEFAULT_ROOMS = [
  { id: 'krachtbalveld', name: 'Het grote krachtbalveld', bg: 'veld' },
  { id: 'vrij-tekenen', name: 'Vrij tekenen', bg: 'wit' },
  { id: 'ballenparadijs', name: 'Ballenparadijs', bg: 'ruitjes' },
  { id: 'sterrennacht', name: 'Sterrennacht', bg: 'nacht' },
]

export class Store {
  constructor(dir) {
    this.dir = dir
    this.roomDir = path.join(dir, 'rooms')
    this.thumbDir = path.join(dir, 'thumbs')
    fs.mkdirSync(this.roomDir, { recursive: true })
    fs.mkdirSync(this.thumbDir, { recursive: true })
    this.metaFile = path.join(dir, 'rooms.json')
    /** @type {Map<string, {id:string,name:string,bg:string,createdAt:number,count:number,updatedAt:number}>} */
    this.meta = new Map()
    /** @type {Map<string, {items: Map<string, any>, pending: string[], idleSince: number|null}>} */
    this.loaded = new Map()
    this.metaDirty = false
    this.#loadMeta()
    this.flushTimer = setInterval(() => this.flush(), 700)
    this.flushTimer.unref?.()
  }

  #loadMeta() {
    try {
      const list = JSON.parse(fs.readFileSync(this.metaFile, 'utf8'))
      for (const r of list) this.meta.set(r.id, r)
    } catch {
      /* eerste start */
    }
    for (const r of DEFAULT_ROOMS) {
      if (!this.meta.has(r.id)) {
        this.meta.set(r.id, { ...r, createdAt: Date.now(), updatedAt: Date.now(), count: 0 })
        this.metaDirty = true
      }
    }
  }

  listRooms() {
    return [...this.meta.values()]
  }

  hasRoom(id) {
    return this.meta.has(id)
  }

  createRoom(name, bg) {
    const clean = cleanName(name, LIMITS.maxRoomName)
    if (!clean) throw new Error('Geef je ruimte een naam')
    if (!BACKGROUNDS.includes(bg)) bg = 'wit'
    if (this.meta.size >= LIMITS.maxRooms) throw new Error('Er zijn al te veel ruimtes')
    const slug = clean
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'ruimte'
    let id = slug
    while (this.meta.has(id)) id = `${slug}-${crypto.randomBytes(2).toString('hex')}`
    const room = { id, name: clean, bg, createdAt: Date.now(), updatedAt: Date.now(), count: 0 }
    this.meta.set(id, room)
    this.metaDirty = true
    return room
  }

  /** Laadt de items van een ruimte in het geheugen (of geeft ze terug als ze al geladen zijn). */
  open(id) {
    let r = this.loaded.get(id)
    if (r) {
      r.idleSince = null
      return r
    }
    const items = new Map()
    const file = this.#file(id)
    let lines = 0
    try {
      const txt = fs.readFileSync(file, 'utf8')
      for (const line of txt.split('\n')) {
        if (!line) continue
        lines++
        try {
          const ev = JSON.parse(line)
          if (ev.a) items.set(ev.a.id, ev.a)
          else if (ev.d) items.delete(ev.d)
          else if (ev.clear) items.clear()
        } catch {
          /* een half geschreven laatste regel na een crash: overslaan */
        }
      }
    } catch {
      /* nog leeg */
    }
    r = { items, pending: [], idleSince: null }
    this.loaded.set(id, r)
    if (lines > items.size * 1.5 + 500) this.#compact(id, r)
    const m = this.meta.get(id)
    if (m && m.count !== items.size) {
      m.count = items.size
      this.metaDirty = true
    }
    return r
  }

  add(id, item) {
    const r = this.open(id)
    if (r.items.size >= LIMITS.maxItemsPerRoom) return false
    r.items.set(item.id, item)
    r.pending.push(JSON.stringify({ a: item }))
    this.#touch(id, r)
    return true
  }

  remove(id, itemId) {
    const r = this.open(id)
    if (!r.items.delete(itemId)) return false
    r.pending.push(JSON.stringify({ d: itemId }))
    this.#touch(id, r)
    return true
  }

  clear(id) {
    const r = this.open(id)
    r.items.clear()
    r.pending.push(JSON.stringify({ clear: 1 }))
    this.#touch(id, r)
  }

  deleteRoom(id) {
    this.loaded.delete(id)
    this.meta.delete(id)
    this.metaDirty = true
    fs.rm(this.#file(id), { force: true }, () => {})
    fs.rm(this.thumbPath(id), { force: true }, () => {})
  }

  markIdle(id) {
    const r = this.loaded.get(id)
    if (r) r.idleSince = Date.now()
  }

  thumbPath(id) {
    return path.join(this.thumbDir, `${id}.png`)
  }

  async saveThumb(id, buf) {
    const tmp = this.thumbPath(id) + '.tmp'
    await fsp.writeFile(tmp, buf)
    await fsp.rename(tmp, this.thumbPath(id))
    const m = this.meta.get(id)
    if (m) {
      m.thumbAt = Date.now()
      this.metaDirty = true
    }
  }

  #touch(id, r) {
    const m = this.meta.get(id)
    if (m) {
      m.count = r.items.size
      m.updatedAt = Date.now()
      this.metaDirty = true
    }
  }

  #file(id) {
    return path.join(this.roomDir, `${id}.ndjson`)
  }

  #compact(id, r) {
    const tmp = this.#file(id) + '.tmp'
    const body = [...r.items.values()].map((it) => JSON.stringify({ a: it })).join('\n')
    fs.writeFileSync(tmp, body ? body + '\n' : '')
    fs.renameSync(tmp, this.#file(id))
  }

  /** Schrijft openstaande events weg en ruimt lang ongebruikte ruimtes uit het geheugen op. */
  flush() {
    for (const [id, r] of this.loaded) {
      if (r.pending.length) {
        const chunk = r.pending.join('\n') + '\n'
        r.pending = []
        fs.appendFileSync(this.#file(id), chunk)
      }
      if (r.idleSince && Date.now() - r.idleSince > 10 * 60_000) this.loaded.delete(id)
    }
    if (this.metaDirty) {
      this.metaDirty = false
      const tmp = this.metaFile + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify([...this.meta.values()], null, 1))
      fs.renameSync(tmp, this.metaFile)
    }
  }

  close() {
    clearInterval(this.flushTimer)
    this.flush()
  }
}
