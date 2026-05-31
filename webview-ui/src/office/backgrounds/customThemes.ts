import type { CustomThemePreset, FloorColor, OfficeLayout, PlacedDecoration } from '../types.js'
import { isExteriorTile } from '../layout/tileKinds.js'
import { getThemeConfig, type ThemeConfig, type ThemeZones } from './backgroundThemes.js'
import { GRASS_TILE, GRASS_TILE_2, SIDEWALK_TILE, ROAD_TILE, ROAD_CENTER_LINE, CURB_TILE } from './backgroundSprites.js'
import { DEFAULT_NEUTRAL_COLOR } from '../../constants.js'

/**
 * Phase D — client-side custom-theme registry. Custom themes live in sidecar
 * files on the server (`~/.pixel-office/themes/<id>.json`, mirroring
 * pet-templates) and are pushed to the webview as `themesLoaded`. This module is
 * the in-memory source of truth the editor reads from.
 *
 * A custom theme is a `CustomThemePreset` (D6): zone bands + per-TileType color
 * overrides + day/night fills + optional decoration template. It is resolved
 * into a `ThemeConfig` (the shape `applyThemePreset` already consumes) by reusing
 * the built-in exterior tile sprites and overriding zones/fills/decorations — no
 * sprite bytes are ever stored in the preset.
 */

/** All custom-theme ids are namespaced with this prefix so they never collide
 *  with built-in `WorldBackgroundTheme` values ('suburban', 'urban', …). */
export const CUSTOM_THEME_PREFIX = 'custom:'

export function isCustomThemeId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(CUSTOM_THEME_PREFIX)
}

let customThemes: CustomThemePreset[] = []

/** Replace the loaded custom-theme set (called on `themesLoaded`). */
export function setCustomThemes(themes: CustomThemePreset[]): void {
  customThemes = Array.isArray(themes) ? themes.filter(isValidPreset) : []
}

export function getCustomThemes(): CustomThemePreset[] {
  return customThemes
}

export function getCustomTheme(id: string | null | undefined): CustomThemePreset | null {
  if (!id) return null
  return customThemes.find((t) => t.id === id) ?? null
}

function isValidPreset(t: unknown): t is CustomThemePreset {
  if (!t || typeof t !== 'object') return false
  const p = t as Partial<CustomThemePreset>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    !!p.zones &&
    typeof p.zones.sidewalk === 'number' &&
    typeof p.zones.lawn === 'number' &&
    typeof p.zones.road === 'number' &&
    !!p.tileColors && typeof p.tileColors === 'object' &&
    typeof p.dayFill === 'string' &&
    typeof p.nightFill === 'string'
  )
}

/**
 * Resolve a `CustomThemePreset` into the `ThemeConfig` shape that
 * `fillThemePreset` / `renderWorldBackground` consume. Reuses the built-in
 * exterior tile sprites (referenced by TileType, never inlined) and overrides
 * the zone bands + day/night fills with the preset's. Decoration *placement* is
 * carried separately (`preset.decorations`) — the procedural `decorations` array
 * stays empty so a custom theme never auto-scatters trees.
 */
export function customThemeToConfig(preset: CustomThemePreset): ThemeConfig {
  return {
    dayFill: preset.dayFill,
    nightFill: preset.nightFill,
    groundTiles: [GRASS_TILE, GRASS_TILE_2],
    sidewalkTile: SIDEWALK_TILE,
    roadTile: ROAD_TILE,
    roadCenterLine: ROAD_CENTER_LINE,
    curbTile: CURB_TILE,
    zones: { ...preset.zones } as ThemeZones,
    decorations: [],
  }
}

/** Per-tile-type color palette for a custom theme, keyed by TileType number as a
 *  string. Returns the override for a tile or `null` if the preset has none. */
export function customThemeTileColor(preset: CustomThemePreset, tileType: number): FloorColor | null {
  const c = preset.tileColors[String(tileType)]
  return c ? { ...c } : null
}

/**
 * Capture the current map's exterior as a savable `CustomThemePreset`. Reads:
 *  - zone bands: from the resolved config of the layout's current theme (or
 *    suburban defaults) — these drive how a future apply lays out the ring.
 *  - per-TileType colors: the MOST COMMON `tileColors[i]` seen for each exterior
 *    TileType currently painted, so re-applying reproduces the user's recolor.
 *  - day/night fills: from the current theme config (or suburban defaults).
 *  - decorations: the layout's `background.decorations` template, copied as-is.
 *
 * `id` must already be namespaced (`custom:`); `name` is the display label.
 */
export function buildCustomThemePresetFromLayout(
  layout: OfficeLayout,
  id: string,
  name: string,
): CustomThemePreset {
  const baseThemeId = layout.background?.theme ?? 'suburban'
  const baseConfig = getThemeConfig(baseThemeId) ?? getThemeConfig('suburban')
  const zones = baseConfig
    ? { sidewalk: baseConfig.zones.sidewalk, lawn: baseConfig.zones.lawn, road: baseConfig.zones.road }
    : { sidewalk: 2, lawn: 5, road: 3 }
  const dayFill = baseConfig?.dayFill ?? '#3a7a28'
  const nightFill = baseConfig?.nightFill ?? '#080d1e'

  // Tally the colors painted on each exterior TileType, pick the most common.
  const tally = new Map<number, Map<string, { color: FloorColor; n: number }>>()
  const colors = layout.tileColors
  for (let i = 0; i < layout.tiles.length; i++) {
    const t = layout.tiles[i]
    if (!isExteriorTile(t)) continue
    const c = colors?.[i]
    if (!c) continue
    const key = `${c.h}|${c.s}|${c.b}|${c.c}|${c.colorize ? 1 : 0}`
    let perType = tally.get(t)
    if (!perType) { perType = new Map(); tally.set(t, perType) }
    const slot = perType.get(key)
    if (slot) slot.n++
    else perType.set(key, { color: { ...c }, n: 1 })
  }

  const tileColors: Record<string, FloorColor> = {}
  for (const [tileType, perType] of tally) {
    let best: { color: FloorColor; n: number } | null = null
    for (const slot of perType.values()) {
      if (!best || slot.n > best.n) best = slot
    }
    if (best) tileColors[String(tileType)] = best.color
  }

  const decorations: PlacedDecoration[] | undefined = layout.background?.decorations
    ? layout.background.decorations.map((d) => ({ ...d }))
    : undefined

  return {
    id,
    name,
    version: 1,
    zones,
    tileColors,
    dayFill,
    nightFill,
    ...(decorations && decorations.length > 0 ? { decorations } : {}),
  }
}

/** Generate a fresh namespaced custom-theme id from a display name. */
export function makeCustomThemeId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'theme'
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${CUSTOM_THEME_PREFIX}${slug}-${suffix}`
}

/** Neutral fallback color for exterior tiles a preset doesn't recolor. */
export const NEUTRAL_TILE_COLOR: FloorColor = { ...DEFAULT_NEUTRAL_COLOR }
