import { MAX_DELTA_TIME_SEC } from '../../constants.js'
import { isKioskMode } from '../../vscodeApi.js'

export interface GameLoopCallbacks {
  update: (dt: number) => void
  render: (ctx: CanvasRenderingContext2D) => void
}

// Kiosk mode: 15fps is plenty for pixel art animations, saves ~75% CPU vs 60fps
const KIOSK_FRAME_INTERVAL_MS = 1000 / 15

export function startGameLoop(
  canvas: HTMLCanvasElement,
  callbacks: GameLoopCallbacks,
): () => void {
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  let lastTime = 0
  let rafId = 0
  let stopped = false
  let lastRenderTime = 0

  const frame = (time: number) => {
    if (stopped) return
    const dt = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, MAX_DELTA_TIME_SEC)
    lastTime = time

    callbacks.update(dt)

    // In kiosk mode, throttle rendering to save CPU
    const shouldRender = !isKioskMode || (time - lastRenderTime >= KIOSK_FRAME_INTERVAL_MS)
    if (shouldRender) {
      lastRenderTime = time
      ctx.imageSmoothingEnabled = false
      callbacks.render(ctx)
    }

    rafId = requestAnimationFrame(frame)
  }

  rafId = requestAnimationFrame(frame)

  return () => {
    stopped = true
    cancelAnimationFrame(rafId)
  }
}
