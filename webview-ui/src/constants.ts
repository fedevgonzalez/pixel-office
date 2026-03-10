import type { FloorColor } from './office/types.js'

// ── Grid & Layout ────────────────────────────────────────────
export const TILE_SIZE = 16
export const DEFAULT_COLS = 20
export const DEFAULT_ROWS = 11
export const MAX_COLS = 64
export const MAX_ROWS = 64

// ── Character Animation ─────────────────────────────────────
export const WALK_SPEED_PX_PER_SEC = 48
export const WALK_FRAME_DURATION_SEC = 0.15
export const TYPE_FRAME_DURATION_SEC = 0.3
export const WANDER_PAUSE_MIN_SEC = 2.0
export const WANDER_PAUSE_MAX_SEC = 20.0
export const WANDER_MOVES_BEFORE_REST_MIN = 3
export const WANDER_MOVES_BEFORE_REST_MAX = 6
export const SEAT_REST_MIN_SEC = 120.0
export const SEAT_REST_MAX_SEC = 240.0

// ── Matrix Effect ────────────────────────────────────────────
export const MATRIX_EFFECT_DURATION_SEC = 0.3
export const MATRIX_TRAIL_LENGTH = 6
export const MATRIX_SPRITE_COLS = 16
export const MATRIX_SPRITE_ROWS = 24
export const MATRIX_FLICKER_FPS = 30
export const MATRIX_FLICKER_VISIBILITY_THRESHOLD = 180
export const MATRIX_COLUMN_STAGGER_RANGE = 0.3
export const MATRIX_HEAD_COLOR = '#ccffcc'
export const MATRIX_TRAIL_OVERLAY_ALPHA = 0.6
export const MATRIX_TRAIL_EMPTY_ALPHA = 0.5
export const MATRIX_TRAIL_MID_THRESHOLD = 0.33
export const MATRIX_TRAIL_DIM_THRESHOLD = 0.66

// ── Rendering ────────────────────────────────────────────────
export const CHARACTER_SITTING_OFFSET_PX = 6
export const CHARACTER_Z_SORT_OFFSET = 0.5
export const OUTLINE_Z_SORT_OFFSET = 0.001
export const SELECTED_OUTLINE_ALPHA = 1.0
export const HOVERED_OUTLINE_ALPHA = 0.5
export const GHOST_PREVIEW_SPRITE_ALPHA = 0.5
export const GHOST_PREVIEW_TINT_ALPHA = 0.25
export const SELECTION_DASH_PATTERN: [number, number] = [4, 3]
export const BUTTON_MIN_RADIUS = 6
export const BUTTON_RADIUS_ZOOM_FACTOR = 3
export const BUTTON_ICON_SIZE_FACTOR = 0.45
export const BUTTON_LINE_WIDTH_MIN = 1.5
export const BUTTON_LINE_WIDTH_ZOOM_FACTOR = 0.5
export const BUBBLE_FADE_DURATION_SEC = 0.5
export const BUBBLE_SITTING_OFFSET_PX = 10
export const BUBBLE_VERTICAL_OFFSET_PX = 24
export const FALLBACK_FLOOR_COLOR = '#808080'

// ── Rendering - Overlay Colors (canvas, not CSS) ─────────────
export const SEAT_OWN_COLOR = 'rgba(0, 127, 212, 0.35)'
export const SEAT_AVAILABLE_COLOR = 'rgba(0, 200, 80, 0.35)'
export const SEAT_BUSY_COLOR = 'rgba(220, 50, 50, 0.35)'
export const GRID_LINE_COLOR = 'rgba(255,255,255,0.12)'
export const VOID_TILE_OUTLINE_COLOR = 'rgba(255,255,255,0.08)'
export const VOID_TILE_DASH_PATTERN: [number, number] = [2, 2]
export const GHOST_BORDER_HOVER_FILL = 'rgba(60, 130, 220, 0.25)'
export const GHOST_BORDER_HOVER_STROKE = 'rgba(60, 130, 220, 0.5)'
export const GHOST_BORDER_STROKE = 'rgba(255, 255, 255, 0.06)'
export const GHOST_VALID_TINT = '#00ff00'
export const GHOST_INVALID_TINT = '#ff0000'
export const SELECTION_HIGHLIGHT_COLOR = '#007fd4'

// ── Zone Overlay Colors (edit mode only) ─────────────────────
export const ZONE_CHILL_FILL = 'rgba(124, 200, 140, 0.22)'
export const ZONE_CHILL_BORDER = 'rgba(124, 200, 140, 0.55)'
export const ZONE_FOCUS_FILL = 'rgba(100, 140, 220, 0.22)'
export const ZONE_FOCUS_BORDER = 'rgba(100, 140, 220, 0.55)'
export const DELETE_BUTTON_BG = 'rgba(200, 50, 50, 0.85)'
export const ROTATE_BUTTON_BG = 'rgba(50, 120, 200, 0.85)'

// ── Camera ───────────────────────────────────────────────────
export const CAMERA_FOLLOW_LERP = 0.1
export const CAMERA_FOLLOW_SNAP_THRESHOLD = 0.5

// ── Kiosk Auto-Frame ────────────────────────────────────────
// Character bounding box offsets (world pixels)
export const KIOSK_CHAR_BBOX_HALF_WIDTH = 16
export const KIOSK_CHAR_BBOX_TOP = 40
export const KIOSK_CHAR_BBOX_BOTTOM = 16
// Padding: base + per-viewport fraction (adapts to screen size)
export const KIOSK_PAD_SINGLE = 48
export const KIOSK_PAD_MULTI = 32
export const KIOSK_PAD_VIEWPORT_FRACTION = 0.05
// Minimum bbox size to prevent extreme zoom
export const KIOSK_BBOX_MIN = 64
// Zoom lerp thresholds (adaptive speed: fast approach, slow settle)
export const KIOSK_ZOOM_LERP_FAST_THRESHOLD = 2
export const KIOSK_ZOOM_LERP_FAST = 0.04
export const KIOSK_ZOOM_LERP_MID_THRESHOLD = 0.5
export const KIOSK_ZOOM_LERP_MID = 0.035
export const KIOSK_ZOOM_LERP_SLOW = 0.025
// Pan lerp thresholds (adaptive speed like zoom)
export const KIOSK_PAN_LERP_FAST_THRESHOLD = 200
export const KIOSK_PAN_LERP_FAST = 0.05
export const KIOSK_PAN_LERP_MID_THRESHOLD = 50
export const KIOSK_PAN_LERP_MID = 0.04
export const KIOSK_PAN_LERP_SLOW = 0.03
// Deadzone: ignore target changes smaller than this (world pixels) to prevent jitter
export const KIOSK_DEADZONE_PX = 3
// Target smoothing: lerp factor for bbox target itself (smooths active↔idle transitions)
// Slow value (0.03) means a large bbox shift takes ~3s to complete, giving a cinematic glide
export const KIOSK_TARGET_SMOOTHING = 0.03
// Full-office view: padding (in tiles) added around the map bounds when all agents are idle
export const KIOSK_FULL_OFFICE_PAD_TILES = 1
// React state sync interval (ms) and threshold
export const KIOSK_SYNC_INTERVAL_MS = 100
export const KIOSK_SYNC_THRESHOLD = 0.05
// Status panel
export const KIOSK_STATUS_PANEL_UPDATE_MS = 2000
export const KIOSK_STATUS_PANEL_WIDTH = 440

// ── Zoom ─────────────────────────────────────────────────────
export const ZOOM_MIN = 1
export const ZOOM_MAX = 10
export const ZOOM_DEFAULT_DPR_FACTOR = 2
export const ZOOM_LEVEL_FADE_DELAY_MS = 1500
export const ZOOM_LEVEL_HIDE_DELAY_MS = 2000
export const ZOOM_LEVEL_FADE_DURATION_SEC = 0.5
export const ZOOM_SCROLL_THRESHOLD = 50
export const PAN_MARGIN_FRACTION = 0.25

// ── Screenshot mode ──────────────────────────────────────────
export const SCREENSHOT_PADDING_TILES = 2 // padding in tiles around the office

// ── Editor ───────────────────────────────────────────────────
export const UNDO_STACK_MAX_SIZE = 50
export const LAYOUT_SAVE_DEBOUNCE_MS = 500
export const DEFAULT_FLOOR_COLOR: FloorColor = { h: 35, s: 30, b: 15, c: 0 }
export const DEFAULT_WALL_COLOR: FloorColor = { h: 240, s: 25, b: 0, c: 0 }
export const DEFAULT_NEUTRAL_COLOR: FloorColor = { h: 0, s: 0, b: 0, c: 0 }

// ── Notification Sound ──────────────────────────────────────
export const NOTIFICATION_NOTE_1_HZ = 659.25   // E5
export const NOTIFICATION_NOTE_2_HZ = 1318.51  // E6 (octave up)
export const NOTIFICATION_NOTE_1_START_SEC = 0
export const NOTIFICATION_NOTE_2_START_SEC = 0.1
export const NOTIFICATION_NOTE_DURATION_SEC = 0.18
export const NOTIFICATION_VOLUME = 0.14

// ── Gallery ─────────────────────────────────────────────────
export const GALLERY_CARD_MIN_WIDTH = 280
export const GALLERY_CARD_GAP = 12
export const GALLERY_CARD_PADDING = 8

// ── Pets ────────────────────────────────────────────────────
export const PET_WALK_SPEED_PX_PER_SEC = 32
export const PET_WALK_FRAME_DURATION_SEC = 0.2
export const PET_IDLE_MIN_SEC = 3.0
export const PET_IDLE_MAX_SEC = 10.0
export const PET_SLEEP_MIN_SEC = 15.0
export const PET_SLEEP_MAX_SEC = 60.0
export const PET_SLEEP_FRAME_DURATION_SEC = 1.0
export const PET_WANDER_MOVES_MIN = 2
export const PET_WANDER_MOVES_MAX = 5
export const PET_SPRITE_WIDTH = 16
export const PET_SPRITE_HEIGHT = 16
export const PET_HIT_HALF_WIDTH = 8
export const PET_HIT_HEIGHT = 16
export const PET_NAME_LABEL_Y_OFFSET = 18
export const PET_REACTION_DURATION_SEC = 2.0
export const PET_IDLE_OFFICE_THRESHOLD_SEC = 120.0
export const PET_PERK_DURATION_SEC = 1.5
export const PET_DOG_FOLLOW_CHANCE = 0.3
export const PET_DOG_FOLLOW_MAX_DIST = 6
export const PET_ZZZ_FRAME_DURATION_SEC = 0.8
export const PET_MAX_NAME_LENGTH = 20
export const PET_PREVIEW_CANVAS_SIZE = 96
export const PET_PREVIEW_SCALE = 6
export const PET_LIST_PREVIEW_CANVAS_SIZE = 32
export const PET_LIST_PREVIEW_SCALE = 2

/** Source palette colors for cat sprites (used for palette swap) */
export const CAT_PALETTE = {
  bodyLight: '#e8e0d0',
  bodyMid: '#b0a090',
  bodyDark: '#807060',
  eyes: '#40c040',
  nose: '#f0a0b0',
  tail: '#c09080',
  outline: '#2a2a3a',
} as const

/** Source palette colors for dog sprites (used for palette swap) */
export const DOG_PALETTE = {
  bodyLight: '#c09060',
  bodyMid: '#906840',
  bodyDark: '#4a3020',
  eyes: '#201008',
  nose: '#302010',
  outline: '#2a2a3a',
} as const

/** Preset body colors for the pet color picker */
export const PET_BODY_PRESETS: Array<{ label: string; hex: string }> = [
  { label: 'Default', hex: '' },
  { label: 'Black', hex: '#2a2a2a' },
  { label: 'White', hex: '#e8e0d8' },
  { label: 'Orange', hex: '#d08030' },
  { label: 'Gray', hex: '#808080' },
  { label: 'Cream', hex: '#d8c8a0' },
  { label: 'Brown', hex: '#705030' },
  { label: 'Ginger', hex: '#c06020' },
  { label: 'Silver', hex: '#a0a8b0' },
  { label: 'Chocolate', hex: '#503020' },
]

/** Preset eye colors for the pet color picker */
export const PET_EYE_PRESETS: Array<{ label: string; hex: string }> = [
  { label: 'Default', hex: '' },
  { label: 'Green', hex: '#40c040' },
  { label: 'Blue', hex: '#4088e0' },
  { label: 'Amber', hex: '#d0a020' },
  { label: 'Brown', hex: '#806030' },
  { label: 'Yellow', hex: '#d0d040' },
  { label: 'Copper', hex: '#c07020' },
  { label: 'Aqua', hex: '#40c0c0' },
  { label: 'Gold', hex: '#e0c030' },
]

/** Preset nose colors for the pet color picker */
export const PET_NOSE_PRESETS: Array<{ label: string; hex: string }> = [
  { label: 'Default', hex: '' },
  { label: 'Pink', hex: '#f0a0b0' },
  { label: 'Black', hex: '#303030' },
  { label: 'Brown', hex: '#704030' },
  { label: 'Peach', hex: '#e0b090' },
]

/** Pattern options for the pet pattern picker */
export const PET_PATTERN_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: 'solid', label: 'Solid', desc: 'Single color coat' },
  { value: 'striped', label: 'Striped', desc: 'Tabby-style bands' },
  { value: 'spotted', label: 'Spotted', desc: 'Scattered spots' },
  { value: 'bicolor', label: 'Bicolor', desc: 'Two-tone split' },
  { value: 'tuxedo', label: 'Tuxedo', desc: 'Dark back, light chest' },
]

/** Preset secondary colors for patterns */
export const PET_PATTERN_COLOR_PRESETS: Array<{ label: string; hex: string }> = [
  { label: 'White', hex: '#e8e0d8' },
  { label: 'Black', hex: '#2a2a2a' },
  { label: 'Orange', hex: '#d08030' },
  { label: 'Gray', hex: '#808080' },
  { label: 'Cream', hex: '#d8c8a0' },
  { label: 'Brown', hex: '#705030' },
  { label: 'Ginger', hex: '#c06020' },
]

/** Default pattern color for tuxedo (white chest) */
export const PET_TUXEDO_DEFAULT_COLOR = '#e8e0d8'

// ── Break Room ──────────────────────────────────────────────
/** Chance (0-1) an idle agent visits a break room item instead of random wandering */
export const BREAK_ROOM_VISIT_CHANCE = 0.25
/** How long an agent idles at a break room item (coffee machine, couch) */
export const BREAK_ROOM_REST_MIN_SEC = 5.0
export const BREAK_ROOM_REST_MAX_SEC = 15.0

// ── Day/Night Cycle ─────────────────────────────────────────
/** Time period boundaries (24h clock) */
export const DN_SUNRISE_START = 5.5   // 5:30 AM
export const DN_SUNRISE_END = 7.0     // 7:00 AM
export const DN_SUNSET_START = 18.0   // 6:00 PM (adjusted per season)
export const DN_SUNSET_END = 20.0     // 8:00 PM (adjusted per season)
export const DN_EVENING_END = 21.5    // 9:30 PM

/** Seasonal sunset offset (hours): summer = later sunset, winter = earlier */
export const DN_SUMMER_OFFSET_H = 1.5
export const DN_WINTER_OFFSET_H = -1.5

/** Tint colors per time period (RGBA overlays using globalCompositeOperation 'multiply') */
export const DN_TINT_NIGHT = 'rgba(20, 15, 45, 0.55)'
export const DN_TINT_SUNRISE = 'rgba(255, 180, 100, 0.12)'
export const DN_TINT_DAY = 'rgba(0, 0, 0, 0)'
export const DN_TINT_SUNSET = 'rgba(255, 120, 60, 0.18)'
export const DN_TINT_EVENING = 'rgba(30, 20, 50, 0.35)'

/** Light source glow radius (in tile units, scaled by zoom) */
export const DN_GLOW_RADIUS_TILES = 3.0
/** Maximum glow alpha at night */
export const DN_GLOW_MAX_ALPHA = 0.45
/** Warm light color (lamps, etc.) */
export const DN_GLOW_WARM = 'rgba(255, 200, 100, 1)'
/** Cool light color (monitors, PCs) */
export const DN_GLOW_COOL = 'rgba(100, 160, 255, 1)'

/** Transition speed: seconds to fully blend between time periods */
export const DN_TRANSITION_BLEND_SEC = 1800 // 30 minutes real-time equivalent

// ── Kiosk Clock Widget ───────────────────────────────────────
/** How often the kiosk clock re-reads wall time (ms) */
export const KIOSK_CLOCK_UPDATE_MS = 60_000
/** Default opacity of the widget — dim so it recedes into the scene */
export const KIOSK_CLOCK_OPACITY = 0.75
/** Margin from the bottom-right viewport edge (px) */
export const KIOSK_CLOCK_MARGIN = 16

// ── Resting Agent System ────────────────────────────────────
/** Sprite alpha for resting (on-break) agents — dimmer than active */
export const RESTING_AGENT_SPRITE_ALPHA = 0.72
/** Font scale factor for resting agent name labels (vs 16 for pets) */
export const RESTING_AGENT_LABEL_FONT_SCALE = 14
/** Text alpha for resting agent labels — hint tier */
export const RESTING_AGENT_LABEL_TEXT_ALPHA = 0.55
/** Background alpha for resting agent label pills */
export const RESTING_AGENT_LABEL_BG_ALPHA = 0.75
/** Border alpha for resting agent label pills (amber) */
export const RESTING_AGENT_LABEL_BORDER_ALPHA = 0.25
/** Font size (px) for kiosk sidebar "N on break" footer */
export const RESTING_COUNT_LABEL_FONT_SIZE = 22

// ── World Background ────────────────────────────────────────
/** Extra padding tiles in kiosk full-office view when a background theme is active */
export const KIOSK_BG_PAD_TILES = 3

// ── Game Logic ───────────────────────────────────────────────
export const MAX_DELTA_TIME_SEC = 0.1
export const WAITING_BUBBLE_DURATION_SEC = 2.0
export const DISMISS_BUBBLE_FAST_FADE_SEC = 0.3
export const INACTIVE_SEAT_TIMER_MIN_SEC = 3.0
export const INACTIVE_SEAT_TIMER_RANGE_SEC = 2.0
export const PALETTE_COUNT = 6
export const HUE_SHIFT_MIN_DEG = 45
export const HUE_SHIFT_RANGE_DEG = 271
export const AUTO_ON_FACING_DEPTH = 3
export const AUTO_ON_SIDE_DEPTH = 2
export const CHARACTER_HIT_HALF_WIDTH = 8
export const CHARACTER_HIT_HEIGHT = 24
export const TOOL_OVERLAY_VERTICAL_OFFSET = 32
export const PULSE_ANIMATION_DURATION_SEC = 1.5
export const TOOL_OVERLAY_LABEL_Y_OFFSET = 24
