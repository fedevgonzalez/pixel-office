function createStandaloneApi(): { postMessage(msg: unknown): void } {
  const pending: unknown[] = []
  let ws: WebSocket | null = null
  let connected = false

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${proto}//${location.host}`)
    ws.onopen = () => {
      connected = true
      // Re-send webviewReady on every reconnect so the server sends assets + agents
      ws!.send(JSON.stringify({ type: 'webviewReady' }))
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
      setTimeout(connect, 2000)
    }
  }

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
