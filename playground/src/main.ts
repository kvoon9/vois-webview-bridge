import { isSupportBridge, onBridgeReady, type WebviewBridge } from '@vois/webview-bridge'

const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const typeEl = document.querySelector<HTMLInputElement>('#type')!
const dataEl = document.querySelector<HTMLTextAreaElement>('#data')!
const logEl = document.querySelector<HTMLPreElement>('#log')!
const sendBtn = document.querySelector<HTMLButtonElement>('#send')!
const requestBtn = document.querySelector<HTMLButtonElement>('#request')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear')!

function now(): string {
  return new Date().toISOString().slice(11, 23)
}

function log(message: string): void {
  const line = `[${now()}] ${message}`
  logEl.textContent = logEl.textContent ? `${logEl.textContent}\n${line}` : line
  logEl.scrollTop = logEl.scrollHeight
}

function setStatus(text: string, kind: 'ok' | 'err' | 'neutral' = 'neutral'): void {
  statusEl.textContent = text
  statusEl.classList.remove('ok', 'err')
  if (kind === 'ok') {
    statusEl.classList.add('ok')
  } else if (kind === 'err') {
    statusEl.classList.add('err')
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  return String(error)
}

function parseData(): unknown {
  const raw = dataEl.value.trim()
  if (raw === '') {
    return {}
  }
  return JSON.parse(raw) as unknown
}

function getType(): string {
  const type = typeEl.value.trim()
  if (!type) {
    throw new Error('type is required')
  }
  return type
}

let bridge: WebviewBridge | null = null

log(`isSupportBridge() → ${isSupportBridge()}`)

if (!isSupportBridge()) {
  setStatus('bridge not supported in this environment', 'err')
  log('skip onBridgeReady — degrade UI')
} else {
  setStatus('waiting for bridge…')
  log('onBridgeReady(…)')

  onBridgeReady((readyBridge) => {
    bridge = readyBridge
    setStatus('bridge ready', 'ok')
    log('onBridgeReady(bridge)')
  })
}

sendBtn.addEventListener('click', () => {
  try {
    if (!bridge) {
      throw new Error('bridge not ready — wait for onBridgeReady')
    }
    const type = getType()
    const data = parseData()
    log(`send(${JSON.stringify(type)}, ${JSON.stringify(data)})`)
    bridge.send(type, data)
    log('send dispatched (fire-and-forget)')
  } catch (error) {
    log(`send error: ${formatError(error)}`)
  }
})

requestBtn.addEventListener('click', () => {
  void (async () => {
    try {
      if (!bridge) {
        throw new Error('bridge not ready — wait for onBridgeReady')
      }
      const type = getType()
      const data = parseData()
      log(`request(${JSON.stringify(type)}, ${JSON.stringify(data)})`)
      const result = await bridge.request(type, data)
      log(`response: ${JSON.stringify(result, null, 2)}`)
    } catch (error) {
      log(`request error: ${formatError(error)}`)
    }
  })()
})

clearBtn.addEventListener('click', () => {
  logEl.textContent = ''
})
