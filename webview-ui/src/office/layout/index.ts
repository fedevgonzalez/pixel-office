export { FURNITURE_CATALOG, getCatalogEntry, getCatalogByCategory, FURNITURE_CATEGORIES } from './furnitureCatalog.js'
export type { FurnitureCategory, CatalogEntryWithCategory } from './furnitureCatalog.js'
export {
  layoutToTileMap,
  layoutToFurnitureInstances,
  getBlockedTiles,
  layoutToSeats,
  getSeatTiles,
  createDefaultLayout,
  serializeLayout,
  deserializeLayout,
  hasExteriorTiles,
  validateLayout,
} from './layoutSerializer.js'
export {
  isExteriorTile,
  isFloorLike,
  isPaintableExterior,
  isExteriorDefaultWalkable,
  EXTERIOR_DEFAULT_WALKABLE,
  FIRST_EXTERIOR_TILE,
} from './tileKinds.js'
export {
  isWalkable,
  getWalkableTiles,
  findPath,
} from './tileMap.js'
