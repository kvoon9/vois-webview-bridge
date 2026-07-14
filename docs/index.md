---
title: Introduction
description: Typed send / request WebView bridge for Vois / Weila H5 pages
sidebar:
  label: Overview
  order: 1
---

`@vois/webview-bridge` provides a typed `send` / `request` API for H5 pages running inside native WebViews to communicate with native code.

## Installation

```bash
pnpm add @vois/webview-bridge
```

You can also use `npm` or `yarn`.

## Minimal Example

```ts
import { onBridgeReady } from '@vois/webview-bridge'

onBridgeReady((bridge) => {
  bridge.send('close-page')
})
```

See [Web Usage](/web-usage) for full details.
