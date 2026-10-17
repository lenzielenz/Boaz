import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cleanName, itemBounds, sanitizeItem } from '../public/js/shared.js'

test('een geldige lijn blijft over, met de eigenaar van de server', () => {
  const it = sanitizeItem({ id: 'ab-1', k: 's', b: 'pen', c: '#ff0000', w: 4, sd: 7, p: [0, 0, 10.123, 5], o: 'vals', extra: 1 }, 'echt')
  assert.deepEqual(it, { id: 'ab-1', k: 's', o: 'echt', b: 'pen', c: '#ff0000', w: 4, sd: 7, p: [0, 0, 10.1, 5] })
})

test('ongeldige items worden geweigerd', () => {
  assert.equal(sanitizeItem({ id: 'x', k: 's', b: 'laser', c: '#ff0000', w: 4, p: [0, 0] }, 'o'), null)
  assert.equal(sanitizeItem({ id: 'x', k: 's', b: 'pen', c: 'red', w: 4, p: [0, 0] }, 'o'), null)
  assert.equal(sanitizeItem({ id: 'x', k: 's', b: 'pen', c: '#ff0000', w: 4, p: [0, 0, 1] }, 'o'), null)
  assert.equal(sanitizeItem({ id: 'x', k: 's', b: 'pen', c: '#ff0000', w: 4, p: [0, Infinity] }, 'o'), null)
  assert.equal(sanitizeItem({ id: '<script>', k: 's', b: 'pen', c: '#ff0000', w: 4, p: [0, 0] }, 'o'), null)
  assert.equal(sanitizeItem({ id: 'x', k: 'k', s: 'onbekend', x: 0, y: 0, z: 10, r: 0 }, 'o'), null)
  assert.equal(sanitizeItem({ id: 'x', k: 'f', pat: 'solid', c: '#ff0000', sc: 1, p: [0, 0, 1, 1] }, 'o'), null)
  assert.equal(sanitizeItem({ id: 'x', k: 's', b: 'pen', c: '#ff0000', w: 4, p: new Array(10_000).fill(1) }, 'o'), null)
})

test('stickers, emoji en tekst', () => {
  assert.ok(sanitizeItem({ id: 'a', k: 'k', s: 'bal-rood', x: 1, y: 2, z: 50, r: 0.1 }, 'o'))
  assert.ok(sanitizeItem({ id: 'a', k: 'k', s: 'e:🔥', x: 1, y: 2, z: 50, r: 0 }, 'o'))
  assert.ok(sanitizeItem({ id: 'a', k: 'k', s: 'kp-leeuw', x: 1, y: 2, z: 500, r: 0 }, 'o'))
  assert.ok(sanitizeItem({ id: 'a', k: 's', b: 'glitter', c: '#ff00aa', w: 8, sd: 3, p: [0, 0, 9, 9] }, 'o'))
  assert.equal(sanitizeItem({ id: 'a', k: 'k', s: 'e:💩', x: 1, y: 2, z: 50, r: 0 }, 'o'), null)
  const t = sanitizeItem({ id: 'a', k: 't', v: '  Hup\u0000 Sint-Michiels!  ', c: '#000000', x: 0, y: 0, z: 20 }, 'o')
  assert.equal(t.v, 'Hup Sint-Michiels!')
  assert.equal(sanitizeItem({ id: 'a', k: 't', v: '   ', c: '#000000', x: 0, y: 0, z: 20 }, 'o'), null)
})

test('namen worden opgekuist', () => {
  assert.equal(cleanName('  Lotte <b>  '), 'Lotte b')
  assert.equal(cleanName('Ëlise-Marie'), 'Ëlise-Marie')
  assert.equal(cleanName('a'.repeat(40)).length, 16)
  assert.equal(cleanName(42), '')
})

test('bounding box van een lijn houdt rekening met de dikte', () => {
  const b = itemBounds({ k: 's', b: 'pen', w: 10, p: [0, 0, 100, 50] })
  assert.deepEqual(b, [-6, -6, 106, 56])
})
