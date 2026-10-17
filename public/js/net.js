// WebSocket-verbinding met automatisch herverbinden. Berichten die je verstuurt
// terwijl de verbinding even weg is (wifi in de sporthal...), worden bewaard en
// na het opnieuw binnenkomen in de ruimte alsnog verstuurd.

export class Net {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage
    this.onStatus = onStatus
    this.ws = null
    this.queue = []
    this.ready = false // verbonden én (indien nodig) terug in de ruimte
    this.hello = null
    this.room = null
    this.retry = 0
    this.connect()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && (!this.ws || this.ws.readyState > 1)) this.connect()
    })
  }

  connect() {
    clearTimeout(this.timer)
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    this.ws = ws
    this.onStatus('connecting')
    ws.onopen = () => {
      this.retry = 0
      if (this.hello) this.raw(this.hello)
      if (this.room) this.raw({ t: 'join', room: this.room })
      else this.markReady()
      this.onStatus('online')
    }
    ws.onmessage = (e) => {
      let m
      try {
        m = JSON.parse(e.data)
      } catch {
        return
      }
      this.onMessage(m)
      if (m.t === 'snapshot') this.markReady()
    }
    ws.onclose = () => {
      this.ready = false
      this.onStatus('offline')
      const delay = Math.min(8000, 400 * 2 ** this.retry++) + Math.random() * 300
      this.timer = setTimeout(() => this.connect(), delay)
    }
    ws.onerror = () => ws.close()
  }

  markReady() {
    this.ready = true
    // Rustig in stukjes doorsturen, zodat de spamrem van de server niets weggooit.
    // Zolang er nog wachtrij is, komt nieuw werk achteraan (volgorde blijft juist).
    clearTimeout(this.flushTimer)
    const step = () => {
      if (!this.ready || this.ws?.readyState !== 1) return
      for (const m of this.queue.splice(0, 50)) this.raw(m)
      if (this.queue.length) this.flushTimer = setTimeout(step, 400)
    }
    step()
  }

  raw(m) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m))
  }

  setHello(m) {
    this.hello = m
    this.raw(m)
  }

  join(room) {
    this.room = room
    this.ready = false
    this.queue = []
    this.raw({ t: 'join', room })
  }

  leave() {
    this.room = null
    this.queue = []
    this.raw({ t: 'leave' })
  }

  /** Belangrijke berichten (toevoegen/wissen): worden bewaard als je offline bent. */
  send(m) {
    if (this.ready && this.ws?.readyState === 1 && !this.queue.length) this.raw(m)
    else if (this.queue.length < 2000) this.queue.push(m)
  }

  /** Vluchtige berichten (cursor, live lijn): weg is weg. */
  volatile(m) {
    if (this.ready) this.raw(m)
  }
}
