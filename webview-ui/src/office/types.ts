export {
  TILE_SIZE,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MAX_COLS,
  MAX_ROWS,
  MATRIX_EFFECT_DURATION_SEC as MATRIX_EFFECT_DURATION,
} from '../constants.js'

export const TileType = {
  WALL: 0,
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  FLOOR_4: 4,
  FLOOR_5: 5,
  FLOOR_6: 6,
  FLOOR_7: 7,
  VOID: 8,
} as const
export type TileType = (typeof TileType)[keyof typeof TileType]

/** Per-tile color settings for floor pattern colorization */
export interface FloorColor {
  /** Hue: 0-360 in colorize mode, -180 to +180 in adjust mode */
  h: number
  /** Saturation: 0-100 in colorize mode, -100 to +100 in adjust mode */
  s: number
  /** Brightness -100 to 100 */
  b: number
  /** Contrast -100 to 100 */
  c: number
  /** When true, use Photoshop-style Colorize (grayscale → fixed HSL). Default: adjust mode. */
  colorize?: boolean
}

export const CharacterState = {
  IDLE: 'idle',
  WALK: 'walk',
  TYPE: 'type',
  ENTERING: 'entering',
  LEAVING: 'leaving',
} as const
export type CharacterState = (typeof CharacterState)[keyof typeof CharacterState]

export const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
} as const
export type Direction = (typeof Direction)[keyof typeof Direction]

/** 2D array of hex color strings (or '' for transparent). [row][col] */
export type SpriteData = string[][]

export interface Seat {
  /** Chair furniture uid */
  uid: string
  /** Tile col where agent sits */
  seatCol: number
  /** Tile row where agent sits */
  seatRow: number
  /** Direction character faces when sitting (toward adjacent desk) */
  facingDir: Direction
  assigned: boolean
}

export interface FurnitureInstance {
  sprite: SpriteData
  /** Pixel x (top-left) */
  x: number
  /** Pixel y (top-left) */
  y: number
  /** Y value used for depth sorting (typically bottom edge) */
  zY: number
}

export interface ToolActivity {
  toolId: string
  status: string
  done: boolean
  permissionWait?: boolean
}

export const FurnitureType = {
  // Original hand-drawn sprites (kept for backward compat)
  DESK: 'desk',
  BOOKSHELF: 'bookshelf',
  PLANT: 'plant',
  COOLER: 'cooler',
  WHITEBOARD: 'whiteboard',
  CHAIR: 'chair',
  PC: 'pc',
  LAMP: 'lamp',
  DOOR: 'door',
  COFFEE_MACHINE: 'coffee_machine',
  BREAK_COUCH: 'break_couch',
} as const
export type FurnitureType = (typeof FurnitureType)[keyof typeof FurnitureType]

export const EditTool = {
  TILE_PAINT: 'tile_paint',
  WALL_PAINT: 'wall_paint',
  FURNITURE_PLACE: 'furniture_place',
  FURNITURE_PICK: 'furniture_pick',
  SELECT: 'select',
  EYEDROPPER: 'eyedropper',
  ERASE: 'erase',
  ZONE_PAINT: 'zone_paint',
} as const
export type EditTool = (typeof EditTool)[keyof typeof EditTool]

export interface FurnitureCatalogEntry {
  type: string // FurnitureType enum or asset ID
  label: string
  footprintW: number
  footprintH: number
  sprite: SpriteData
  isDesk: boolean
  category?: string
  /** Orientation from rotation group: 'front' | 'back' | 'left' | 'right' */
  orientation?: string
  /** Whether this item can be placed on top of desk/table surfaces */
  canPlaceOnSurfaces?: boolean
  /** Number of tile rows from the top of the footprint that are "background" (allow placement, still block walking). Default 0. */
  backgroundTiles?: number
  /** Whether this item can be placed on wall tiles */
  canPlaceOnWalls?: boolean
  /** Whether this item is a door (agents enter/exit through it) */
  isDoor?: boolean
  /** Whether this item is a break room item (agents go here when idle) */
  isBreakRoom?: boolean
  /** Whether this item is an interaction point (coffee machine, water cooler) */
  isInteractionPoint?: boolean
}

export interface PlacedFurniture {
  uid: string
  type: string // FurnitureType enum or asset ID
  col: number
  row: number
  /** Optional color override for furniture */
  color?: FloorColor
}

export const PetSpecies = {
  CAT: 'cat',
  DOG: 'dog',
} as const
export type PetSpecies = (typeof PetSpecies)[keyof typeof PetSpecies]

export const PetState = {
  IDLE: 'idle',
  WALK: 'walk',
  SLEEP: 'sleep',
  PLAY: 'play',
  SIT: 'sit',
} as const
export type PetState = (typeof PetState)[keyof typeof PetState]

export const PetPersonality = {
  LAZY: 'lazy',
  PLAYFUL: 'playful',
  CHILL: 'chill',
  ENERGETIC: 'energetic',
} as const
export type PetPersonality = (typeof PetPersonality)[keyof typeof PetPersonality]

export const PetPattern = {
  SOLID: 'solid',
  STRIPED: 'striped',
  SPOTTED: 'spotted',
  BICOLOR: 'bicolor',
  TUXEDO: 'tuxedo',
} as const
export type PetPattern = (typeof PetPattern)[keyof typeof PetPattern]

/** Per-part color customization for pets */
export interface PetColors {
  /** Body hex color (mid-tone; light/dark derived automatically) */
  body?: string
  /** Eye hex color */
  eyes?: string
  /** Nose hex color */
  nose?: string
  /** Coat pattern type */
  pattern?: PetPattern
  /** Secondary color for pattern (mid-tone hex) */
  patternColor?: string
}

export interface PlacedPet {
  uid: string
  species: PetSpecies
  name: string
  /** Tile column */
  col: number
  /** Tile row */
  row: number
  /** @deprecated Use petColors instead. Old single hue shift. */
  color?: FloorColor
  /** Per-part color customization (body, eyes, nose) */
  petColors?: PetColors
  /** Personality affects behavior weights */
  personality?: PetPersonality
}

export const PetBubble = {
  HEART: 'heart',
  HAPPY: 'happy',
} as const
export type PetBubble = (typeof PetBubble)[keyof typeof PetBubble]

export interface Pet {
  uid: string
  species: PetSpecies
  name: string
  state: PetState
  dir: Direction
  x: number
  y: number
  tileCol: number
  tileRow: number
  path: Array<{ col: number; row: number }>
  moveProgress: number
  frame: number
  frameTimer: number
  /** Current behavior timer (seconds remaining) */
  behaviorTimer: number
  /** @deprecated Use petColors instead */
  color?: FloorColor
  /** Per-part color customization (body, eyes, nose) */
  petColors?: PetColors
  /** Personality affects behavior weights */
  personality?: PetPersonality
  /** Active reaction bubble (heart for cats, happy for dogs) */
  reactionBubble: PetBubble | null
  /** Countdown timer for reaction bubble */
  reactionTimer: number
  /** Whether pet is perked up (agents using tools nearby) */
  isPerkedUp: boolean
  /** Countdown timer for perk state */
  perkTimer: number
}

export const WorldBackgroundTheme = {
  VOID: 'void',
  SUBURBAN: 'suburban',
  URBAN: 'urban',
  PARK: 'park',
  ROOFTOP: 'rooftop',
} as const
export type WorldBackgroundTheme = (typeof WorldBackgroundTheme)[keyof typeof WorldBackgroundTheme]

export interface PlacedDecoration {
  /** Decoration type key (e.g. 'suburban:tree_oak', 'suburban:car_red') */
  type: string
  /** Col relative to office top-left (can be negative for left/above) */
  col: number
  /** Row relative to office top-left (can be negative) */
  row: number
}

export interface WorldBackground {
  /** Theme identifier. 'void' = no background (default). */
  theme: WorldBackgroundTheme
  /** User-placed outdoor decorations (layered on top of procedural ones) */
  decorations?: PlacedDecoration[]
}

export const ZoneType = {
  CHILL: 'chill',
  FOCUS: 'focus',
} as const
export type ZoneType = (typeof ZoneType)[keyof typeof ZoneType]

export interface OfficeLayout {
  version: 1
  cols: number
  rows: number
  tiles: TileType[]
  furniture: PlacedFurniture[]
  /** Per-tile color settings, parallel to tiles array. null = wall/no color */
  tileColors?: Array<FloorColor | null>
  /** Per-tile zone designations, parallel to tiles array. null = no zone */
  zones?: Array<ZoneType | null>
  /** Pets placed in the office */
  pets?: PlacedPet[]
  /** World background theme and outdoor decorations */
  background?: WorldBackground
}

export interface Character {
  id: number
  state: CharacterState
  dir: Direction
  /** Pixel position */
  x: number
  y: number
  /** Current tile column */
  tileCol: number
  /** Current tile row */
  tileRow: number
  /** Remaining path steps (tile coords) */
  path: Array<{ col: number; row: number }>
  /** 0-1 lerp between current tile and next tile */
  moveProgress: number
  /** Current tool name for typing vs reading animation, or null */
  currentTool: string | null
  /** Palette index (0-5) */
  palette: number
  /** Hue shift in degrees (0 = no shift, ≥45 for repeated palettes) */
  hueShift: number
  /** Animation frame index */
  frame: number
  /** Time accumulator for animation */
  frameTimer: number
  /** Timer for idle wander decisions */
  wanderTimer: number
  /** Number of wander moves completed in current roaming cycle */
  wanderCount: number
  /** Max wander moves before returning to seat for rest */
  wanderLimit: number
  /** Whether the agent is actively working */
  isActive: boolean
  /** Whether the agent is in resting/break state (sustained idle) */
  isResting: boolean
  /** Assigned seat uid, or null if no seat */
  seatId: string | null
  /** Active speech bubble type, or null if none showing */
  bubbleType: 'permission' | 'waiting' | null
  /** Countdown timer for bubble (waiting: 2→0, permission: unused) */
  bubbleTimer: number
  /** Timer to stay seated while inactive after seat reassignment (counts down to 0) */
  seatTimer: number
  /** Whether this character represents a sub-agent (spawned by Task tool) */
  isSubagent: boolean
  /** Parent agent ID if this is a sub-agent, null otherwise */
  parentAgentId: number | null
  /** Active matrix spawn/despawn effect, or null */
  matrixEffect: 'spawn' | 'despawn' | null
  /** Timer counting up from 0 to MATRIX_EFFECT_DURATION */
  matrixEffectTimer: number
  /** Per-column random seeds (16 values) for staggered rain timing */
  matrixEffectSeeds: number[]
  /** Workspace folder name (only set for multi-root workspaces) */
  folderName?: string
}
