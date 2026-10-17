// Opstart: inloggen met een naam, de lobby met ruimtes, en het tekenbord.

import { AVATARS } from './shared.js'
import { Net } from './net.js'
import { Board } from './board.js'
import { stickerUrl } from './stickers.js'
import { sound } from './sound.js'
import { MEDALS, hasMedal, medalCount, onMedal } from './medals.js'
import { confetti } from './fx.js'

const $ = (id) => document.getElementById(id)
const PROFILE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06d6a0', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

// ── Profiel (lokaal op dit toestel) ──────────────────────────────────────────
function loadProfile() {
  let p = {}
  try {
    p = JSON.parse(localStorage.getItem('tc-profile') || '{}')
  } catch {}
  if (typeof p.key !== 'string' || p.key.length < 16) {
    const a = new Uint8Array(16)
    crypto.getRandomValues(a)
    p.key = [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  if (!AVATARS.includes(p.avatar)) p.avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)]
  if (!PROFILE_COLORS.includes(p.color)) p.color = PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)]
  return p
}
const profile = loadProfile()
function saveProfile() {
  try {
    localStorage.setItem('tc-profile', JSON.stringify(profile))
  } catch {}
}

// ── Meldingen ────────────────────────────────────────────────────────────────
function toast(msg) {
  if ([...$('toasts').children].some((t) => t.textContent === msg)) return
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  $('toasts').appendChild(el)
  setTimeout(() => el.remove(), 3200)
}

// Nieuwe medaille: groot in beeld, met confetti. Meerdere tegelijk? Netjes na elkaar.
let medalFreeAt = 0
onMedal((m) => {
  const now = Date.now()
  const at = Math.max(now, medalFreeAt)
  medalFreeAt = at + 2400
  setTimeout(() => showMedal(m), at - now)
})

function showMedal(m) {
  const el = document.createElement('div')
  el.className = 'medal-pop'
  const icon = document.createElement('div')
  icon.className = 'medal-icon'
  icon.textContent = m.icon
  const txt = document.createElement('div')
  const small = document.createElement('small')
  small.textContent = 'Nieuwe medaille!'
  const b = document.createElement('b')
  b.textContent = m.name
  txt.append(small, b)
  el.append(icon, txt)
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3800)
  confetti(70)
  sound.fanfare()
  $('medalCount').textContent = medalCount()
}

function openMedals() {
  const grid = $('medalGrid')
  grid.innerHTML = ''
  for (const m of MEDALS) {
    const got = hasMedal(m.id)
    const card = document.createElement('div')
    card.className = 'medal-card' + (got ? ' got' : '')
    const icon = document.createElement('div')
    icon.className = 'medal-icon'
    icon.textContent = got ? m.icon : '🔒'
    const name = document.createElement('b')
    name.textContent = m.name
    const how = document.createElement('small')
    how.textContent = m.how
    card.append(icon, name, how)
    grid.appendChild(card)
  }
  $('medalSub').textContent = `Je hebt er ${medalCount()} van de ${MEDALS.length}. Kan jij ze allemaal verzamelen?`
  $('medalDlg').showModal()
}
$('medalBtn').onclick = openMedals

// ── Verbinding + bord ────────────────────────────────────────────────────────
const net = new Net({
  onMessage: (m) => {
    if (m.t === 'err' && m.code === 'noroom') {
      toast(m.msg)
      go('/')
      return
    }
    board.handle(m)
  },
  onStatus: (s) => {
    const d = $('netDot')
    d.className = 'net-dot ' + (s === 'online' ? '' : s)
    d.title = s === 'online' ? 'Verbonden' : s === 'connecting' ? 'Verbinden…' : 'Geen verbinding — we proberen opnieuw'
  },
})
const board = new Board({ net, toast })

function sendHello() {
  net.setHello({ t: 'hello', name: profile.name, avatar: profile.avatar, color: profile.color, key: profile.key })
}

// ── Schermen ─────────────────────────────────────────────────────────────────
function show(id) {
  for (const s of ['login', 'lobby', 'board']) $(s).hidden = s !== id
}

function go(path, replace = false) {
  if (location.pathname !== path) history[replace ? 'replaceState' : 'pushState'](null, '', path)
  route()
}

let lobbyTimer = null
function route() {
  clearInterval(lobbyTimer)
  if (!profile.name) {
    if (board.active) board.close()
    showLogin()
    return
  }
  const m = location.pathname.match(/^\/r\/([a-z0-9-]+)$/i)
  if (m) {
    show('board')
    if (board.room?.id !== m[1]) {
      if (board.active) board.close()
      board.open(m[1])
    }
    return
  }
  if (board.active) board.close()
  show('lobby')
  renderMe()
  loadRooms()
  lobbyTimer = setInterval(loadRooms, 4000)
}
window.addEventListener('popstate', route)

// ── Inloggen ─────────────────────────────────────────────────────────────────
function showLogin() {
  show('login')
  $('nameInput').value = profile.name ?? ''
  const ap = $('avatarPick')
  ap.innerHTML = ''
  for (const a of AVATARS) {
    const b = document.createElement('button')
    b.textContent = a
    b.classList.toggle('on', a === profile.avatar)
    b.onclick = () => {
      profile.avatar = a
      ap.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
      sound.tick()
    }
    ap.appendChild(b)
  }
  const cp = $('colorPick')
  cp.innerHTML = ''
  for (const c of PROFILE_COLORS) {
    const b = document.createElement('button')
    b.style.background = c
    b.title = c
    b.classList.toggle('on', c === profile.color)
    b.onclick = () => {
      profile.color = c
      cp.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
      sound.tick()
    }
    cp.appendChild(b)
  }
  startFloatingBalls()
  setTimeout(() => $('nameInput').focus(), 50)
}

function doLogin() {
  const name = $('nameInput').value.replace(/\s+/g, ' ').trim().slice(0, 16)
  if (!name) {
    $('nameInput').focus()
    $('nameInput').animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'none' }], { duration: 250, iterations: 2 })
    return
  }
  profile.name = name
  saveProfile()
  sendHello()
  sound.join()
  route()
}
$('loginBtn').onclick = doLogin
$('nameInput').onkeydown = (e) => {
  if (e.key === 'Enter') doLogin()
}

let ballsStarted = false
function startFloatingBalls() {
  if (ballsStarted) return
  ballsStarted = true
  const box = document.querySelector('.floating-balls')
  const ids = ['bal-oranje', 'bal-geel', 'bal-rood', 'bal-blauw', 'bal-wit', 'ster', 'logo']
  for (let i = 0; i < 14; i++) {
    const img = document.createElement('img')
    img.src = stickerUrl(ids[i % ids.length])
    const size = 40 + Math.random() * 60
    img.style.width = img.style.height = size + 'px'
    img.style.left = Math.random() * 100 + '%'
    img.style.animationDuration = 9 + Math.random() * 10 + 's'
    img.style.animationDelay = -Math.random() * 18 + 's'
    img.alt = ''
    box.appendChild(img)
  }
}

// ── Lobby ────────────────────────────────────────────────────────────────────
function renderMe() {
  const b = $('meBtn')
  b.innerHTML = ''
  const av = document.createElement('span')
  av.className = 'av'
  av.style.background = profile.color
  av.textContent = profile.avatar
  b.append(av, profile.name)
  $('medalCount').textContent = medalCount()
}
$('meBtn').onclick = () => showLogin()

const BG_LABEL = { veld: 'Krachtbalveld', wit: 'Wit blad', ruitjes: 'Ruitjes', nacht: 'Nacht' }

async function loadRooms() {
  let data
  try {
    const r = await fetch('/api/rooms', { cache: 'no-store' })
    data = await r.json()
  } catch {
    return
  }
  if ($('lobby').hidden) return
  const grid = $('roomGrid')
  grid.innerHTML = ''

  const add = document.createElement('button')
  add.className = 'room-card new'
  add.innerHTML = '<div><span class="plus">＋</span>Nieuwe ruimte</div>'
  add.onclick = openNewRoom
  grid.appendChild(add)

  for (const room of data.rooms) {
    const card = document.createElement('button')
    card.className = 'room-card'
    const thumb = document.createElement('div')
    thumb.className = 'room-thumb ' + room.bg
    if (room.thumb) {
      const img = document.createElement('img')
      img.src = room.thumb
      img.alt = ''
      thumb.appendChild(img)
    }
    if (room.live.length) {
      const badge = document.createElement('span')
      badge.className = 'live-badge'
      badge.textContent = `LIVE · ${room.live.length} ${room.live.length === 1 ? 'tekenaar' : 'tekenaars'}`
      thumb.appendChild(badge)
      const avs = document.createElement('div')
      avs.className = 'live-avatars'
      for (const u of room.live.slice(0, 5)) {
        const s = document.createElement('span')
        s.textContent = u.avatar
        s.title = u.name
        avs.appendChild(s)
      }
      thumb.appendChild(avs)
    }
    const info = document.createElement('div')
    info.className = 'room-info'
    const h = document.createElement('h3')
    h.textContent = room.name
    const p = document.createElement('p')
    p.textContent = `${BG_LABEL[room.bg] ?? ''} · ${room.count ? `${room.count} tekeningetjes` : 'nog leeg — begin jij?'}`
    info.append(h, p)
    card.append(thumb, info)
    card.onclick = () => {
      sound.pop()
      go('/r/' + room.id)
    }
    grid.appendChild(card)
  }
}

function openNewRoom() {
  const dlg = $('newRoomDlg')
  $('roomNameInput').value = ''
  $('newRoomErr').textContent = ''
  dlg.showModal()
  setTimeout(() => $('roomNameInput').focus(), 50)
}

$('newRoomForm').addEventListener('submit', async (e) => {
  const submitter = e.submitter
  if (submitter?.value !== 'ok') return
  e.preventDefault()
  const name = $('roomNameInput').value.trim()
  const bg = new FormData($('newRoomForm')).get('bg')
  try {
    const r = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, bg }),
    })
    const data = await r.json()
    if (!r.ok) {
      $('newRoomErr').textContent = data.error ?? 'Dat lukte niet'
      return
    }
    $('newRoomDlg').close()
    sound.join()
    go('/r/' + data.room.id)
  } catch {
    $('newRoomErr').textContent = 'Geen verbinding met de server'
  }
})

$('backBtn').onclick = () => go('/')

// ── Start ────────────────────────────────────────────────────────────────────
if (profile.name) sendHello()
route()
