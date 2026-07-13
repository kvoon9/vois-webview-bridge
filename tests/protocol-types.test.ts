import { describe, expectTypeOf, test } from 'vite-plus/test'

import type { WebviewBridge } from '../src/index.ts'

/** Smoke: WebviewBridge methods are typed against the protocol map. */
describe('protocol map types', () => {
  test('send / request compile (smoke)', () => {
    expectTypeOf<WebviewBridge['send']>().toBeFunction()
    expectTypeOf<WebviewBridge['request']>().returns.toEqualTypeOf<Promise<unknown>>()
  })
})
