function createStandaloneApi(): { postMessage(msg: unknown): void } {
  const pending: unknown[] = []
  let ws: WebSocket | null = null
  let connected = false
  let disconnectedSince: number | null = null
  const RELOAD_AFTER_MS = 30_000 // full page reload after 30s disconnected

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${proto}//${location.host}`)
    ws.onopen = () => {
      connected = true
      disconnectedSince = null
      // Re-send webviewReady on every reconnect so the server sends assets + agents
      const params = new URLSearchParams(window.location.search)
      const isHomeserver = params.has('homeserver')
      ws!.send(JSON.stringify({ type: 'webviewReady', homeserver: isHomeserver }))
      for (const msg of pending) {
        ws!.send(JSON.stringify(msg))
      }
      pending.length = 0
    }
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        // App-level health ping — respond with frame age to prove render pipeline is alive
        if (data.type === 'healthPing') {
          // Dynamic import to avoid circular deps — lastFrameAt is updated every rAF
          import('./office/engine/gameLoop.js').then(({ lastFrameAt }) => {
            const frameAge = lastFrameAt > 0 ? Math.round((Date.now() - lastFrameAt) / 1000) : -1
            ws!.send(JSON.stringify({ type: 'healthPong', ts: data.ts, frameAge }))
          }).catch(() => {
            ws!.send(JSON.stringify({ type: 'healthPong', ts: data.ts, frameAge: -1 }))
          })
          return
        }
        window.dispatchEvent(new MessageEvent('message', { data }))
      } catch {}
    }
    ws.onclose = () => {
      connected = false
      if (!disconnectedSince) disconnectedSince = Date.now()
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
      if (connected && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg))
      } else {
        pending.push(msg)
      }
    }
  }
}

let _isStandalone = false

function createVsCodeApi(): { postMessage(msg: unknown): void } {
  try {
    // eslint-disable-next-line no-eval
    return (0, eval)('acquireVsCodeApi')()
  } catch {
    _isStandalone = true
    return createStandaloneApi()
  }
}

export const vscode = createVsCodeApi()
export const isStandaloneMode = _isStandalone
// Para activar "kiosk mode" en localhost:3300, agrega "?kiosk" a la URL: 
// Ejemplo: http://localhost:3300/?kiosk
export const isKioskMode = new URLSearchParams(window.location.search).has('kiosk')
