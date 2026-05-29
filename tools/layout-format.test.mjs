// Round-trip + validation tests for the layout source format. No deps; run:
//   node tools/layout-format.test.mjs
//
// Fixtures: the community gallery layouts in the sibling repo, if present
// (../pixel-office-community/layouts/*/layout.json), plus a synthetic layout so
// the suite still asserts something when the sibling repo isn't checked out.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, decompile, normalizeLayout } from './layout-format.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (name) => { pass++; console.log(`  ok  ${name}`) }
const bad = (name, msg) => { fail++; console.error(`  FAIL ${name}: ${msg}`) }

function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
  }
  return JSON.stringify(v)
}
function roundtrips(layout) {
  const L = normalizeLayout(layout)
  const back = normalizeLayout(compile(decompile(L)))
  return canonical(L) === canonical(back)
}
function throwsWith(fn, frag) {
  try { fn(); return false } catch (e) { return e.message.includes(frag) }
}

// 1) synthetic layout round-trips
const synthetic = {
  version: 1, cols: 4, rows: 3,
  tiles: [0, 0, 0, 0, 0, 5, 5, 0, 0, 0, 0, 0],
  tileColors: [null, null, null, null, null, { h: 220, s: 40, b: -30, c: 10, colorize: true }, { h: 116, s: 50, b: -20, c: 8, colorize: true }, null, null, null, null, null],
  tileThemes: new Array(12).fill(null),
  zones: [null, null, null, null, null, null, 'play', null, null, null, null, null],
  furniture: [{ uid: 'd1', type: 'desk', col: 1, row: 1 }],
  pets: [{ uid: 'p1', species: 'cat', name: 'Mittens', col: 2, row: 1, sex: 'm', petColors: { body: '#999' } }],
  background: { theme: 'void' },
}
roundtrips(synthetic) ? ok('synthetic round-trip') : bad('synthetic round-trip', 'not lossless')

// 2) the decompiled synthetic has a visible map + sane legend
const src = decompile(synthetic)
src.map.length === 3 && src.map.every((r) => r.length === 4)
  ? ok('decompile produces rectangular map') : bad('decompile map', JSON.stringify(src.map))
src.legend['#'] && src.legend['#'].tile === 'WALL'
  ? ok('wall glyph is #') : bad('wall glyph', JSON.stringify(src.legend))

// 3) validation errors are precise
throwsWith(() => compile({ ...src, map: ['###', '####', '####'] }), 'row 0 is 3 chars')
  ? ok('rejects non-rectangular map') : bad('non-rectangular', 'no/!wrong error')
throwsWith(() => compile({ ...src, legend: { ...src.legend, X: { tile: 'NOPE' } } }), 'unknown tile')
  ? ok('rejects unknown tile name') : bad('unknown tile', 'no/!wrong error')
throwsWith(() => { const s = JSON.parse(JSON.stringify(src)); s.legend[Object.keys(s.legend)[0]].zone = 'Nope'; compile(s) }, 'invalid zone')
  ? ok('rejects invalid zone') : bad('invalid zone', 'no/!wrong error')

// 4) community gallery fixtures (if the sibling repo is checked out)
const galleryDir = path.resolve(here, '..', '..', 'pixel-office-community', 'layouts')
if (fs.existsSync(galleryDir)) {
  let n = 0
  for (const name of fs.readdirSync(galleryDir)) {
    const f = path.join(galleryDir, name, 'layout.json')
    if (!fs.existsSync(f)) continue
    n++
    try {
      roundtrips(JSON.parse(fs.readFileSync(f, 'utf-8')))
        ? ok(`gallery: ${name}`) : bad(`gallery: ${name}`, 'not lossless')
    } catch (e) { bad(`gallery: ${name}`, e.message) }
  }
  if (n === 0) console.log('  (no gallery layouts found to test)')
} else {
  console.log('  (sibling pixel-office-community not present — skipping gallery fixtures)')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
