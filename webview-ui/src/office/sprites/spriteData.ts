import type { Direction, SpriteData, FloorColor } from '../types.js'
import { Direction as Dir } from '../types.js'
import { adjustSprite } from '../colorize.js'

// ── Color Palettes ──────────────────────────────────────────────
const _ = '' // transparent

// ── Furniture Sprites ───────────────────────────────────────────

/** Table 2x2 (32x32) — flat top-down wood surface to place objects on */
export const DESK_SQUARE_SPRITE: SpriteData = [
    [_, "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", _],
    ["#341d10", "#7d4520", "#341d10", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#7d4520", "#7d4520", "#7d4520", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#a15c29", "#a15c29", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#7d4520", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#7d4520", "#341d10", "#905125", "#ab632b", "#ab632b", "#ab632b", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#905125", "#905125", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#905125", "#905125", "#905125", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#905125", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#ac642c", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#341d10", "#7d4520", "#341d10"],
    ["#341d10", "#7d4520", "#341d10", "#ab632b", "#a15c29", "#a15c29", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#905125", "#905125", "#905125", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#ac642c", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#ab632b", "#ab632b", "#905125", "#905125", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#ab632b", "#905125", "#905125", "#ac642c", "#ab632b", "#ab632b", "#905125", "#905125", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#905125", "#ac642c", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#7d4520", "#341d10", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#905125", "#ac642c", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#905125", "#905125", "#905125", "#ab632b", "#905125", "#905125", "#905125", "#905125", "#905125", "#ac642c", "#ab632b", "#905125", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#905125", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#905125", "#905125", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#905125", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#905125", "#905125", "#ac642c", "#ac642c", "#ab632b", "#905125", "#905125", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#905125", "#905125", "#905125", "#905125", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#7d4520", "#341d10", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#7d4520", "#341d10", "#a15c29", "#905125", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#ac642c", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#905125", "#905125", "#905125", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#905125", "#905125", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#ac642c", "#ac642c", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#905125", "#905125", "#905125", "#905125", "#905125", "#341d10", "#7d4520", "#341d10"],
    ["#341d10", "#7d4520", "#341d10", "#905125", "#905125", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#ab632b", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#a15c29", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#905125", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#905125", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#905125", "#ab632b", "#ab632b", "#ab632b", "#905125", "#905125", "#ab632b", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#905125", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#905125", "#905125", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#7d4520", "#341d10", "#905125", "#905125", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#ac642c", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#905125", "#341d10", "#ac642c", "#905125", "#905125", "#905125", "#ac642c", "#ac642c", "#905125", "#905125", "#905125", "#905125", "#ab632b", "#905125", "#905125", "#ac642c", "#ac642c", "#ab632b", "#905125", "#905125", "#905125", "#905125", "#905125", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#ac642c", "#341d10", "#7d4520", "#341d10"],
    ["#341d10", "#7d4520", "#341d10", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#905125", "#a15c29", "#905125", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#a15c29", "#a15c29", "#a15c29", "#ac642c", "#a15c29", "#a15c29", "#a15c29", "#a15c29", "#a15c29", "#905125", "#905125", "#a15c29", "#a15c29", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#7d4520", "#341d10", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#905125", "#905125", "#ab632b", "#ab632b", "#905125", "#ab632b", "#ac642c", "#ac642c", "#ab632b", "#905125", "#905125", "#905125", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#7d4520", "#341d10", "#7d4520", "#905125", "#905125", "#ab632b", "#905125", "#905125", "#ab632b", "#ab632b", "#ab632b", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#905125", "#905125", "#905125", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#ac642c", "#ab632b", "#341d10", "#341d10", "#905125", "#341d10"],
    ["#341d10", "#7d4520", "#7d4520", "#7d4520", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#7d4520", "#905125", "#341d10"],
    ["#341d10", "#7d4520", "#341d10", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#7d4520", "#341d10", "#905125", "#341d10"],
    [_, "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", "#341d10", _],
]

/** Table 2x1 (32x16) — flat top-down wood surface for placing objects on */
export const TABLE_2X1_SPRITE: SpriteData = (() => {
  const A='#3A2A12'; const B='#A4742E'; const C='#D6A85A'; const D='#7A5523'; const E='#BE8C3C'; const F='#8C5F22';
  return [
    [_, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, _],
    [A, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, A],
    [A, B, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, D, B, A],
    [A, B, C, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, D, B, A],
    [A, B, C, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, D, B, A],
    [A, B, C, E, F, E, F, E, F, E, F, E, F, E, F, E, F, E, F, E, F, E, F, E, F, E, F, E, E, D, B, A],
    [A, B, C, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, D, B, A],
    [A, B, C, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, D, B, A],
    [A, B, C, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, D, B, A],
    [A, B, C, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, D, B, A],
    [A, B, C, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, D, B, A],
    [A, D, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, D, A],
    [A, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, A],
    [A, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, A],
    [A, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, A],
    [_, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, _],
  ]
})()

/** Projector: 16x16 — top-down, lens facing up (presentation) */
export const PROJECTOR_SPRITE: SpriteData = (() => {
  const A='#bfeaff'; const B='#15151c'; const C='#7fe0ff'; const D='#ffffff'; const E='#1a1a22'; const F='#585870'; const G='#3f3f4c'; const H='#2a2a33'; const I='#46e06e';
  return [
    [_, _, _, _, _, _, _, A, A, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, A, _, _, A, _, _, _, _, _, _],
    [_, _, _, _, _, B, B, B, B, B, B, _, _, _, _, _],
    [_, _, _, _, _, B, C, D, C, C, B, _, _, _, _, _],
    [_, _, _, _, _, B, C, C, C, C, B, _, _, _, _, _],
    [_, _, _, _, _, B, E, E, E, E, B, _, _, _, _, _],
    [_, _, B, B, B, B, B, B, B, B, B, B, B, B, _, _],
    [_, _, B, F, F, F, F, F, F, F, F, F, F, B, _, _],
    [_, _, B, G, G, G, G, G, G, G, G, G, G, B, _, _],
    [_, _, B, G, H, G, H, G, H, G, H, G, G, B, _, _],
    [_, _, B, G, H, G, H, G, H, G, H, G, G, B, _, _],
    [_, _, B, G, G, G, G, G, G, G, G, I, G, B, _, _],
    [_, _, B, H, H, H, H, H, H, H, H, H, H, B, _, _],
    [_, _, B, B, B, B, B, B, B, B, B, B, B, B, _, _],
    [_, _, _, B, B, _, _, _, _, _, _, B, B, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Plant in pot: 16x24 — leafy potted plant */
export const PLANT_SPRITE: SpriteData = (() => {
  const A='#1c3a18'; const B='#62bf52'; const C='#2c6b2c'; const D='#3f8d38'; const E='#7e3c1f'; const F='#c47048'; const G='#a8552f';
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, A, A, A, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, A, B, A, _, _, _, _, _, _],
    [_, _, _, A, A, A, _, A, B, A, _, A, A, A, _, _],
    [_, _, _, A, C, C, A, B, B, B, A, C, C, A, _, _],
    [_, _, _, A, C, C, D, B, B, B, D, C, C, A, _, _],
    [_, _, _, _, A, C, C, B, B, B, C, C, A, _, _, _],
    [_, _, _, _, A, D, D, B, B, B, D, D, A, _, _, _],
    [_, _, _, _, A, D, D, B, B, B, D, D, A, _, _, _],
    [_, _, _, _, _, A, D, B, B, B, D, A, _, _, _, _],
    [_, _, _, _, _, A, D, B, B, B, D, A, _, _, _, _],
    [_, _, _, _, _, A, D, B, B, B, D, A, _, _, _, _],
    [_, _, _, _, _, A, D, B, B, B, D, A, _, _, _, _],
    [_, _, _, _, _, _, A, B, B, B, A, _, _, _, _, _],
    [_, _, _, _, _, _, A, D, D, D, A, _, _, _, _, _],
    [_, _, _, _, E, F, F, F, F, F, F, _, _, _, _, _],
    [_, _, _, _, E, G, G, G, G, G, G, _, _, _, _, _],
    [_, _, _, _, E, G, G, G, G, E, E, _, _, _, _, _],
    [_, _, _, _, E, G, G, G, G, E, E, _, _, _, _, _],
    [_, _, _, _, _, E, G, G, G, E, E, _, _, _, _, _],
    [_, _, _, _, _, E, G, G, G, E, E, _, _, _, _, _],
    [_, _, _, _, _, E, G, G, G, E, E, _, _, _, _, _],
    [_, _, _, _, _, E, E, E, E, E, _, _, _, _, _, _],
  ]
})()

/** Bookshelf: 16x32 (1x2) — oak shelves, muted book spines */
export const BOOKSHELF_SPRITE: SpriteData = (() => {
  const A='#33240f'; const B='#7a5523'; const C='#241a0d'; const D='#8a4a40'; const E='#3f5d72'; const F='#4f7355'; const G='#b08a4a'; const H='#6e4358'; const I='#9a6a34'; const J='#8a6a48'; const K='#7a4b3a'; const L='#41301a';
  return [
    [_, A, A, A, A, A, A, A, A, A, A, A, A, A, A, _],
    [A, B, C, C, C, C, C, C, C, C, C, C, C, C, B, A],
    [A, B, C, C, C, C, C, C, C, C, C, C, C, A, B, A],
    [A, B, C, A, D, A, E, A, F, A, G, A, H, A, B, A],
    [A, B, C, A, D, A, E, A, F, A, G, A, H, A, B, A],
    [A, B, C, A, D, A, E, A, F, A, G, A, H, A, B, A],
    [A, B, C, A, D, A, E, A, F, A, G, A, H, A, B, A],
    [A, B, I, I, I, I, I, I, I, I, I, I, I, I, B, A],
    [A, B, B, B, B, B, B, B, B, B, B, B, B, B, B, A],
    [A, B, C, A, C, C, C, C, C, C, C, C, C, A, B, A],
    [A, B, C, A, A, D, A, E, A, F, A, G, A, A, B, A],
    [A, B, C, A, A, D, A, E, A, F, A, G, A, A, B, A],
    [A, B, C, A, A, D, A, E, A, F, A, G, A, A, B, A],
    [A, B, C, A, A, D, A, E, A, F, A, G, A, A, B, A],
    [A, B, I, I, I, I, I, I, I, I, I, I, I, I, B, A],
    [A, B, B, B, B, B, B, B, B, B, B, B, B, B, B, A],
    [A, B, C, C, C, C, C, C, C, C, C, C, C, A, B, A],
    [A, B, C, A, J, A, K, A, D, A, E, A, F, A, B, A],
    [A, B, C, A, J, A, K, A, D, A, E, A, F, A, B, A],
    [A, B, C, A, J, A, K, A, D, A, E, A, F, A, B, A],
    [A, B, C, A, J, A, K, A, D, A, E, A, F, A, B, A],
    [A, B, I, I, I, I, I, I, I, I, I, I, I, I, B, A],
    [A, B, B, B, B, B, B, B, B, B, B, B, B, B, B, A],
    [A, B, C, A, C, C, C, C, C, C, C, C, C, A, B, A],
    [A, B, C, A, A, J, A, K, A, D, A, E, A, A, B, A],
    [A, B, C, A, A, J, A, K, A, D, A, E, A, A, B, A],
    [A, B, C, A, A, J, A, K, A, D, A, E, A, A, B, A],
    [A, B, C, A, A, J, A, K, A, D, A, E, A, A, B, A],
    [A, B, I, I, I, I, I, I, I, I, I, I, I, I, B, A],
    [A, B, L, L, L, L, L, L, L, L, L, L, L, L, B, A],
    [A, B, L, L, L, L, L, L, L, L, L, L, L, L, B, A],
    [_, A, A, A, A, A, A, A, A, A, A, A, A, A, A, _],
  ]
})()

/** Water cooler: 16x24 */
export const COOLER_SPRITE: SpriteData = (() => {
  const W = '#CCDDEE'
  const L = '#88BBDD'
  const D = '#999999'
  const B = '#666666'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, D, D, W, W, W, W, D, D, _, _, _, _],
    [_, _, _, _, D, W, W, W, W, W, W, D, _, _, _, _],
    [_, _, _, _, D, W, W, W, W, W, W, D, _, _, _, _],
    [_, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, D, B, B, B, B, D, _, _, _, _, _],
    [_, _, _, _, _, D, B, B, B, B, D, _, _, _, _, _],
    [_, _, _, _, _, D, B, B, B, B, D, _, _, _, _, _],
    [_, _, _, _, D, D, B, B, B, B, D, D, _, _, _, _],
    [_, _, _, _, D, B, B, B, B, B, B, D, _, _, _, _],
    [_, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Whiteboard: 32x16 (2 tiles wide, 1 tile tall) — hangs on wall.
 *  Chunky dark frame, off-white board, tidy markings: 3 clean blue "text"
 *  lines on the left + a red box-and-arrow diagram on the right, plus a thin
 *  marker tray at the bottom. Hard edges, 1px strokes, no scattered speckle. */
export const WHITEBOARD_SPRITE: SpriteData = (() => {
  const O = '#1c1c24' // dark chunky outline
  const F = '#3c3c47' // frame bevel (matches chair/projector grey family)
  const W = '#f4f4ee' // off-white board field
  const S = '#dadace' // faint board shading (bottom edge)
  const B = '#3a6ea5' // blue marker
  const M = '#c0463a' // red marker
  const T = '#2a2a33' // tray
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, _],
    [_, O, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, O, _],
    [_, O, F, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, F, O, _],
    [_, O, F, W, B, B, B, B, B, B, W, W, W, W, W, W, W, W, M, M, M, M, M, M, M, M, W, W, W, F, O, _],
    [_, O, F, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, M, W, W, W, W, W, W, M, W, W, W, F, O, _],
    [_, O, F, W, B, B, B, B, B, W, W, W, W, W, W, W, W, W, M, W, W, W, W, W, W, M, W, W, W, F, O, _],
    [_, O, F, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, M, M, M, M, M, M, M, M, W, W, W, F, O, _],
    [_, O, F, W, B, B, B, B, B, B, B, W, W, W, W, W, W, W, W, W, W, M, W, W, W, W, W, W, W, F, O, _],
    [_, O, F, W, W, W, W, W, W, W, W, W, W, W, W, W, W, M, M, M, M, M, M, M, W, W, W, W, W, F, O, _],
    [_, O, F, W, B, B, B, B, W, W, W, W, W, W, W, W, W, W, M, M, M, W, W, W, W, W, W, W, W, F, O, _],
    [_, O, F, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, F, O, _],
    [_, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, _],
    [_, _, O, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, O, _, _],
    [_, _, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, O, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Chair: 16x16 — top-down office chair (5-star wheeled base) */
export const CHAIR_SPRITE: SpriteData = [
    ['', '', '', "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", '', '', ''],
    ['', '', "#010000", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#010000", '', ''],
    ['', '', "#010000", "#1b1b1a", "#1b1b1a", "#1b1b1a", "#1b1b1a", "#1b1b1a", "#1b1b1a", "#1b1b1a", "#1b1b1a", "#1b1b1a", "#1b1b1a", "#010000", '', ''],
    ['', '', '', '', '', "#414141", "#010000", '', '', "#000000", "#414141", '', '', '', '', ''],
    ['', '', '', "#1b1b1a", "#4d4d4c", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#1b1b1a", '', '', ''],
    ['', '', "#000000", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#010000", '', ''],
    ["#000000", "#4d4d4c", "#1b1b1a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#1b1b1a", "#4a4a4a", "#1b1b1a"],
    ["#4d4d4c", "#4d4d4c", "#000000", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#010000", "#4d4d4c", "#1b1b1a"],
    ["#4d4d4c", "#4d4d4c", "#000000", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#010000", "#4d4d4c", "#414141"],
    ["#4d4d4c", "#4d4d4c", "#010000", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#010000", "#4d4d4c", "#1b1b1a"],
    ["#4d4d4c", "#4d4d4c", "#010000", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#010000", "#4d4d4c", "#414141"],
    ['', "#010000", "#010000", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#010000", "#010000", ''],
    ['', '', "#000000", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#4a4a4a", "#010000", '', ''],
    ['', '', "#414141", "#010000", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#414141", "#4a4a4a", "#4a4a4a", '', ''],
    ['', "#000000", "#414141", "#4d4d4c", '', '', '', "#414141", "#414141", '', '', '', "#010000", "#414141", "#000000", ''],
    ['', '', '', '', '', '', '', "#414141", "#414141", '', '', '', '', '', '', ''],
  ]

/** PC monitor: 16x16 — top-down monitor on stand */
export const PC_SPRITE: SpriteData = [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    ["#070807", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#070807"],
    ["#070807", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#070807"],
    ["#070807", "#363638", "#031b19", "#031b19", "#070807", "#070807", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#363638", "#070807"],
    ["#070807", "#363638", "#031b19", "#02fbcd", "#031b19", "#02fbcd", "#02fbcd", "#2bab92", "#2bab92", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#363638", "#070807"],
    ["#070807", "#363638", "#031b19", "#02fbcd", "#02fbcd", "#02fbcd", "#02fbcd", "#02fbcd", "#02fbcd", "#02fbcd", "#02fbcd", "#031b19", "#031b19", "#031b19", "#363638", "#070807"],
    ["#070807", "#363638", "#031b19", "#02fbcd", "#02fbcd", "#02fbcd", "#02fbcd", "#031b19", "#031b19", "#02fbcd", "#02fbcd", "#02fbcd", "#02fbcd", "#031b19", "#363638", "#070807"],
    ["#070807", "#363638", "#031b19", "#02fbcd", "#02fbcd", "#02fbcd", "#02fbcd", "#02fbcd", "#02fbcd", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#363638", "#070807"],
    ["#070807", "#363638", "#031b19", "#02fbcd", "#031b19", "#02fbcd", "#031b19", "#02fbcd", "#031b19", "#02fbcd", "#02fbcd", "#031b19", "#031b19", "#031b19", "#363638", "#070807"],
    ["#070807", "#363638", "#031b19", "#02fbcd", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#031b19", "#363638", "#070807"],
    ["#070807", "#363638", "#070807", "#070807", "#070807", "#070807", "#070807", "#070807", "#070807", "#070807", "#070807", "#070807", "#070807", "#070807", "#363638", "#070807"],
    ["#070807", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#070807"],
    [_, _, _, _, _, "#363638", "#070807", "#363638", "#363638", "#363638", "#363638", _, _, _, _, _],
    [_, _, _, _, "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", _, _, _, _, _],
    [_, _, _, _, "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", "#363638", _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

/** Desk lamp: 16x16 — top-down desk lamp */
export const LAMP_SPRITE: SpriteData = [
    [_, _, _, _, _, _, _, "#0d0a08", "#0d0a08", _, _, _, _, _, _, _],
    [_, _, _, _, _, "#daaf44", "#daaf44", "#0d0a08", "#0d0a08", "#daaf44", "#daaf44", _, _, _, _, _],
    [_, _, _, _, "#daaf44", "#daaf44", "#fddc49", "#fddc49", "#fddc49", "#fddc49", "#daaf44", "#daaf44", _, _, _, _],
    [_, _, _, "#daaf44", "#daaf44", "#fddc49", "#fef174", "#fef174", "#fef174", "#fef174", "#fddc49", "#daaf44", "#0d0a08", _, _, _],
    [_, _, _, "#daaf44", "#daaf44", "#fddc49", "#fef174", "#fef174", "#fef174", "#fef174", "#fddc49", "#daaf44", "#0d0a08", _, _, _],
    [_, _, _, "#daaf44", "#daaf44", "#fddc49", "#fef174", "#54514f", "#54514f", "#fef174", "#fddc49", "#daaf44", "#000000", _, _, _],
    [_, _, _, _, "#daaf44", "#fddc49", "#fddc49", "#54514f", "#54514f", "#fddc49", "#fddc49", "#daaf44", _, _, _, _],
    [_, _, _, _, "#0d0a08", "#daaf44", "#fddc49", "#0d0a08", "#0d0a08", "#fddc49", "#daaf44", "#0d0a08", _, _, _, _],
    [_, _, _, _, _, "#0d0a08", "#daaf44", "#0d0a08", "#0d0a08", "#daaf44", "#0d0a08", _, _, _, _, _],
    [_, _, _, _, _, _, _, "#0d0a08", "#0d0a08", _, _, _, _, _, _, _],
    [_, _, _, _, _, "#0d0a08", "#54514f", "#daaf44", "#daaf44", "#54514f", "#0d0a08", _, _, _, _, _],
    [_, _, _, _, _, "#54514f", "#54514f", "#0d0a08", "#0d0a08", "#54514f", "#54514f", _, _, _, _, _],
    [_, _, _, _, _, "#54514f", "#54514f", "#0d0a08", "#0d0a08", "#54514f", "#54514f", _, _, _, _, _],
    [_, _, _, _, _, "#54514f", "#54514f", "#54514f", "#54514f", "#54514f", "#54514f", _, _, _, _, _],
    [_, _, _, _, _, "#0d0a08", "#54514f", "#0d0a08", "#0d0a08", "#54514f", "#0d0a08", _, _, _, _, _],
    [_, _, _, _, _, _, _, "#0d0a08", "#0d0a08", _, _, _, _, _, _, _],
]

// ── Break Room & Misc Furniture Sprites ─────────────────────────

/** Door: 16x32 (1 tile wide, 2 tiles tall) — front-facing office door */
export const DOOR_SPRITE: SpriteData = (() => {
  const F = '#4a4a5a' // frame (dark metal)
  const D = '#3a3a4a' // frame shadow
  const T = '#5a5a6a' // frame top/lintel highlight
  const P = '#8B7348' // door panel (wood)
  const L = '#A08858' // panel highlight
  const H = '#CCAA44' // handle (brass)
  const K = '#DDBB55' // handle highlight
  const R = '#5a5a6a' // inner recess (lighter than D)
  const S = '#666677' // threshold step
  return [
    // Row 0: top lintel (highlighted to separate from wall)
    [_, T, T, F, F, F, F, F, F, F, F, F, F, T, T, _],
    // Row 1: frame + top panel edge
    [_, F, D, R, R, R, R, R, R, R, R, R, R, D, F, _],
    // Rows 2-5: upper panel
    [_, F, D, R, P, P, P, P, P, P, P, P, R, D, F, _],
    [_, F, D, R, P, L, L, P, P, L, L, P, R, D, F, _],
    [_, F, D, R, P, L, L, P, P, L, L, P, R, D, F, _],
    [_, F, D, R, P, P, P, P, P, P, P, P, R, D, F, _],
    // Row 6: horizontal panel divider
    [_, F, D, R, P, P, P, P, P, P, P, P, R, D, F, _],
    // Rows 7-9: middle panel section
    [_, F, D, R, P, P, P, P, P, P, P, P, R, D, F, _],
    [_, F, D, R, P, L, L, P, P, L, L, P, R, D, F, _],
    [_, F, D, R, P, L, L, P, P, L, L, P, R, D, F, _],
    // Row 10-11: handle area
    [_, F, D, R, P, P, P, P, P, P, P, P, R, D, F, _],
    [_, F, D, R, P, P, P, P, P, H, K, P, R, D, F, _],
    // Row 12: handle bottom
    [_, F, D, R, P, P, P, P, P, H, K, P, R, D, F, _],
    // Rows 13-15: mid panel
    [_, F, D, R, P, P, P, P, P, P, P, P, R, D, F, _],
    [_, F, D, R, P, L, L, P, P, L, L, P, R, D, F, _],
    [_, F, D, R, P, L, L, P, P, L, L, P, R, D, F, _],
    // ── Bottom tile (doorstep) ──
    // Rows 16-21: lower panel
    [_, F, D, R, P, P, P, P, P, P, P, P, R, D, F, _],
    [_, F, D, R, P, P, P, P, P, P, P, P, R, D, F, _],
    [_, F, D, R, P, L, L, P, P, L, L, P, R, D, F, _],
    [_, F, D, R, P, L, L, P, P, L, L, P, R, D, F, _],
    [_, F, D, R, P, P, P, P, P, P, P, P, R, D, F, _],
    [_, F, D, R, P, P, P, P, P, P, P, P, R, D, F, _],
    // Rows 22-23: bottom panel edge
    [_, F, D, R, R, R, R, R, R, R, R, R, R, D, F, _],
    [_, F, D, D, D, D, D, D, D, D, D, D, D, D, F, _],
    // Row 24: door bottom frame
    [_, F, F, F, F, F, F, F, F, F, F, F, F, F, F, _],
    // Rows 25-27: empty (above threshold)
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    // Rows 28-29: threshold step plate
    [_, _, S, S, S, S, S, S, S, S, S, S, S, S, _, _],
    [_, _, D, S, S, S, S, S, S, S, S, S, S, D, _, _],
    // Rows 30-31: empty
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Coffee machine: 16x16 (1x1 tile) — break room appliance */
export const COFFEE_MACHINE_SPRITE: SpriteData = (() => {
  const B = '#2e2a24' // body dark (warm brown-black, distinct from door)
  const M = '#3e382e' // body mid
  const L = '#4e483e' // body light
  const S = '#888888' // silver trim
  const G = '#44CC44' // indicator light
  const C = '#EEEEDD' // cup
  const D = '#DDDDCC' // cup shadow
  const W = '#1e1a14' // dark recess
  const V = '#CCCCBB' // steam
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
    [_, _, _, S, B, B, B, B, B, B, B, B, S, _, _, _],
    [_, _, _, S, B, M, M, M, M, M, M, B, S, _, _, _],
    [_, _, _, S, B, M, L, L, L, L, M, B, S, _, _, _],
    [_, _, _, S, B, M, L, L, L, L, M, B, S, _, _, _],
    [_, _, _, S, B, M, M, M, M, M, M, B, S, _, _, _],
    [_, _, _, S, B, B, W, W, W, W, B, B, S, _, _, _],
    [_, _, _, S, B, B, W, V, _, W, B, B, S, _, _, _],
    [_, _, _, S, B, B, W, C, C, W, B, B, S, _, _, _],
    [_, _, _, S, B, B, W, C, D, W, B, B, S, _, _, _],
    [_, _, _, S, B, B, W, W, W, W, B, B, S, _, _, _],
    [_, _, _, S, B, B, B, B, B, G, B, B, S, _, _, _],
    [_, _, _, S, S, S, S, S, S, S, S, S, S, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Break couch: 32x16 (2 tiles wide, 1 tile tall) — comfy break room sofa */
export const BREAK_COUCH_SPRITE: SpriteData = (() => {
  const F = '#6B4E3A' // frame (dark wood)
  const D = '#5A3D2A' // frame shadow
  const C = '#5A7088' // cushion main (muted slate-blue)
  const L = '#7089A4' // cushion highlight
  const S = '#47596E' // cushion shadow
  const A = '#7B5E4A' // armrest
  const P = '#39485A' // cushion deep shadow
  return [
    // Row 0: empty
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    // Row 1: back top
    [_, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _],
    // Row 2: back cushion
    [_, _, D, F, S, S, C, C, C, C, C, C, C, C, C, S, S, C, C, C, C, C, C, C, C, C, S, S, F, D, _, _],
    // Row 3: back cushion mid
    [_, _, D, F, S, C, C, L, L, C, C, C, L, L, C, S, S, C, L, L, C, C, C, L, L, C, C, S, F, D, _, _],
    // Row 4: back cushion bottom
    [_, _, D, F, S, C, C, L, L, C, C, C, L, L, C, S, S, C, L, L, C, C, C, L, L, C, C, S, F, D, _, _],
    // Row 5: seat back edge (armrest tops visible at ends)
    [_, A, A, F, F, S, S, S, S, S, S, S, S, S, S, F, F, S, S, S, S, S, S, S, S, S, S, S, F, A, A, _],
    // Row 6: armrest + seat
    [_, A, A, F, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, F, A, A, _],
    // Row 7: armrest + seat cushion
    [_, A, A, F, C, C, L, L, C, C, C, C, L, L, C, C, C, C, L, L, C, C, C, C, L, L, C, C, F, A, A, _],
    // Row 8: armrest + seat cushion
    [_, A, A, F, C, C, L, L, C, C, C, C, L, L, C, C, C, C, L, L, C, C, C, C, L, L, C, C, F, A, A, _],
    // Row 9: armrest + seat cushion
    [_, A, A, F, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, F, A, A, _],
    // Row 10: seat front edge
    [_, A, A, F, S, S, P, P, S, S, S, S, P, P, S, S, S, S, P, P, S, S, S, S, P, P, S, S, F, A, A, _],
    // Row 11: armrest bottom + front
    [_, _, D, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, D, _, _],
    // Row 12: legs
    [_, _, _, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, D, _, _, _],
    // Row 13: legs
    [_, _, _, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, D, _, _, _],
    // Row 14-15: empty
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

// ── Speech Bubble Sprites ───────────────────────────────────────

/** Permission bubble: white square with "..." in amber, and a tail pointer (11x13) */
export const BUBBLE_PERMISSION_SPRITE: SpriteData = (() => {
  const B = '#555566' // border
  const F = '#EEEEFF' // fill
  const A = '#CCA700' // amber dots
  return [
    [B, B, B, B, B, B, B, B, B, B, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, A, F, A, F, A, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, B, B, B, B, B, B, B, B, B, B],
    [_, _, _, _, B, B, B, _, _, _, _],
    [_, _, _, _, _, B, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Waiting bubble: white square with green checkmark, and a tail pointer (11x13) */
export const BUBBLE_WAITING_SPRITE: SpriteData = (() => {
  const B = '#555566' // border
  const F = '#EEEEFF' // fill
  const G = '#44BB66' // green check
  return [
    [_, B, B, B, B, B, B, B, B, B, _],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, G, F, B],
    [B, F, F, F, F, F, F, G, F, F, B],
    [B, F, F, G, F, F, G, F, F, F, B],
    [B, F, F, F, G, G, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [_, B, B, B, B, B, B, B, B, B, _],
    [_, _, _, _, B, B, B, _, _, _, _],
    [_, _, _, _, _, B, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _],
  ]
})()

// ── Character Sprites ───────────────────────────────────────────
// 16x24 characters with palette substitution

/** Palette colors for 12 distinct agent characters. First 6 stable for backward compat. */
export const CHARACTER_PALETTES = [
  { skin: '#FFCC99', shirt: '#4488CC', pants: '#334466', hair: '#553322', shoes: '#222222' },
  { skin: '#FFCC99', shirt: '#CC4444', pants: '#333333', hair: '#FFD700', shoes: '#222222' },
  { skin: '#DEB887', shirt: '#44AA66', pants: '#334444', hair: '#222222', shoes: '#333333' },
  { skin: '#FFCC99', shirt: '#AA55CC', pants: '#443355', hair: '#AA4422', shoes: '#222222' },
  { skin: '#DEB887', shirt: '#CCAA33', pants: '#444433', hair: '#553322', shoes: '#333333' },
  { skin: '#FFCC99', shirt: '#FF8844', pants: '#443322', hair: '#111111', shoes: '#222222' },
  // Extra variants — different skin tones, hoodies, mint/teal/burgundy/charcoal shirts
  { skin: '#A0734E', shirt: '#2EB59C', pants: '#1F3A44', hair: '#1A0F0A', shoes: '#191919' },
  { skin: '#F2C9A4', shirt: '#7A3E5C', pants: '#28202C', hair: '#5E412C', shoes: '#2A2018' },
  { skin: '#C99B7A', shirt: '#4B5563', pants: '#1F2937', hair: '#3B2415', shoes: '#0F0F12' },
  { skin: '#FFCC99', shirt: '#F1C40F', pants: '#503A22', hair: '#8B4513', shoes: '#241A10' },
  { skin: '#8E6447', shirt: '#A66CFF', pants: '#2C1F3F', hair: '#0E0808', shoes: '#1A1320' },
  { skin: '#EBC79A', shirt: '#3CB371', pants: '#21302A', hair: '#7A4A2A', shoes: '#1E1B14' },
] as const

interface CharPalette {
  skin: string
  shirt: string
  pants: string
  hair: string
  shoes: string
}

// Template keys for character pixel data
const H = 'hair'
const K = 'skin'
const S = 'shirt'
const P = 'pants'
const O = 'shoes'
const E = '#FFFFFF' // eyes

type TemplateCell = typeof H | typeof K | typeof S | typeof P | typeof O | typeof E | typeof _

/** Resolve a template to SpriteData using a palette */
function resolveTemplate(template: TemplateCell[][], palette: CharPalette): SpriteData {
  return template.map((row) =>
    row.map((cell) => {
      if (cell === _) return ''
      if (cell === E) return E
      if (cell === H) return palette.hair
      if (cell === K) return palette.skin
      if (cell === S) return palette.shirt
      if (cell === P) return palette.pants
      if (cell === O) return palette.shoes
      return cell
    }),
  )
}

/** Flip a template horizontally (for generating left sprites from right) */
function flipHorizontal(template: TemplateCell[][]): TemplateCell[][] {
  return template.map((row) => [...row].reverse())
}

// ════════════════════════════════════════════════════════════════
// DOWN-FACING SPRITES
// ════════════════════════════════════════════════════════════════

// Walk down: 4 frames (1, 2=standing, 3=mirror legs, 2 again)
const CHAR_WALK_DOWN_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, P, P, _, _, _, _, P, P, _, _, _, _],
  [_, _, _, _, P, P, _, _, _, _, P, P, _, _, _, _],
  [_, _, _, _, O, O, _, _, _, _, _, O, O, _, _, _],
  [_, _, _, _, O, O, _, _, _, _, _, O, O, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_DOWN_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_DOWN_3: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, P, P, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, P, P, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, O, O, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, O, O, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Down typing: front-facing sitting, arms on keyboard
const CHAR_DOWN_TYPE_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, K, K, S, S, S, S, S, S, K, K, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_DOWN_TYPE_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, K, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, _, K, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Down reading: front-facing sitting, arms at sides, looking at screen
const CHAR_DOWN_READ_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_DOWN_READ_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// ════════════════════════════════════════════════════════════════
// UP-FACING SPRITES (back of head, no face)
// ════════════════════════════════════════════════════════════════

// Walk up: back view, legs alternate
const CHAR_WALK_UP_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, P, P, _, _, _, _, P, P, _, _, _, _],
  [_, _, _, _, P, P, _, _, _, _, P, P, _, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, O, O, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, O, O, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_UP_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_UP_3: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, P, P, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, P, P, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, O, O, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, O, O, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Up typing: back view, arms out to keyboard
const CHAR_UP_TYPE_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, K, K, S, S, S, S, S, S, K, K, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_UP_TYPE_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, K, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, _, K, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Up reading: back view, arms at sides
const CHAR_UP_READ_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_UP_READ_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// ════════════════════════════════════════════════════════════════
// RIGHT-FACING SPRITES (side profile, one eye visible)
// Left sprites are generated by flipHorizontal()
// ════════════════════════════════════════════════════════════════

// Right walk: side view, legs step
const CHAR_WALK_RIGHT_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, K, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, _, P, P, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, _, P, P, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, _, _, O, O, _, _, _],
  [_, _, _, _, _, O, O, _, _, _, _, O, O, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_RIGHT_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, K, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_RIGHT_3: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, K, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Right typing: side profile sitting, one arm on keyboard
const CHAR_RIGHT_TYPE_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_RIGHT_TYPE_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, K, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, _, _, K, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Right reading: side sitting, arms at side
const CHAR_RIGHT_READ_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, K, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_RIGHT_READ_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, K, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// ════════════════════════════════════════════════════════════════
// Template export (for export-characters script)
// ════════════════════════════════════════════════════════════════

/** All character templates grouped by direction, for use by the export script.
 *  Frame order per direction: walk1, walk2, walk3, type1, type2, read1, read2 */
export const CHARACTER_TEMPLATES = {
  down: [
    CHAR_WALK_DOWN_1, CHAR_WALK_DOWN_2, CHAR_WALK_DOWN_3,
    CHAR_DOWN_TYPE_1, CHAR_DOWN_TYPE_2,
    CHAR_DOWN_READ_1, CHAR_DOWN_READ_2,
  ],
  up: [
    CHAR_WALK_UP_1, CHAR_WALK_UP_2, CHAR_WALK_UP_3,
    CHAR_UP_TYPE_1, CHAR_UP_TYPE_2,
    CHAR_UP_READ_1, CHAR_UP_READ_2,
  ],
  right: [
    CHAR_WALK_RIGHT_1, CHAR_WALK_RIGHT_2, CHAR_WALK_RIGHT_3,
    CHAR_RIGHT_TYPE_1, CHAR_RIGHT_TYPE_2,
    CHAR_RIGHT_READ_1, CHAR_RIGHT_READ_2,
  ],
} as const

// ════════════════════════════════════════════════════════════════
// Loaded character sprites (from PNG assets)
// ════════════════════════════════════════════════════════════════

interface LoadedCharacterData {
  down: SpriteData[]
  up: SpriteData[]
  right: SpriteData[]
}

let loadedCharacters: LoadedCharacterData[] | null = null

/** Set pre-colored character sprites loaded from PNG assets. Call this when characterSpritesLoaded message arrives. */
export function setCharacterTemplates(data: LoadedCharacterData[]): void {
  loadedCharacters = data
  // Clear cache so sprites are rebuilt from loaded data
  spriteCache.clear()
}

/** Flip a SpriteData horizontally (for generating left sprites from right) */
function flipSpriteHorizontal(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row].reverse())
}

// ════════════════════════════════════════════════════════════════
// Sprite resolution + caching
// ════════════════════════════════════════════════════════════════

export interface CharacterSprites {
  walk: Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>
  typing: Record<Direction, [SpriteData, SpriteData]>
  reading: Record<Direction, [SpriteData, SpriteData]>
}

const spriteCache = new Map<string, CharacterSprites>()

/** Apply hue shift to every sprite in a CharacterSprites set */
function hueShiftSprites(sprites: CharacterSprites, hueShift: number): CharacterSprites {
  const color: FloorColor = { h: hueShift, s: 0, b: 0, c: 0 }
  const shift = (s: SpriteData) => adjustSprite(s, color)
  const shiftWalk = (arr: [SpriteData, SpriteData, SpriteData, SpriteData]): [SpriteData, SpriteData, SpriteData, SpriteData] =>
    [shift(arr[0]), shift(arr[1]), shift(arr[2]), shift(arr[3])]
  const shiftPair = (arr: [SpriteData, SpriteData]): [SpriteData, SpriteData] =>
    [shift(arr[0]), shift(arr[1])]
  return {
    walk: {
      [Dir.DOWN]: shiftWalk(sprites.walk[Dir.DOWN]),
      [Dir.UP]: shiftWalk(sprites.walk[Dir.UP]),
      [Dir.RIGHT]: shiftWalk(sprites.walk[Dir.RIGHT]),
      [Dir.LEFT]: shiftWalk(sprites.walk[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>,
    typing: {
      [Dir.DOWN]: shiftPair(sprites.typing[Dir.DOWN]),
      [Dir.UP]: shiftPair(sprites.typing[Dir.UP]),
      [Dir.RIGHT]: shiftPair(sprites.typing[Dir.RIGHT]),
      [Dir.LEFT]: shiftPair(sprites.typing[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData]>,
    reading: {
      [Dir.DOWN]: shiftPair(sprites.reading[Dir.DOWN]),
      [Dir.UP]: shiftPair(sprites.reading[Dir.UP]),
      [Dir.RIGHT]: shiftPair(sprites.reading[Dir.RIGHT]),
      [Dir.LEFT]: shiftPair(sprites.reading[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData]>,
  }
}

export function getCharacterSprites(paletteIndex: number, hueShift = 0): CharacterSprites {
  // When PNG sprites are loaded but paletteIndex overflows the base count,
  // synthesize a deterministic hue shift per overflow ring so palette indices
  // 6..11 visually diverge from 0..5 instead of duplicating.
  let effectiveHue = hueShift
  if (loadedCharacters && hueShift === 0 && paletteIndex >= loadedCharacters.length) {
    const ring = Math.floor(paletteIndex / loadedCharacters.length)
    // Golden-angle-ish offsets per ring: 137° ring 1, 274° ring 2, ...
    effectiveHue = (ring * 137) % 360
  }
  const cacheKey = `${paletteIndex}:${effectiveHue}`
  const cached = spriteCache.get(cacheKey)
  if (cached) return cached

  let sprites: CharacterSprites

  if (loadedCharacters) {
    // Use pre-colored character sprites directly (no palette swapping)
    const char = loadedCharacters[paletteIndex % loadedCharacters.length]
    const d = char.down
    const u = char.up
    const rt = char.right
    const flip = flipSpriteHorizontal

    sprites = {
      walk: {
        [Dir.DOWN]: [d[0], d[1], d[2], d[1]],
        [Dir.UP]: [u[0], u[1], u[2], u[1]],
        [Dir.RIGHT]: [rt[0], rt[1], rt[2], rt[1]],
        [Dir.LEFT]: [flip(rt[0]), flip(rt[1]), flip(rt[2]), flip(rt[1])],
      },
      typing: {
        [Dir.DOWN]: [d[3], d[4]],
        [Dir.UP]: [u[3], u[4]],
        [Dir.RIGHT]: [rt[3], rt[4]],
        [Dir.LEFT]: [flip(rt[3]), flip(rt[4])],
      },
      reading: {
        [Dir.DOWN]: [d[5], d[6]],
        [Dir.UP]: [u[5], u[6]],
        [Dir.RIGHT]: [rt[5], rt[6]],
        [Dir.LEFT]: [flip(rt[5]), flip(rt[6])],
      },
    }
  } else {
    // Fallback: use hardcoded templates with palette swapping
    const pal = CHARACTER_PALETTES[paletteIndex % CHARACTER_PALETTES.length]
    const r = (t: TemplateCell[][]) => resolveTemplate(t, pal)
    const rf = (t: TemplateCell[][]) => resolveTemplate(flipHorizontal(t), pal)

    sprites = {
      walk: {
        [Dir.DOWN]: [r(CHAR_WALK_DOWN_1), r(CHAR_WALK_DOWN_2), r(CHAR_WALK_DOWN_3), r(CHAR_WALK_DOWN_2)],
        [Dir.UP]: [r(CHAR_WALK_UP_1), r(CHAR_WALK_UP_2), r(CHAR_WALK_UP_3), r(CHAR_WALK_UP_2)],
        [Dir.RIGHT]: [r(CHAR_WALK_RIGHT_1), r(CHAR_WALK_RIGHT_2), r(CHAR_WALK_RIGHT_3), r(CHAR_WALK_RIGHT_2)],
        [Dir.LEFT]: [rf(CHAR_WALK_RIGHT_1), rf(CHAR_WALK_RIGHT_2), rf(CHAR_WALK_RIGHT_3), rf(CHAR_WALK_RIGHT_2)],
      },
      typing: {
        [Dir.DOWN]: [r(CHAR_DOWN_TYPE_1), r(CHAR_DOWN_TYPE_2)],
        [Dir.UP]: [r(CHAR_UP_TYPE_1), r(CHAR_UP_TYPE_2)],
        [Dir.RIGHT]: [r(CHAR_RIGHT_TYPE_1), r(CHAR_RIGHT_TYPE_2)],
        [Dir.LEFT]: [rf(CHAR_RIGHT_TYPE_1), rf(CHAR_RIGHT_TYPE_2)],
      },
      reading: {
        [Dir.DOWN]: [r(CHAR_DOWN_READ_1), r(CHAR_DOWN_READ_2)],
        [Dir.UP]: [r(CHAR_UP_READ_1), r(CHAR_UP_READ_2)],
        [Dir.RIGHT]: [r(CHAR_RIGHT_READ_1), r(CHAR_RIGHT_READ_2)],
        [Dir.LEFT]: [rf(CHAR_RIGHT_READ_1), rf(CHAR_RIGHT_READ_2)],
      },
    }
  }

  // Apply hue shift if non-zero (uses effectiveHue so synthetic overflow shifts apply too)
  if (effectiveHue !== 0) {
    sprites = hueShiftSprites(sprites, effectiveHue)
  }

  spriteCache.set(cacheKey, sprites)
  return sprites
}
