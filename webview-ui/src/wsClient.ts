import { showToast } from './components/Toast.js'

function createStandaloneApi(): { postMessage(msg: unknown): void } {
  const pending: unknown[] = []
  let wsConn: WebSocket | null = null
  let connected = false
  let disconnectedSince: number | null = null
  let everConnected = false
  const RELOAD_AFTER_MS = 30_000 // full page reload after 30s disconnected
  // Don't spam the user with a reconnect toast on initial page load — only after
  // we've successfully been connected once.
  const RECONNECT_TOAST_AFTER_MS = 1500

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    wsConn = new WebSocket(`${proto}//${location.host}`)
    wsConn.onopen = () => {
      const wasDisconnected = everConnected && disconnectedSince !== null
      connected = true
      disconnectedSince = null
      everConnected = true
      if (wasDisconnected) showToast('Reconnected', 'success')
      // Re-send webviewReady on every reconnect so the server sends assets + agents
      const params = new URLSearchParams(window.location.search)
      const isHomeserver = params.has('homeserver')
      wsConn!.send(JSON.stringify({ type: 'webviewReady', homeserver: isHomeserver }))
      for (const msg of pending) {
        wsConn!.send(JSON.stringify(msg))
      }
      pending.length = 0
    }
    wsConn.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        // App-level health ping — respond with frame age to prove render pipeline is alive
        if (data.type === 'healthPing') {
          // Dynamic import to avoid circular deps — lastFrameAt is updated every rAF
          import('./office/engine/gameLoop.js').then(({ lastFrameAt }) => {
            const frameAge = lastFrameAt > 0 ? Math.round((Date.now() - lastFrameAt) / 1000) : -1
            wsConn!.send(JSON.stringify({ type: 'healthPong', ts: data.ts, frameAge }))
          }).catch(() => {
            wsConn!.send(JSON.stringify({ type: 'healthPong', ts: data.ts, frameAge: -1 }))
          })
          return
        }
        window.dispatchEvent(new MessageEvent('message', { data }))
      } catch {}
    }
    wsConn.onclose = () => {
      const wasConnected = connected
      connected = false
      if (!disconnectedSince) disconnectedSince = Date.now()
      // Only surface a toast if we lost a live connection (not on initial
      // page-load failures, which the user will recover from in <2s).
      if (wasConnected && everConnected) {
        setTimeout(() => {
          if (!connected && disconnectedSince) showToast('Reconnecting…', 'info')
        }, RECONNECT_TOAST_AFTER_MS)
      }
      setTimeout(connect, 2000)
    }
  }

  // Periodically check if we've been disconnected too long — full reload recovers from stale state
  setInterval(() => {
    if (disconnectedSince && Date.now() - disconnectedSince > RELOAD_AFTER_MS) {
      window.location.reload()
    }
  }, 5000)

  connect()

  return {
    postMessage(msg: unknown) {
      if (connected && wsConn?.readyState === WebSocket.OPEN) {
        wsConn.send(JSON.stringify(msg))
      } else {
        pending.push(msg)
      }
    }
  }
}

export const ws = createStandaloneApi()
// Para activar "kiosk mode" en localhost:3300, agrega "?kiosk" a la URL:
// Ejemplo: http://localhost:3300/?kiosk
export const isKioskMode = new URLSearchParams(window.location.search).has('kiosk')
// Screenshot mode: ?screenshot — hides all UI, auto-fits camera to office bounds
export const isScreenshotMode = new URLSearchParams(window.location.search).has('screenshot')
// No-agents mode: ?no-agents — skip adding agents (for clean layout screenshots)
export const isNoAgentsMode = new URLSearchParams(window.location.search).has('no-agents')
