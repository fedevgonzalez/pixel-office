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
      const isKiosk = new URLSearchParams(window.location.search).has('kiosk')
      ws!.send(JSON.stringify({ type: 'webviewReady', kiosk: isKiosk }))
      for (const msg of pending) {
        ws!.send(JSON.stringify(msg))
      }
      pending.length = 0
    }
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
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
