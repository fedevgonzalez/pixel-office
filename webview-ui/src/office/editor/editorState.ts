import { EditTool, TileType, ZoneType } from '../types.js'
import type { TileType as TileTypeVal, OfficeLayout, FloorColor, ZoneType as ZoneTypeVal } from '../types.js'
import { UNDO_STACK_MAX_SIZE, DEFAULT_FLOOR_COLOR, DEFAULT_WALL_COLOR } from '../../constants.js'

export class EditorState {
  isEditMode = false
  activeTool: EditTool = EditTool.SELECT
  selectedTileType: TileTypeVal = TileType.FLOOR_1
  selectedFurnitureType: string = 'desk' // FurnitureType.DESK or asset ID

  // Zone painting
  selectedZoneType: ZoneTypeVal = ZoneType.CHILL

  // Floor color settings (applied to new tiles when painting)
  floorColor: FloorColor = { ...DEFAULT_FLOOR_COLOR }

  // Wall color settings (applied to new wall tiles when painting)
  wallColor: FloorColor = { ...DEFAULT_WALL_COLOR }

  // Tracks toggle direction during wall drag (true=adding walls, false=removing, null=undecided)
  wallDragAdding: boolean | null = null

  // Tracks paint direction during zone drag (true=adding zones, false=clearing, null=undecided)
  // Set on the first tile touched; subsequent tiles in the same drag respect this direction.
  zoneDragAdding: boolean | null = null

  // Whether undo has been pushed for the current zone drag session.
  // Prevents N undo entries for a single drag stroke.
  zoneDragUndoPushed = false

  // The last col/row painted during a zone drag (avoids redundant repaints on same tile).
  zoneDragLastCol = -1
  zoneDragLastRow = -1

  // Picked furniture color (copied by pick tool, applied on placement)
  pickedFurnitureColor: FloorColor | null = null

  // Ghost preview position
  ghostCol = -1
  ghostRow = -1
  ghostValid = false

  // Selection
  selectedFurnitureUid: string | null = null

  // Mouse drag state (tile paint)
  isDragging = false

  // Undo / Redo stacks
  undoStack: OfficeLayout[] = []
  redoStack: OfficeLayout[] = []

  // Dirty flag — true when layout differs from last save
  isDirty = false

  // Drag-to-move state
  dragUid: string | null = null
  dragStartCol = 0
  dragStartRow = 0
  dragOffsetCol = 0
  dragOffsetRow = 0
  isDragMoving = false

  pushUndo(layout: OfficeLayout): void {
    this.undoStack.push(layout)
    // Limit undo stack size
    if (this.undoStack.length > UNDO_STACK_MAX_SIZE) {
      this.undoStack.shift()
    }
  }

  popUndo(): OfficeLayout | null {
    return this.undoStack.pop() || null
  }

  pushRedo(layout: OfficeLayout): void {
    this.redoStack.push(layout)
    if (this.redoStack.length > UNDO_STACK_MAX_SIZE) {
      this.redoStack.shift()
    }
  }

  popRedo(): OfficeLayout | null {
    return this.redoStack.pop() || null
  }

  clearRedo(): void {
    this.redoStack = []
  }

  clearSelection(): void {
    this.selectedFurnitureUid = null
  }

  clearGhost(): void {
    this.ghostCol = -1
    this.ghostRow = -1
    this.ghostValid = false
  }

  startDrag(uid: string, startCol: number, startRow: number, offsetCol: number, offsetRow: number): void {
    this.dragUid = uid
    this.dragStartCol = startCol
    this.dragStartRow = startRow
    this.dragOffsetCol = offsetCol
    this.dragOffsetRow = offsetRow
    this.isDragMoving = false
  }

  clearDrag(): void {
    this.dragUid = null
    this.isDragMoving = false
  }

  reset(): void {
    this.activeTool = EditTool.SELECT
    this.selectedFurnitureUid = null
    this.ghostCol = -1
    this.ghostRow = -1
    this.ghostValid = false
    this.isDragging = false
    this.wallDragAdding = null
    this.zoneDragAdding = null
    this.zoneDragUndoPushed = false
    this.zoneDragLastCol = -1
    this.zoneDragLastRow = -1
    this.undoStack = []
    this.redoStack = []
    this.isDirty = false
    this.dragUid = null
    this.isDragMoving = false
  }
}
