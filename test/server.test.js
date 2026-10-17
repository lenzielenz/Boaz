// Integratietest: start de echte server met een tijdelijke datamap en laat twee
// "tablets" samen tekenen.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3900 + Math.floor(Math.random() * 90)
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'tekenclub-'))
let proc

async function startServer() {
  proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PIN: 'geheim' } })
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => d.toString().includes('draait') && resolve())
    proc.on('exit', () => reject(new Error('server stopte')))
  })
}

async function stopServer() {
  const p = proc
  await new Promise((r) => {
    p.once('exit', r)
    p.kill('SIGTERM')
  })
}

function client(name, key) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`)
  const inbox = []
  const waiters = []
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString())
    inbox.push(m)
    for (const w of [...waiters]) if (w.pred(m)) {
      waiters.splice(waiters.indexOf(w), 1)
      w.resolve(m)
    }
  })
  return {
    ws,
    inbox,
    open: () => new Promise((r) => ws.once('open', r)),
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 2000) =>
      new Promise((resolve, reject) => {
        const hit = inbox.find(pred)
        if (hit) return resolve(hit)
        const w = { pred, resolve }
        waiters.push(w)
        setTimeout(() => reject(new Error('timeout')), ms)
      }),
    hello() {
      this.send({ t: 'hello', name, avatar: '🦁', color: '#22c55e', key })
    },
  }
}

before(startServer)
after(async () => {
  if (proc && proc.exitCode === null) await stopServer()
  fs.rmSync(DATA, { recursive: true, force: true })
})

test('lobby toont de standaardruimtes en je kan er een maken', async () => {
  const r = await fetch(`http://localhost:${PORT}/api/rooms`)
  const { rooms } = await r.json()
  assert.ok(rooms.some((x) => x.id === 'krachtbalveld'))
  const c = await fetch(`http://localhost:${PORT}/api/rooms`, { method: 'POST', body: JSON.stringify({ name: 'U12 Sint-Michiels', bg: 'veld' }) })
  assert.equal(c.status, 201)
  const { room } = await c.json()
  assert.equal(room.id, 'u12-sint-michiels')
  const bad = await fetch(`http://localhost:${PORT}/api/rooms`, { method: 'POST', body: JSON.stringify({ name: '   ' }) })
  assert.equal(bad.status, 400)
})

test('twee tablets tekenen samen en het blijft bewaard', async () => {
  const a = client('Lotte', 'a'.repeat(32))
  const b = client('Mats', 'b'.repeat(32))
  await Promise.all([a.open(), b.open()])
  a.hello()
  b.hello()
  const wa = await a.wait((m) => m.t === 'welcome')
  await b.wait((m) => m.t === 'welcome')
  a.send({ t: 'join', room: 'vrij-tekenen' })
  await a.wait((m) => m.t === 'snapshot')
  b.send({ t: 'join', room: 'vrij-tekenen' })
  await b.wait((m) => m.t === 'snapshot')
  await a.wait((m) => m.t === 'hi' && m.name === 'Mats')

  // live lijn komt door bij de ander
  a.send({ t: 'live', sid: 's1', b: 'pen', c: '#ff0000', w: 5, sd: 1, pts: [0, 0, 5, 5] })
  const live = await b.wait((m) => m.t === 'live')
  assert.deepEqual(live.pts, [0, 0, 5, 5])

  a.send({ t: 'add', sid: 's1', item: { id: 'lijn-1', k: 's', b: 'pen', c: '#ff0000', w: 5, sd: 1, p: [0, 0, 5, 5] } })
  const add = await b.wait((m) => m.t === 'add')
  assert.equal(add.item.o, wa.owner)

  // Mats kan de lijn van Lotte niet wissen
  b.send({ t: 'del', id: 'lijn-1' })
  await new Promise((r) => setTimeout(r, 150))
  assert.ok(!a.inbox.some((m) => m.t === 'del'))

  // Lotte wel
  a.send({ t: 'add', item: { id: 'lijn-2', k: 'k', s: 'bal-geel', x: 10, y: 10, z: 50, r: 0 } })
  await b.wait((m) => m.t === 'add' && m.item.id === 'lijn-2')
  a.send({ t: 'del', id: 'lijn-2' })
  await b.wait((m) => m.t === 'del' && m.id === 'lijn-2')

  a.ws.close()
  b.ws.close()

  // herstart: de tekening is er nog
  await new Promise((r) => setTimeout(r, 900))
  await stopServer()
  await startServer()
  const c = client('Lotte', 'a'.repeat(32))
  await c.open()
  c.hello()
  await c.wait((m) => m.t === 'welcome')
  c.send({ t: 'join', room: 'vrij-tekenen' })
  const snap = await c.wait((m) => m.t === 'snapshot')
  assert.deepEqual(snap.items.map((i) => i.id), ['lijn-1'])
  c.ws.close()
})

test('beheer vraagt de pincode', async () => {
  const no = await fetch(`http://localhost:${PORT}/api/rooms/vrij-tekenen/clear`, { method: 'POST' })
  assert.equal(no.status, 403)
  const ok = await fetch(`http://localhost:${PORT}/api/rooms/vrij-tekenen/clear`, { method: 'POST', headers: { 'x-admin-pin': 'geheim' } })
  assert.equal(ok.status, 200)
})

test('geen pad-uitbraak bij statische bestanden', async () => {
  const r = await fetch(`http://localhost:${PORT}/..%2f..%2fpackage.json`)
  assert.notEqual(r.status, 200)
  const bad = await fetch(`http://localhost:${PORT}/%E0%A4%A`)
  assert.equal(bad.status, 400)
  assert.equal((await fetch(`http://localhost:${PORT}/health`)).status, 200)
})
