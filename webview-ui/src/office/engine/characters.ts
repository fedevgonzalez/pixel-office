import { CharacterState, Direction, TILE_SIZE } from '../types.js'
import type { Character, Seat, SpriteData, TileType as TileTypeVal } from '../types.js'
import type { CharacterSprites } from '../sprites/spriteData.js'
import { findPath } from '../layout/tileMap.js'
import {
  WALK_SPEED_PX_PER_SEC,
  WALK_FRAME_DURATION_SEC,
  TYPE_FRAME_DURATION_SEC,
  WANDER_PAUSE_MIN_SEC,
  WANDER_PAUSE_MAX_SEC,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_MOVES_BEFORE_REST_MAX,
  SEAT_REST_MIN_SEC,
  SEAT_REST_MAX_SEC,
  BREAK_ROOM_VISIT_CHANCE,
  BREAK_ROOM_REST_MIN_SEC,
  BREAK_ROOM_REST_MAX_SEC,
} from '../../constants.js'

/** Tools that show reading animation instead of typing */
const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'])

export function isReadingTool(tool: string | null): boolean {
  if (!tool) return false
  return READING_TOOLS.has(tool)
}

/** Pixel center of a tile */
function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  }
}

/** Direction from one tile to an adjacent tile */
function directionBetween(fromCol: number, fromRow: number, toCol: number, toRow: number): Direction {
  const dc = toCol - fromCol
  const dr = toRow - fromRow
  if (dc > 0) return Direction.RIGHT
  if (dc < 0) return Direction.LEFT
  if (dr > 0) return Direction.DOWN
  return Direction.UP
}

export function createCharacter(
  id: number,
  palette: number,
  seatId: string | null,
  seat: Seat | null,
  hueShift = 0,
): Character {
  const col = seat ? seat.seatCol : 1
  const row = seat ? seat.seatRow : 1
  const center = tileCenter(col, row)
  return {
    id,
    state: CharacterState.TYPE,
    dir: seat ? seat.facingDir : Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette,
    hueShift,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX),
    isActive: true,
    isResting: false,
    seatId,
    bubbleType: null,
    bubbleTimer: 0,
    speechText: null,
    speechTimer: 0,
    speechFullDuration: 0,
    seatTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
  }
}

export function updateCharacter(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
  breakRoomTiles: Array<{ col: number; row: number }> = [],
  focusZoneTiles: Set<string> = new Set(),
  doorTiles: Set<string> = new Set(),
): void {
  ch.frameTimer += dt

  switch (ch.state) {
    case CharacterState.TYPE: {
      if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
        ch.frameTimer -= TYPE_FRAME_DURATION_SEC
        ch.frame = (ch.frame + 1) % 2
      }
      // If no longer active, stand up and start wandering (after seatTimer expires)
      if (!ch.isActive) {
        if (ch.seatTimer > 0) {
          ch.seatTimer -= dt
          break
        }
        ch.seatTimer = 0 // clear sentinel
        ch.state = CharacterState.IDLE
        ch.frame = 0
        ch.frameTimer = 0
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
        ch.wanderCount = 0
        ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX)
      }
      break
    }

    case CharacterState.IDLE: {
      // No idle animation — static pose
      ch.frame = 0
      if (ch.seatTimer < 0) ch.seatTimer = 0 // clear turn-end sentinel
      // If resting, walk to break room and stay
      if (ch.isResting) {
        const alreadyAtBreak = breakRoomTiles.some((t) => t.col === ch.tileCol && t.row === ch.tileRow)
        if (!alreadyAtBreak && breakRoomTiles.length > 0) {
          const target = breakRoomTiles[Math.floor(Math.random() * breakRoomTiles.length)]
          const path = findPath(ch.tileCol, ch.tileRow, target.col, target.row, tileMap, blockedTiles, doorTiles)
          if (path.length > 0) {
            ch.path = path
            ch.moveProgress = 0
            ch.state = CharacterState.WALK
            ch.frame = 0
            ch.frameTimer = 0
          }
        }
        // Stay put at break room — don't wander
        break
      }
      // If became active, pathfind to seat
      if (ch.isActive) {
        if (!ch.seatId) {
          // No seat assigned — type in place
          ch.state = CharacterState.TYPE
          ch.frame = 0
          ch.frameTimer = 0
          break
        }
        const seat = seats.get(ch.seatId)
        if (seat) {
          const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles, doorTiles)
          if (path.length > 0) {
            ch.path = path
            ch.moveProgress = 0
            ch.state = CharacterState.WALK
            ch.frame = 0
            ch.frameTimer = 0
          } else {
            // Already at seat or no path — sit down
            ch.state = CharacterState.TYPE
            ch.dir = seat.facingDir
            ch.frame = 0
            ch.frameTimer = 0
          }
        }
        break
      }
      // Countdown wander timer
      ch.wanderTimer -= dt
      if (ch.wanderTimer <= 0) {
        // Check if we've wandered enough — return to seat for a rest
        if (ch.wanderCount >= ch.wanderLimit && ch.seatId) {
          const seat = seats.get(ch.seatId)
          if (seat) {
            const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles, doorTiles)
            if (path.length > 0) {
              ch.path = path
              ch.moveProgress = 0
              ch.state = CharacterState.WALK
              ch.frame = 0
              ch.frameTimer = 0
              break
            }
          }
        }
        // Sometimes visit a break room item instead of random wandering
        let wanderTarget: { col: number; row: number } | null = null
        if (breakRoomTiles.length > 0 && Math.random() < BREAK_ROOM_VISIT_CHANCE) {
          wanderTarget = breakRoomTiles[Math.floor(Math.random() * breakRoomTiles.length)]
        } else if (walkableTiles.length > 0) {
          // Filter out focus zone tiles — idle agents should not wander into work areas
          const candidates = focusZoneTiles.size > 0
            ? walkableTiles.filter(t => !focusZoneTiles.has(`${t.col},${t.row}`))
            : walkableTiles
          if (candidates.length > 0) {
            wanderTarget = candidates[Math.floor(Math.random() * candidates.length)]
          }
        }
        if (wanderTarget) {
          const path = findPath(ch.tileCol, ch.tileRow, wanderTarget.col, wanderTarget.row, tileMap, blockedTiles, doorTiles)
          if (path.length > 0) {
            ch.path = path
            ch.moveProgress = 0
            ch.state = CharacterState.WALK
            ch.frame = 0
            ch.frameTimer = 0
            ch.wanderCount++
          }
        }
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
      }
      break
    }

    case CharacterState.WALK: {
      // Walk animation
      if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC
        ch.frame = (ch.frame + 1) % 4
      }

      if (ch.path.length === 0) {
        // Path complete — snap to tile center and transition
        const center = tileCenter(ch.tileCol, ch.tileRow)
        ch.x = center.x
        ch.y = center.y

        if (ch.isResting) {
          // Arrived at break room — stay idle
          ch.state = CharacterState.IDLE
          ch.frame = 0
          ch.frameTimer = 0
          ch.wanderTimer = 9999 // don't wander while resting
          break
        }
        if (ch.isActive) {
          if (!ch.seatId) {
            // No seat — type in place
            ch.state = CharacterState.TYPE
          } else {
            const seat = seats.get(ch.seatId)
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE
              ch.dir = seat.facingDir
            } else {
              ch.state = CharacterState.IDLE
            }
          }
        } else {
          // Check if arrived at assigned seat — sit down for a rest before wandering again
          if (ch.seatId) {
            const seat = seats.get(ch.seatId)
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE
              ch.dir = seat.facingDir
              // seatTimer < 0 is a sentinel from setAgentActive(false) meaning
              // "turn just ended" — skip the long rest so idle transition is immediate
              if (ch.seatTimer < 0) {
                ch.seatTimer = 0
              } else {
                ch.seatTimer = randomRange(SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC)
              }
              ch.wanderCount = 0
              ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX)
              ch.frame = 0
              ch.frameTimer = 0
              break
            }
          }
          ch.state = CharacterState.IDLE
          // Rest longer at break room tiles (coffee machine, couch)
          const atBreakRoom = breakRoomTiles.some((t) => t.col === ch.tileCol && t.row === ch.tileRow)
          if (atBreakRoom) {
            ch.wanderTimer = randomRange(BREAK_ROOM_REST_MIN_SEC, BREAK_ROOM_REST_MAX_SEC)
          } else {
            ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
          }
        }
        ch.frame = 0
        ch.frameTimer = 0
        break
      }

      // Move toward next tile in path
      const nextTile = ch.path[0]
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row)

      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt

      const fromCenter = tileCenter(ch.tileCol, ch.tileRow)
      const toCenter = tileCenter(nextTile.col, nextTile.row)
      const t = Math.min(ch.moveProgress, 1)
      ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t
      ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t

      if (ch.moveProgress >= 1) {
        // Arrived at next tile
        ch.tileCol = nextTile.col
        ch.tileRow = nextTile.row
        ch.x = toCenter.x
        ch.y = toCenter.y
        ch.path.shift()
        ch.moveProgress = 0
      }

      // If became active while wandering, repath to seat
      if (ch.isActive && ch.seatId) {
        const seat = seats.get(ch.seatId)
        if (seat) {
          const lastStep = ch.path[ch.path.length - 1]
          if (!lastStep || lastStep.col !== seat.seatCol || lastStep.row !== seat.seatRow) {
            const newPath = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles, doorTiles)
            if (newPath.length > 0) {
              ch.path = newPath
              ch.moveProgress = 0
            }
          }
        }
      }
      break
    }

    case CharacterState.ENTERING: {
      // Walking from door to seat — same movement as WALK
      if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC
        ch.frame = (ch.frame + 1) % 4
      }

      if (ch.path.length === 0) {
        // Arrived at seat — sit down
        const center = tileCenter(ch.tileCol, ch.tileRow)
        ch.x = center.x
        ch.y = center.y
        if (ch.seatId) {
          const seat = seats.get(ch.seatId)
          if (seat) ch.dir = seat.facingDir
        }
        ch.state = ch.isActive ? CharacterState.TYPE : CharacterState.IDLE
        ch.frame = 0
        ch.frameTimer = 0
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
        break
      }

      // Move toward next tile (same as WALK)
      const enterNext = ch.path[0]
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, enterNext.col, enterNext.row)
      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt
      const enterFrom = tileCenter(ch.tileCol, ch.tileRow)
      const enterTo = tileCenter(enterNext.col, enterNext.row)
      const enterT = Math.min(ch.moveProgress, 1)
      ch.x = enterFrom.x + (enterTo.x - enterFrom.x) * enterT
      ch.y = enterFrom.y + (enterTo.y - enterFrom.y) * enterT
      if (ch.moveProgress >= 1) {
        ch.tileCol = enterNext.col
        ch.tileRow = enterNext.row
        ch.x = enterTo.x
        ch.y = enterTo.y
        ch.path.shift()
        ch.moveProgress = 0
      }
      break
    }

    case CharacterState.LEAVING: {
      // Walking from current position to door — same movement as WALK
      if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC
        ch.frame = (ch.frame + 1) % 4
      }

      if (ch.path.length === 0) {
        // Arrived at door — mark for removal (officeState handles deletion)
        const center = tileCenter(ch.tileCol, ch.tileRow)
        ch.x = center.x
        ch.y = center.y
        // Signal completion: set matrixEffect to 'despawn' so officeState removes this character
        ch.matrixEffect = 'despawn'
        ch.matrixEffectTimer = 0
        ch.matrixEffectSeeds = matrixEffectSeeds()
        break
      }

      // Move toward next tile (same as WALK)
      const leaveNext = ch.path[0]
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, leaveNext.col, leaveNext.row)
      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt
      const leaveFrom = tileCenter(ch.tileCol, ch.tileRow)
      const leaveTo = tileCenter(leaveNext.col, leaveNext.row)
      const leaveT = Math.min(ch.moveProgress, 1)
      ch.x = leaveFrom.x + (leaveTo.x - leaveFrom.x) * leaveT
      ch.y = leaveFrom.y + (leaveTo.y - leaveFrom.y) * leaveT
      if (ch.moveProgress >= 1) {
        ch.tileCol = leaveNext.col
        ch.tileRow = leaveNext.row
        ch.x = leaveTo.x
        ch.y = leaveTo.y
        ch.path.shift()
        ch.moveProgress = 0
      }
      break
    }
  }
}

/** Generate per-column random seeds for matrix effect stagger */
function matrixEffectSeeds(): number[] {
  return Array.from({ length: 16 }, () => Math.random())
}

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  switch (ch.state) {
    case CharacterState.TYPE:
      if (isReadingTool(ch.currentTool)) {
        return sprites.reading[ch.dir][ch.frame % 2]
      }
      return sprites.typing[ch.dir][ch.frame % 2]
    case CharacterState.WALK:
    case CharacterState.ENTERING:
    case CharacterState.LEAVING:
      return sprites.walk[ch.dir][ch.frame % 4]
    case CharacterState.IDLE:
      return sprites.walk[ch.dir][1]
    default:
      return sprites.walk[ch.dir][1]
  }
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}
