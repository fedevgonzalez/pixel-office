import type { SpriteData, WorldBackgroundTheme } from '../types.js'
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
  nightFill: '#0a1208',
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
