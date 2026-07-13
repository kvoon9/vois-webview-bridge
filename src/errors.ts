export class BridgeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BridgeError'
  }
}

export class BridgeNotAvailableError extends BridgeError {
  constructor(message = 'WebView bridge not found') {
    super(message)
    this.name = 'BridgeNotAvailableError'
  }
}

export class BridgeProtocolError extends BridgeError {
  constructor(message = 'Failed to parse WebView bridge response') {
    super(message)
    this.name = 'BridgeProtocolError'
  }
}
