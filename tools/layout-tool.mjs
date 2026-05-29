#!/usr/bin/env node
// CLI to edit a pixel-office layout in the LLM/human-friendly SOURCE format.
//
//   node layout-tool.mjs decompile <layout.json> [out.source.json]
//       Flat engine layout  ->  readable ASCII source (prints to stdout if no out).
//
//   node layout-tool.mjs compile   <source.json> [out.layout.json]
//       Readable source     ->  flat engine layout the server/engine consumes.
//
//   node layout-tool.mjs check     <source.json>
//       Validate a source file (rectangular map, legend coverage, enums) — no output.
//
//   node layout-tool.mjs roundtrip <layout.json>
//       Assert compile(decompile(L)) deep-equals L. Exit 0 if lossless.
//
// Typical kiosk edit over SSH:
//   scp homeserver:~/.pixel-office/layout.json .
//   node layout-tool.mjs decompile layout.json layout.source.json
//   $EDITOR layout.source.json            # edit the ASCII map / sections
//   node layout-tool.mjs compile layout.source.json layout.json
//   scp layout.json homeserver:~/.pixel-office/layout.json

import fs from 'node:fs'
import { compile, decompile, normalizeLayout } from './layout-format.mjs'

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) }
  catch (e) { fail(`cannot read JSON from ${p}: ${e.message}`) }
}
function writeOut(out, obj) {
  const text = JSON.stringify(obj, null, 2)
  if (out) { fs.writeFileSync(out, text + '\n'); console.error(`wrote ${out}`) }
  else process.stdout.write(text + '\n')
}
function fail(msg) { console.error(`error: ${msg}`); process.exit(1) }
// Order-independent JSON: sort object keys recursively so equality compares
// content, not key order (arrays keep their order — it's significant).
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
  }
  return JSON.stringify(v)
}

const [cmd, input, output] = process.argv.slice(2)
if (!cmd || !input) {
  console.error('usage: layout-tool.mjs <decompile|compile|check|roundtrip> <input.json> [output.json]')
  process.exit(2)
}

try {
  if (cmd === 'decompile') {
    writeOut(output, decompile(readJson(input)))
  } else if (cmd === 'compile') {
    writeOut(output, compile(readJson(input)))
  } else if (cmd === 'check') {
    compile(readJson(input)) // throws on any validation error
    console.error('ok: source is valid')
  } else if (cmd === 'roundtrip') {
    const L = normalizeLayout(readJson(input))
    const back = normalizeLayout(compile(decompile(L)))
    // Compare CONTENT, not key order: the engine reads fields by name, so a
    // key reordering (e.g. pet col/row moved by a spread) is not a data loss.
    const a = canonical(L), b = canonical(back)
    if (a !== b) {
      let i = 0; while (i < a.length && a[i] === b[i]) i++
      fail(`round-trip MISMATCH near char ${i}:\n  orig: …${a.slice(Math.max(0, i - 40), i + 40)}…\n  back: …${b.slice(Math.max(0, i - 40), i + 40)}…`)
    }
    console.error('ok: round-trip is lossless')
  } else {
    fail(`unknown command "${cmd}"`)
  }
} catch (e) {
  fail(e.message)
}
