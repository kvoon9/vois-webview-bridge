import { createBridge } from '@vois/webview-bridge'

const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const typeEl = document.querySelector<HTMLInputElement>('#type')!
const dataEl = document.querySelector<HTMLTextAreaElement>('#data')!
const timeoutEl = document.querySelector<HTMLInputElement>('#timeout')!
const logEl = document.querySelector<HTMLPreElement>('#log')!
const sendBtn = document.querySelector<HTMLButtonElement>('#send')!
const requestBtn = document.querySelector<HTMLButtonElement>('#request')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear')!

const bridge = createBridge()

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

function parseTimeout(): number | undefined {
  const raw = timeoutEl.value.trim()
  if (raw === '') {
    return undefined
  }
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('timeout must be a non-negative number')
  }
  return value
}

function getType(): string {
  const type = typeEl.value.trim()
  if (!type) {
    throw new Error('type is required')
  }
  return type
}

setStatus('waiting for bridge.ready…')
log('createBridge()')

void bridge.ready.then(
  () => {
    setStatus('bridge ready', 'ok')
    log('ready resolved')
  },
  (error: unknown) => {
    setStatus(formatError(error), 'err')
    log(`ready rejected: ${formatError(error)}`)
  },
)

sendBtn.addEventListener('click', () => {
  try {
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
      const type = getType()
      const data = parseData()
      const timeout = parseTimeout()
      const options = timeout === undefined ? undefined : { timeout }
      log(
        `request(${JSON.stringify(type)}, ${JSON.stringify(data)}${
          options ? `, ${JSON.stringify(options)}` : ''
        })`,
      )
      const result = await bridge.request(type, data, options)
      log(`response: ${JSON.stringify(result, null, 2)}`)
    } catch (error) {
      log(`request error: ${formatError(error)}`)
    }
  })()
})

clearBtn.addEventListener('click', () => {
  logEl.textContent = ''
})
