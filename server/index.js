// Krachtbal Tekenclub — server.
// Serveert de statische frontend, een kleine JSON-API voor de lobby en één
// WebSocket (/ws) voor het samen tekenen: live lijnen, cursors, reacties.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

import { Store } from './store.js'
import { AVATARS, BRUSHES, IDEA_COUNT, LIMITS, REACTIONS, cleanName, sanitizeItem } from '../public/js/shared.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(ROOT, '..', 'public')
const PORT = Number(process.env.PORT) || 3000
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(ROOT, '..', 'data')
const ADMIN_PIN = process.env.ADMIN_PIN || ''

const store = new Store(DATA_DIR)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

// ── Live-toestand per ruimte (niet opgeslagen) ─────────────────────────────
/** @type {Map<string, Set<Client>>} */
const roomClients = new Map()
/** Wanneer de laatste tekenuitdaging per ruimte startte (één tegelijk). */
const roomIdeaAt = new Map()
const IDEA_COOLDOWN = 20_000

/**
 * @typedef {{ ws: import('ws').WebSocket, uid: number, owner: string, name: string, avatar: string,
 *   color: string, room: string|null, bucket: number, lastFill: number, lastThumb: number, ip: string }} Client
 */

let nextUid = 1

function send(c, msg) {
  if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
}

function broadcast(room, msg, except) {
  const set = roomClients.get(room)
  if (!set) return
  const data = JSON.stringify(msg)
  for (const c of set) if (c !== except) send(c, data)
}

function userList(room) {
  return [...(roomClients.get(room) ?? [])].map((c) => ({ u: c.uid, name: c.name, avatar: c.avatar, color: c.color }))
}

function leaveRoom(c) {
  const room = c.room
  if (!room) return
  c.room = null
  const set = roomClients.get(room)
  if (set) {
    set.delete(c)
    if (set.size === 0) {
      roomClients.delete(room)
      roomIdeaAt.delete(room)
      store.markIdle(room)
    } else {
      broadcast(room, { t: 'gone', u: c.uid })
      broadcast(room, { t: 'users', list: userList(room) })
    }
  }
}

// Eenvoudige token-bucket per verbinding tegen spam (bv. een vastgelopen tablet).
function allow(c, cost = 1) {
  const now = Date.now()
  c.bucket = Math.min(2500, c.bucket + ((now - c.lastFill) / 1000) * 250)
  c.lastFill = now
  if (c.bucket < cost) return false
  c.bucket -= cost
  return true
}

const HEX = /^#[0-9a-f]{6}$/

function onMessage(c, raw) {
  let m
  try {
    m = JSON.parse(raw)
  } catch {
    return
  }
  if (!m || typeof m.t !== 'string') return
  if (!allow(c, m.t === 'add' ? 2 : 1)) return

  switch (m.t) {
    case 'hello': {
      c.name = cleanName(m.name) || 'Tekenaar'
      c.avatar = AVATARS.includes(m.avatar) ? m.avatar : AVATARS[0]
      c.color = HEX.test(m.color) ? m.color : '#06d6a0'
      // De eigenaar van je tekeningen is een hash van een geheim dat enkel jouw
      // toestel kent: zo kan niemand anders jouw lijnen wissen.
      const key = typeof m.key === 'string' && m.key.length >= 16 && m.key.length <= 64 ? m.key : crypto.randomUUID()
      c.owner = crypto.createHash('sha256').update(key).digest('hex').slice(0, 12)
      send(c, { t: 'welcome', u: c.uid, owner: c.owner })
      if (c.room) broadcast(c.room, { t: 'users', list: userList(c.room) })
      return
    }
    case 'join': {
      if (!c.owner || typeof m.room !== 'string' || !store.hasRoom(m.room)) {
        send(c, { t: 'err', code: 'noroom', msg: 'Deze ruimte bestaat niet (meer).' })
        return
      }
      leaveRoom(c)
      const r = store.open(m.room)
      c.room = m.room
      if (!roomClients.has(m.room)) roomClients.set(m.room, new Set())
      roomClients.get(m.room).add(c)
      const meta = store.listRooms().find((x) => x.id === m.room)
      send(c, { t: 'snapshot', room: meta, items: [...r.items.values()] })
      broadcast(m.room, { t: 'users', list: userList(m.room) })
      broadcast(m.room, { t: 'hi', u: c.uid, name: c.name, avatar: c.avatar }, c)
      return
    }
    case 'leave':
      leaveRoom(c)
      return
  }

  if (!c.room) return
  const room = c.room

  switch (m.t) {
    case 'live': {
      // Een lijn die nog getekend wordt: enkel doorsturen, niet bewaren.
      if (typeof m.sid !== 'string' || m.sid.length > 40 || !Array.isArray(m.pts) || m.pts.length > 400) return
      if (!m.pts.every((v) => typeof v === 'number' && Number.isFinite(v))) return
      const b = BRUSHES.includes(m.b) || m.b === 'lasso' ? m.b : 'pen'
      broadcast(room, { t: 'live', u: c.uid, sid: m.sid, b, c: HEX.test(m.c) ? m.c : '#000000', w: Number(m.w) || 4, sd: m.sd >>> 0, pts: m.pts }, c)
      return
    }
    case 'liveEnd':
      if (typeof m.sid === 'string') broadcast(room, { t: 'liveEnd', u: c.uid, sid: m.sid.slice(0, 40) }, c)
      return
    case 'add': {
      const item = sanitizeItem(m.item, c.owner)
      if (!item) return
      if (!store.add(room, item)) {
        send(c, { t: 'err', code: 'full', msg: 'Deze ruimte is vol! Maak een nieuwe ruimte aan.' })
        send(c, { t: 'del', id: item.id })
        return
      }
      broadcast(room, { t: 'add', item, sid: typeof m.sid === 'string' ? m.sid.slice(0, 40) : undefined, u: c.uid }, c)
      return
    }
    case 'del': {
      const r = store.open(room)
      const it = r.items.get(m.id)
      if (!it || it.o !== c.owner) return
      store.remove(room, m.id)
      broadcast(room, { t: 'del', id: m.id }, c)
      return
    }
    case 'cur':
      if (typeof m.x === 'number' && typeof m.y === 'number' && Number.isFinite(m.x + m.y))
        broadcast(room, { t: 'cur', u: c.uid, x: Math.round(m.x), y: Math.round(m.y) }, c)
      return
    case 'react':
      if (REACTIONS.includes(m.e) && Number.isFinite(m.x + m.y))
        broadcast(room, { t: 'react', u: c.uid, e: m.e, x: Math.round(m.x), y: Math.round(m.y) })
      return
    case 'idea': {
      // Een tekenuitdaging voor iedereen in de ruimte (ook de afzender, zodat de timers gelijk lopen).
      if (!Number.isInteger(m.i) || m.i < 0 || m.i >= IDEA_COUNT) return
      const now = Date.now()
      if (now - (roomIdeaAt.get(room) ?? 0) < IDEA_COOLDOWN) {
        send(c, { t: 'err', code: 'idea', msg: '💡 Er is net een uitdaging gestart. Even wachten!' })
        return
      }
      roomIdeaAt.set(room, now)
      broadcast(room, { t: 'idea', i: m.i, u: c.uid, name: c.name, avatar: c.avatar })
      return
    }
    case 'thumb': {
      // Kleine voorvertoning voor de lobby, gemaakt door een browser in de ruimte.
      const now = Date.now()
      if (now - c.lastThumb < 15_000 || typeof m.data !== 'string') return
      const prefix = 'data:image/png;base64,'
      if (!m.data.startsWith(prefix)) return
      const buf = Buffer.from(m.data.slice(prefix.length), 'base64')
      if (buf.length > LIMITS.maxThumbBytes || buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return
      c.lastThumb = now
      store.saveThumb(room, buf).catch(() => {})
      return
    }
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
const createLimiter = new Map() // ip -> [timestamps]

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req, max = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (d) => {
      size += d.length
      if (size > max) {
        reject(new Error('te groot'))
        req.destroy()
      } else chunks.push(d)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function clientIp(req) {
  return (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || '').trim()
}

function roomSummary(r) {
  const set = roomClients.get(r.id)
  return {
    id: r.id,
    name: r.name,
    bg: r.bg,
    count: r.count,
    updatedAt: r.updatedAt,
    thumb: r.thumbAt ? `/api/rooms/${r.id}/thumb?v=${r.thumbAt}` : null,
    live: set ? [...set].map((c) => ({ name: c.name, avatar: c.avatar })) : [],
  }
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean) // api, rooms, :id, action
  if (parts[1] !== 'rooms') return json(res, 404, { error: 'niet gevonden' })

  if (parts.length === 2 && req.method === 'GET') {
    const list = store
      .listRooms()
      .map(roomSummary)
      .sort((a, b) => b.live.length - a.live.length || b.updatedAt - a.updatedAt)
    return json(res, 200, { rooms: list })
  }

  if (parts.length === 2 && req.method === 'POST') {
    const ip = clientIp(req)
    const recent = (createLimiter.get(ip) ?? []).filter((t) => Date.now() - t < 3_600_000)
    if (recent.length >= 15) return json(res, 429, { error: 'Je hebt al veel ruimtes gemaakt. Probeer later opnieuw.' })
    try {
      const body = await readBody(req)
      const room = store.createRoom(body.name, body.bg)
      recent.push(Date.now())
      createLimiter.set(ip, recent)
      return json(res, 201, { room: roomSummary(room) })
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : 'Ongeldig' })
    }
  }

  const id = parts[2]
  if (!id || !store.hasRoom(id)) return json(res, 404, { error: 'Ruimte niet gevonden' })

  if (parts[3] === 'thumb' && req.method === 'GET') {
    fs.readFile(store.thumbPath(id), (err, buf) => {
      if (err) return json(res, 404, { error: 'geen voorbeeld' })
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' })
      res.end(buf)
    })
    return
  }

  // Beheer: enkel met de ADMIN_PIN uit de omgeving (anders uitgeschakeld).
  if ((parts[3] === 'clear' || parts[3] === 'delete') && req.method === 'POST') {
    const pin = req.headers['x-admin-pin']
    if (!ADMIN_PIN || typeof pin !== 'string' || pin.length !== ADMIN_PIN.length ||
      !crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(ADMIN_PIN))) {
      return json(res, 403, { error: 'Geen toegang' })
    }
    if (parts[3] === 'clear') {
      store.clear(id)
      broadcast(id, { t: 'cleared' })
    } else {
      broadcast(id, { t: 'err', code: 'noroom', msg: 'Deze ruimte werd verwijderd.' })
      for (const c of roomClients.get(id) ?? []) leaveRoom(c)
      store.deleteRoom(id)
    }
    return json(res, 200, { ok: true })
  }

  return json(res, 404, { error: 'niet gevonden' })
}

function serveStatic(req, res, url) {
  let rel
  try {
    rel = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400).end()
    return
  }
  if (rel === '/' || rel.startsWith('/r/')) rel = '/index.html'
  const file = path.normalize(path.join(PUBLIC, rel))
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403).end()
    return
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Niet gevonden')
      return
    }
    const ext = path.extname(file)
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    })
    res.end(buf)
  })
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (url.pathname === '/health') return json(res, 200, { ok: true })
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(() => json(res, 500, { error: 'serverfout' }))
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'methode' })
  serveStatic(req, res, url)
})

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 })

wss.on('connection', (ws, req) => {
  /** @type {Client} */
  const c = {
    ws, uid: nextUid++, owner: '', name: 'Tekenaar', avatar: AVATARS[0], color: '#06d6a0', room: null,
    bucket: 2500, lastFill: Date.now(), lastThumb: 0, ip: clientIp(req),
  }
  ws.isAlive = true
  ws.on('pong', () => (ws.isAlive = true))
  ws.on('message', (data) => onMessage(c, data.toString()))
  ws.on('close', () => leaveRoom(c))
  ws.on('error', () => {})
})

// Dode verbindingen (tablet dichtgeklapt) opruimen.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, 25_000)

server.listen(PORT, () => {
  console.log(`Krachtbal Tekenclub draait op http://localhost:${PORT} (data: ${DATA_DIR})`)
})

function shutdown() {
  clearInterval(heartbeat)
  store.close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
