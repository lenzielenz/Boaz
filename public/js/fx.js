// Confetti! Losse DOM-snippers die naar beneden dwarrelen (geen canvas nodig).

const COLORS = ['#ffd166', '#06d6a0', '#ff5d6c', '#4cc9f0', '#f97316', '#a855f7', '#facc15']

export function confetti(n = 80) {
  const box = document.createElement('div')
  box.className = 'confetti'
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i')
    c.style.left = Math.random() * 100 + '%'
    c.style.background = COLORS[i % COLORS.length]
    c.style.animationDelay = Math.random() * 0.5 + 's'
    c.style.animationDuration = 1.6 + Math.random() * 1.4 + 's'
    c.style.setProperty('--drift', (Math.random() - 0.5) * 200 + 'px')
    c.style.setProperty('--spin', (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720) + 'deg')
    if (i % 3 === 0) c.style.borderRadius = '50%'
    box.appendChild(c)
  }
  document.body.appendChild(box)
  setTimeout(() => box.remove(), 3600)
}
