// ── Timing (ms) ──────────────────────────────────────────────
export const JSONL_POLL_INTERVAL_MS = 1000;
export const FILE_WATCHER_POLL_INTERVAL_MS = 1000;
export const PROJECT_SCAN_INTERVAL_MS = 1000;
export const AUTO_DETECT_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
export const TOOL_DONE_DELAY_MS = 300;
export const PERMISSION_TIMER_DELAY_MS = 7000;
export const TEXT_IDLE_DELAY_MS = 5000;

// ── Display Truncation ──────────────────────────────────────
export const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
export const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;

// ── PNG / Asset Parsing ─────────────────────────────────────
export const PNG_ALPHA_THRESHOLD = 128;
export const WALL_PIECE_WIDTH = 16;
export const WALL_PIECE_HEIGHT = 32;
export const WALL_GRID_COLS = 4;
export const WALL_BITMASK_COUNT = 16;
export const FLOOR_PATTERN_COUNT = 7;
export const FLOOR_TILE_SIZE = 16;
export const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const;
export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 32;
export const CHAR_FRAMES_PER_ROW = 7;
export const CHAR_COUNT = 6;

// ── User-Level Layout Persistence ─────────────────────────────
export const LAYOUT_FILE_DIR = '.pixel-office';
export const LAYOUT_FILE_NAME = 'layout.json';
export const LAYOUT_FILE_POLL_INTERVAL_MS = 2000;

// ── Settings Persistence ────────────────────────────────────
export const GLOBAL_KEY_SOUND_ENABLED = 'pixel-office.soundEnabled';

// ── Community Gallery ────────────────────────────────────────
export const GALLERY_REPO_RAW_BASE = 'https://raw.githubusercontent.com/fedevgonzalez/pixel-office-layouts/main/';
export const GALLERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── VS Code Identifiers ─────────────────────────────────────
export const VIEW_ID = 'pixel-office.panelView';
export const COMMAND_SHOW_PANEL = 'pixel-office.showPanel';
export const COMMAND_EXPORT_DEFAULT_LAYOUT = 'pixel-office.exportDefaultLayout';
export const WORKSPACE_KEY_AGENTS = 'pixel-office.agents';
export const WORKSPACE_KEY_AGENT_SEATS = 'pixel-office.agentSeats';
export const WORKSPACE_KEY_LAYOUT = 'pixel-office.layout';
export const TERMINAL_NAME_PREFIX = 'Claude Code';
