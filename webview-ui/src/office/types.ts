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
  // ── Exterior tile types (contiguous from 9 so `t >= 9` ⇒ "is exterior").
  //    Painted into the unified `tiles[]` grid (D1); no separate exterior array.
  //    A1 introduces only the data model — sprites/rendering land in A2.
  GRASS: 9,
  GRASS_ALT: 10,
  SIDEWALK: 11,
  ROAD: 12,
  ROAD_LINE: 13,
  CURB: 14,
  PATH: 15,
  WATER: 16,
  FENCE: 17,
  DIRT: 18,
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
  /** Optional alternate sprite shown when the scene is dark (night). Used by
   *  lamp furniture so the renderer can swap to a glowing ON variant at night
   *  while keeping the unlit OFF variant in `sprite` for the day. */
  onSprite?: SpriteData
}

export interface ToolActivity {
  toolId: string
  status: string
  done: boolean
  permissionWait?: boolean
}

/**
 * Per-agent context-window occupancy, shown inline next to the agent in the
 * kiosk sidebar. `pct` is a fraction [0,1]; tokens/limit are optional for a
 * "X / Y" detail. Computed by the reporter (tool-specific) and forwarded by
 * the server as a generic `agentContext` event.
 */
export interface AgentContext {
  pct: number
  tokens?: number
  limit?: number
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
  TABLE_2X1: 'table_2x1',
  PROJECTOR: 'projector',
  COUNTER: 'counter',
  COUNTER_2X1: 'counter_2x1',
  WALL_SHELF: 'wall_shelf',
  WALL_CABINET: 'wall_cabinet',
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
  /** Paint per-actor movement boundary (Phase B). The active actor mask is held
   *  in EditorState.activeBoundaryActor. */
  BOUNDARY_PAINT: 'boundary_paint',
  /** Place / remove first-class interaction points (Phase C / D4). The type to
   *  place is held in EditorState.selectedInteractionType; left-click places,
   *  right-click removes the point under the cursor. */
  INTERACTION_PLACE: 'interaction_place',
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
  /** Whether this item acts as a surface that others (with canPlaceOnSurfaces) can be stacked onto. */
  providesSurface?: boolean
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
  /** Selected breed/variant — picks a server-loaded PNG sprite when set. */
  variant?: string
  /** @deprecated Use petColors instead. Old single hue shift. */
  color?: FloorColor
  /** Per-part color customization (body, eyes, nose) — only applies when variant is NOT set. */
  petColors?: PetColors
  /** Per-zone recoloring of the variant sprite (srcHex → dstHex). Applies when `variant` is set. */
  variantColors?: Record<string, string>
  /** Personality affects behavior weights */
  personality?: PetPersonality
  /** Free-text backstory used by narration integrations to colour the pet's voice */
  backstory?: string
  /** Short tag describing the pet's speech style (e.g. "snobby", "gossipy", "deadpan") */
  voiceStyle?: string
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
  /** Selected breed/variant. When set, the pet uses a server-loaded PNG sprite. */
  variant?: string
  /** @deprecated Use petColors instead */
  color?: FloorColor
  /** Per-part color customization (body, eyes, nose) — ignored when `variant` is set. */
  petColors?: PetColors
  /** Per-zone recoloring of the variant sprite (srcHex → dstHex). Applies when `variant` is set. */
  variantColors?: Record<string, string>
  /** Personality affects behavior weights */
  personality?: PetPersonality
  /** Active reaction bubble (heart for cats, happy for dogs) */
  reactionBubble: PetBubble | null
  /** Countdown timer for reaction bubble */
  reactionTimer: number
  /** Walking to the play zone with intent to play on arrival. */
  wantsToPlay?: boolean
  /** Countdown to the next "look around" while playing (seconds). */
  playLookTimer?: number
  /** Whether pet is perked up (agents using tools nearby) */
  isPerkedUp: boolean
  /** Countdown timer for perk state */
  perkTimer: number
  /** Current speech bubble text, or null if none showing */
  speechText: string | null
  /** Countdown timer for speech bubble (seconds remaining) */
  speechTimer: number
  /** Original duration of the current speech bubble, for fade-out alpha */
  speechFullDuration: number
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
  /**
   * Resolved theme id used the last time a preset was applied. May be a built-in
   * `WorldBackgroundTheme` value (e.g. 'suburban') OR a custom-theme id (e.g.
   * 'custom:my-yard'). Optional & non-breaking: a client that doesn't know about
   * custom themes ignores this and the exterior tiles already painted into
   * `tiles[]` keep the look regardless (Phase D / D6). An unknown/missing custom
   * theme falls back gracefully to `theme` (a built-in) at apply time.
   */
  themeId?: string
  /** User-placed outdoor decorations (layered on top of procedural ones) */
  decorations?: PlacedDecoration[]
}

/**
 * A savable custom theme preset (Phase D / D6). Captures everything needed to
 * RE-APPLY a themed exterior as a reusable preset, kept small by referencing
 * sprites by id (the exterior `TileType` number, stringified) and storing only
 * the per-tile-type color overrides + zone bands + day/night fills + an optional
 * decoration template — never inlined `SpriteData`.
 *
 * Stored as a sidecar file `~/.pixel-office/themes/<id>.json` on the server
 * (mirroring `pet-templates.json`), NOT embedded in `layout.json`, so layouts
 * stay small and community-shareable. Layouts reference one by
 * `background.themeId`.
 */
export interface CustomThemePreset {
  /** Stable, namespaced id (always prefixed `custom:`). */
  id: string
  /** Human-readable name shown in the theme picker. */
  name: string
  /** Schema version of the preset format (currently 1). */
  version: number
  /** Zone band widths (sidewalk / lawn / road), same shape a built-in uses. */
  zones: { sidewalk: number; lawn: number; road: number }
  /**
   * Per-exterior-TileType color override. Keyed by the `TileType` number as a
   * string (e.g. "9" = GRASS). Applied to each painted tile when the preset is
   * filled. Tiles without an entry get a neutral color.
   */
  tileColors: Record<string, FloorColor>
  /** Sky/ground fill color for daytime (behind the grid). */
  dayFill: string
  /** Sky/ground fill color for nighttime. */
  nightFill: string
  /** Optional decoration template (placed relative to the building top-left). */
  decorations?: PlacedDecoration[]
  /** ISO timestamps (server-managed). */
  createdAt?: string
  updatedAt?: string
}

export const ZoneType = {
  FOCUS: 'focus',
  /** Green "play" area — pets walk here to play. */
  PLAY: 'play',
} as const
export type ZoneType = (typeof ZoneType)[keyof typeof ZoneType]

/**
 * Per-actor movement boundary masks, each parallel to `tiles` (length = cols*rows).
 * `true` = that actor may enter the tile, `false` = blocked, `null` = no opinion
 * for that cell. A whole mask that is `null`/absent means "unrestricted" — legacy
 * behavior where the actor roams anywhere walkable (D3). Runtime converts each
 * mask into a `Set<string>` once on rebuild (Phase B); A1 only carries the type.
 */
export interface MovementBoundary {
  character?: Array<boolean | null> | null
  pet?: Array<boolean | null> | null
}

/**
 * First-class interaction point (coffee machine, water cooler, …). Resolved
 * BEFORE furniture `isBreakRoom`/`isInteractionPoint` flags (D4). Migration
 * derives these from furniture once; A1 only carries the type + populates them
 * in `migrateLayout`. Behavior wiring lands in Phase C.
 */
export interface PlacedInteractionPoint {
  /** Stable unique id */
  uid: string
  /** Behavior key — 'coffee'/'cooler' have engine behavior; custom = marker only */
  type: string
  /** Tile column */
  col: number
  /** Tile row */
  row: number
  /** Optional reach radius in tiles (defaults applied at runtime in Phase C) */
  interactionRadius?: number
  /** Which actors use this point. Absent = both (legacy/derived default). */
  requiredBy?: 'pet' | 'char' | 'both'
  /** Set when this point was auto-derived from a furniture flag during migration */
  derivedFromFurnitureUid?: string
}

/**
 * Interaction-point behavior catalog (Phase C). `coffee` / `cooler` have engine
 * behavior (idle agents path to a walkable tile adjacent to them, like a break
 * room); other types are markers only. Keyed by the `type` string stored on
 * PlacedInteractionPoint, so this stays open to custom marker types. `behavior`
 * = true means the runtime treats the point as a break/interaction destination.
 */
export const INTERACTION_POINT_TYPES = [
  { type: 'coffee', label: 'Coffee', icon: '☕', behavior: true },
  { type: 'cooler', label: 'Water cooler', icon: '🚰', behavior: true },
  { type: 'break', label: 'Break spot', icon: '🛋', behavior: true },
  { type: 'meeting', label: 'Meeting', icon: '📋', behavior: false },
] as const
export type InteractionPointTypeDef = (typeof INTERACTION_POINT_TYPES)[number]

/** Default reach radius (in tiles) used when a point has no explicit
 *  `interactionRadius`. The engine collects walkable tiles within this ring of
 *  the point as its usable destinations. */
export const DEFAULT_INTERACTION_RADIUS = 1

export interface OfficeLayout {
  /** Schema version. Loaders accept 1 (legacy) and migrate to 2. */
  version: 1 | 2
  cols: number
  rows: number
  tiles: TileType[]
  furniture: PlacedFurniture[]
  /** Per-tile color settings, parallel to tiles array. null = wall/no color */
  tileColors?: Array<FloorColor | null>
  /** Per-tile floor theme id, parallel to tiles array. null = non-floor or unpainted. */
  tileThemes?: Array<string | null>
  /** Per-tile zone designations, parallel to tiles array. null = no zone */
  zones?: Array<ZoneType | null>
  /** Pets placed in the office */
  pets?: PlacedPet[]
  /** World background theme and outdoor decorations */
  background?: WorldBackground
  /**
   * Per-actor movement boundary masks (Phase B). Optional & non-breaking:
   * absent ⇒ unrestricted (legacy). When present, masks are parallel to `tiles`.
   */
  movementBoundary?: MovementBoundary
  /**
   * First-class interaction points (Phase C). Optional & non-breaking: absent
   * ⇒ furniture-flag derivation is used. Migration populates this once.
   */
  interactionPoints?: PlacedInteractionPoint[]
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
  /** Active free-text speech bubble (LLM-generated dialog), or null */
  speechText: string | null
  /** Countdown timer for the free-text bubble (seconds remaining) */
  speechTimer: number
  /** Original duration of the current free-text bubble, for fade-out alpha */
  speechFullDuration: number
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
