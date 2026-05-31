import type { SpriteData, WorldBackgroundTheme, TileType as TileTypeVal } from '../types.js'
import { TileType } from '../types.js'
import { GRASS_TILE, GRASS_TILE_2, SIDEWALK_TILE, ROAD_TILE, ROAD_CENTER_LINE, CURB_TILE, TREE_OAK, FLOWER_PATCH, LAMPPOST } from './backgroundSprites.js'

/** Zone layout around the office (distances in tiles from building edge) */
export interface ThemeZones {
  /** Tiles of sidewalk around the building */
  sidewalk: number
  /** Tiles of lawn/terrain beyond sidewalk */
  lawn: number
  /** Tiles of road beyond lawn (0 = no road) */
  road: number
}

export interface DecorationDef {
  type: string
  sprite: SpriteData
  /** Footprint in tiles (width x height) */
  footprintW: number
  footprintH: number
  /** Which zone this decoration spawns in */
  zone: 'lawn' | 'sidewalk' | 'road'
  /** How many tiles apart to space these (0 = don't auto-place) */
  spacing: number
}

export interface ThemeConfig {
  /** Sky/ground fill color for daytime */
  dayFill: string
  /** Sky/ground fill color for nighttime (interpolated with dayFill by darkness) */
  nightFill: string
  /** Ground tile sprites (cycled by position hash for variety) */
  groundTiles: SpriteData[]
  /** Sidewalk tile sprite */
  sidewalkTile: SpriteData
  /** Road tile sprite */
  roadTile: SpriteData
  /** Road center line tile (drawn on middle row of road) */
  roadCenterLine: SpriteData
  /** Curb tile (drawn between sidewalk and road) */
  curbTile: SpriteData
  /** Zone widths */
  zones: ThemeZones
  /** Decoration definitions for procedural placement */
  decorations: DecorationDef[]
}

const SUBURBAN_THEME: ThemeConfig = {
  dayFill: '#3a7a28',
  nightFill: '#080d1e',
  groundTiles: [GRASS_TILE, GRASS_TILE_2],
  sidewalkTile: SIDEWALK_TILE,
  roadTile: ROAD_TILE,
  roadCenterLine: ROAD_CENTER_LINE,
  curbTile: CURB_TILE,
  zones: {
    sidewalk: 2,
    lawn: 5,
    road: 3,
  },
  decorations: [
    {
      type: 'suburban:tree_oak',
      sprite: TREE_OAK,
      footprintW: 2,
      footprintH: 3,
      zone: 'lawn',
      spacing: 5,
    },
    {
      type: 'suburban:flower_patch',
      sprite: FLOWER_PATCH,
      footprintW: 1,
      footprintH: 1,
      zone: 'lawn',
      spacing: 7,
    },
    {
      type: 'suburban:lamppost',
      sprite: LAMPPOST,
      footprintW: 1,
      footprintH: 2,
      zone: 'sidewalk',
      spacing: 8,
    },
  ],
}

const THEME_REGISTRY: Partial<Record<WorldBackgroundTheme, ThemeConfig>> = {
  suburban: SUBURBAN_THEME,
}

export function getThemeConfig(theme: WorldBackgroundTheme): ThemeConfig | null {
  return THEME_REGISTRY[theme] ?? null
}

/**
 * Map a tile's distance from the building edge to an exterior TileType, using a
 * theme's zone bands. This is the SAME distance/band logic as
 * `renderWorldBackground.getZone` (sidewalk → lawn → curb → road_center → road →
 * grass), so painting a theme preset into `tiles[]` reproduces the procedural
 * ring's look. Returns `null` for tiles inside the building (the interior grid
 * owns those) so `applyThemePreset` leaves them alone.
 *
 * `officeCols/officeRows` describe the interior building region's bounding box
 * (passed by the caller). `col/row` are grid coords relative to that box's
 * top-left (i.e. building-local; negative or >= size means outside the box).
 */
export function getZoneTileType(
  col: number,
  row: number,
  officeCols: number,
  officeRows: number,
  zones: ThemeZones,
): TileTypeVal | null {
  const dLeft = -col
  const dRight = col - officeCols + 1
  const dTop = -row
  const dBottom = row - officeRows + 1
  const dist = Math.max(dLeft, dRight, dTop, dBottom)

  if (dist <= 0) return null // inside building — interior grid owns this

  const { sidewalk, lawn, road } = zones
  if (dist <= sidewalk) return TileType.SIDEWALK
  if (dist <= sidewalk + lawn) return TileType.GRASS
  if (road > 0) {
    const roadStart = sidewalk + lawn + 1 // +1 for curb
    if (dist === sidewalk + lawn + 1) return TileType.CURB
    const roadMiddle = roadStart + Math.floor(road / 2)
    if (dist === roadMiddle) return TileType.ROAD_LINE
    if (dist <= roadStart + road) return TileType.ROAD
  }
  return TileType.GRASS
}
