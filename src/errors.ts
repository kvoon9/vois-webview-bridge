export class BridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BridgeError";
  }
}

export class BridgeNotAvailableError extends BridgeError {
  constructor(message = "WebView bridge is not available in this environment") {
    super(message);
    this.name = "BridgeNotAvailableError";
  }
}

export class BridgeTimeoutError extends BridgeError {
  constructor(message = "WebView bridge request timed out") {
    super(message);
    this.name = "BridgeTimeoutError";
  }
}

export class BridgeProtocolError extends BridgeError {
  constructor(message = "Failed to parse WebView bridge response") {
    super(message);
    this.name = "BridgeProtocolError";
  }
}
