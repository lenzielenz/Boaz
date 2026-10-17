// Kleine geluidjes met WebAudio (geen bestanden nodig). Bewust zacht.

let ac = null
function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ac = new AC()
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {})
  return ac
}

function tone(f0, f1, dur, type = 'sine', vol = 0.12, delay = 0) {
  if (!sound.enabled) return
  const a = ctx()
  if (!a) return
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

export const sound = {
  enabled: true,
  pop: () => tone(500, 1100, 0.12, 'triangle', 0.14),
  tick: () => tone(1200, 900, 0.04, 'square', 0.03),
  boing: () => tone(180, 520, 0.18, 'sine', 0.12),
  fill: () => {
    tone(300, 700, 0.15, 'triangle', 0.1)
    tone(500, 1000, 0.15, 'triangle', 0.08, 0.08)
  },
  erase: () => tone(800, 300, 0.07, 'sawtooth', 0.03),
  undo: () => tone(700, 350, 0.1, 'triangle', 0.08),
  join: () => {
    tone(660, 660, 0.1, 'sine', 0.08)
    tone(880, 880, 0.14, 'sine', 0.08, 0.1)
  },
  camera: () => tone(2000, 400, 0.12, 'square', 0.05),
}
