// Medailles om te verzamelen. Ze staan enkel op dit toestel (localStorage):
// geen ranglijst, geen wedstrijd tussen kinderen — gewoon iets leuks om te ontdekken.

export const MEDALS = [
  { id: 'eerste', icon: '✏️', name: 'Eerste lijn', how: 'Teken je allereerste lijn' },
  { id: 'tekenaar', icon: '🖌️', name: 'Tekenaar', how: 'Teken 25 lijnen' },
  { id: 'kunstenaar', icon: '🎨', name: 'Kunstenaar', how: 'Teken 150 lijnen' },
  { id: 'plakker', icon: '⭐', name: 'Stickerkoning', how: 'Plak 10 stickers' },
  { id: 'ballen', icon: '🏐', name: 'Ballenkenner', how: 'Gebruik alle 5 krachtbal-stickers' },
  { id: 'regenboog', icon: '🌈', name: 'Regenboogster', how: 'Teken met de regenboog' },
  { id: 'glitter', icon: '💎', name: 'Glitterfee', how: 'Teken met glitter' },
  { id: 'spiegel', icon: '🦋', name: 'Spiegelmeester', how: 'Teken met de spiegel aan' },
  { id: 'vormen', icon: '🔷', name: 'Vormenbouwer', how: 'Maak 5 vormen' },
  { id: 'inkleuren', icon: '🖍️', name: 'Inkleurder', how: 'Plak een kleurplaat' },
  { id: 'vuller', icon: '🪣', name: 'Opvuller', how: 'Vul 5 vormen op' },
  { id: 'team', icon: '🤝', name: 'Teamspeler', how: 'Teken samen met 3 of meer kinderen' },
  { id: 'uitdager', icon: '💡', name: 'Uitdager', how: 'Start een tekenuitdaging' },
  { id: 'fotograaf', icon: '📷', name: 'Fotograaf', how: 'Maak een foto van een tekening' },
  { id: 'fan', icon: '👏', name: 'Grote fan', how: 'Stuur 10 reacties' },
  { id: 'ontdekker', icon: '🧭', name: 'Ontdekker', how: 'Bezoek 3 verschillende ruimtes' },
]

let state = { got: {}, n: {}, sets: {} }
try {
  const raw = JSON.parse(localStorage.getItem('tc-medals') || 'null')
  if (raw && typeof raw === 'object') state = { got: raw.got ?? {}, n: raw.n ?? {}, sets: raw.sets ?? {} }
} catch {}

let onAward = () => {}
export function onMedal(fn) {
  onAward = fn
}

function save() {
  try {
    localStorage.setItem('tc-medals', JSON.stringify(state))
  } catch {}
}

export function award(id) {
  if (state.got[id]) return
  const m = MEDALS.find((x) => x.id === id)
  if (!m) return
  state.got[id] = Date.now()
  save()
  onAward(m)
}

/** Teller ophogen; geeft de nieuwe stand terug. */
export function count(key, by = 1) {
  state.n[key] = (state.n[key] ?? 0) + by
  save()
  return state.n[key]
}

/** Iets toevoegen aan een verzameling (bv. welke balkleuren je al plakte); geeft de grootte terug. */
export function collect(key, value) {
  const set = new Set(state.sets[key] ?? [])
  set.add(value)
  state.sets[key] = [...set].slice(0, 50)
  save()
  return set.size
}

export const hasMedal = (id) => !!state.got[id]
export const medalCount = () => Object.keys(state.got).length
