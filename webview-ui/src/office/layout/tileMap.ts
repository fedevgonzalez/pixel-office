import { TileType } from '../types.js'

/** Check if a tile is walkable (floor, carpet, or doorway, and not blocked by furniture).
 *
 *  `boundary` (Phase B / D2): an optional per-actor allowed-tile Set. When
 *  present, a tile is walkable ONLY if its "col,row" key is in the set (in
 *  addition to passing the tile-type + blocked checks). Door tiles are exempt
 *  from the boundary so an actor can always traverse a doorway between regions.
 *  Undefined/absent boundary = unrestricted (legacy behavior, backward compat). */
export function isWalkable(
  col: number,
  row: number,
  tileMap: TileType[][],
  blockedTiles: Set<string>,
  doorTiles?: Set<string>,
  boundary?: Set<string>,
): boolean {
  const rows = tileMap.length
  const cols = rows > 0 ? tileMap[0].length : 0
  if (row < 0 || row >= rows || col < 0 || col >= cols) return false
  const key = `${col},${row}`
  const isDoor = doorTiles?.has(key) ?? false
  const t = tileMap[row][col]
  if (t === TileType.WALL || t === TileType.VOID) {
    // Door tiles on walls are walkable
    if (isDoor) return true
    return false
  }
  if (blockedTiles.has(key)) return false
  // Per-actor movement boundary: when a boundary set is supplied, the tile must
  // be in it. Doors are always passable so actors aren't sealed out of regions.
  if (boundary && !boundary.has(key) && !isDoor) return false
  return true
}

/** Get walkable tile positions (grid coords) for wandering, clamped to an
 *  optional per-actor `boundary` set (Phase B). */
export function getWalkableTiles(
  tileMap: TileType[][],
  blockedTiles: Set<string>,
  doorTiles?: Set<string>,
  boundary?: Set<string>,
): Array<{ col: number; row: number }> {
  const rows = tileMap.length
  const cols = rows > 0 ? tileMap[0].length : 0
  const tiles: Array<{ col: number; row: number }> = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isWalkable(c, r, tileMap, blockedTiles, doorTiles, boundary)) {
        tiles.push({ col: c, row: r })
      }
    }
  }
  return tiles
}

/** BFS pathfinding on 4-connected grid (no diagonals). Returns path excluding
 *  start, including end. `boundary` (Phase B) clamps every step (and the end)
 *  to the actor's allowed-tile set; undefined = unrestricted. */
export function findPath(
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  tileMap: TileType[][],
  blockedTiles: Set<string>,
  doorTiles?: Set<string>,
  boundary?: Set<string>,
): Array<{ col: number; row: number }> {
  if (startCol === endCol && startRow === endRow) return []

  const key = (c: number, r: number) => `${c},${r}`
  const startKey = key(startCol, startRow)
  const endKey = key(endCol, endRow)

  // End must be walkable (or be a chair tile which may be adjacent to desk)
  // We allow the end tile even if it's not strictly walkable for chair positions
  const endWalkable = isWalkable(endCol, endRow, tileMap, blockedTiles, doorTiles, boundary)
  if (!endWalkable) {
    // If the end is a desk tile, we still can't path there
    return []
  }

  const visited = new Set<string>()
  visited.add(startKey)

  const parent = new Map<string, string>()
  const queue: Array<{ col: number; row: number }> = [{ col: startCol, row: startRow }]

  const dirs = [
    { dc: 0, dr: -1 }, // up
    { dc: 0, dr: 1 },  // down
    { dc: -1, dr: 0 }, // left
    { dc: 1, dr: 0 },  // right
  ]

  while (queue.length > 0) {
    const curr = queue.shift()!
    const currKey = key(curr.col, curr.row)

    if (currKey === endKey) {
      // Reconstruct path
      const path: Array<{ col: number; row: number }> = []
      let k = endKey
      while (k !== startKey) {
        const [c, r] = k.split(',').map(Number)
        path.unshift({ col: c, row: r })
        k = parent.get(k)!
      }
      return path
    }

    for (const d of dirs) {
      const nc = curr.col + d.dc
      const nr = curr.row + d.dr
      const nk = key(nc, nr)

      if (visited.has(nk)) continue
      if (!isWalkable(nc, nr, tileMap, blockedTiles, doorTiles, boundary)) continue

      visited.add(nk)
      parent.set(nk, currKey)
      queue.push({ col: nc, row: nr })
    }
  }

  // No path found
  return []
}

/**
 * Nearest walkable tile to (fromCol,fromRow), constrained to `boundary` when
 * supplied (Phase B). BFS outward over walkable tiles starting from the source;
 * returns the first walkable tile found (which may be the source itself). Used
 * to re-home an actor that is stranded outside its (newly-painted) boundary.
 * Returns null if no walkable tile exists at all.
 */
export function findNearestWalkable(
  fromCol: number,
  fromRow: number,
  tileMap: TileType[][],
  blockedTiles: Set<string>,
  doorTiles?: Set<string>,
  boundary?: Set<string>,
): { col: number; row: number } | null {
  const rows = tileMap.length
  const cols = rows > 0 ? tileMap[0].length : 0
  if (cols === 0 || rows === 0) return null

  const key = (c: number, r: number) => `${c},${r}`
  const visited = new Set<string>([key(fromCol, fromRow)])
  const queue: Array<{ col: number; row: number }> = [{ col: fromCol, row: fromRow }]
  const dirs = [
    { dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
  ]

  while (queue.length > 0) {
    const curr = queue.shift()!
    if (isWalkable(curr.col, curr.row, tileMap, blockedTiles, doorTiles, boundary)) {
      return curr
    }
    for (const d of dirs) {
      const nc = curr.col + d.dc
      const nr = curr.row + d.dr
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      const nk = key(nc, nr)
      if (visited.has(nk)) continue
      visited.add(nk)
      queue.push({ col: nc, row: nr })
    }
  }
  return null
}
