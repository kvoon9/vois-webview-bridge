/**
 * MD5, in 64 bytes of state and hex output.
 *
 * WebCrypto has no MD5, and the Weila login signature (`MD5(et + appKey)`) and
 * password digest both require it. The package keeps no runtime dependencies, so
 * the algorithm lives here; it is fixed and needs no maintenance.
 */

const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

/** `floor(abs(sin(i + 1)) * 2^32)`, the standard K table. */
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32))

const rotl = (value: number, shift: number): number =>
  ((value << shift) | (value >>> (32 - shift))) >>> 0

/** MD5 of a UTF-8 string, lowercase hex. */
export function md5(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const withPadding = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64)
  withPadding.set(bytes)
  withPadding[bytes.length] = 0x80

  // Bit length, little-endian, in the last 8 bytes.
  const view = new DataView(withPadding.buffer)
  const bits = bytes.length * 8
  view.setUint32(withPadding.length - 8, bits >>> 0, true)
  view.setUint32(withPadding.length - 4, Math.floor(bits / 2 ** 32), true)

  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476

  for (let chunk = 0; chunk < withPadding.length; chunk += 64) {
    const words = Array.from({ length: 16 }, (_, i) => view.getUint32(chunk + i * 4, true))
    let [fa, fb, fc, fd] = [a, b, c, d]

    for (let i = 0; i < 64; i++) {
      const [f, g] =
        i < 16
          ? [(fb & fc) | (~fb & fd), i]
          : i < 32
            ? [(fd & fb) | (~fd & fc), (5 * i + 1) % 16]
            : i < 48
              ? [fb ^ fc ^ fd, (3 * i + 5) % 16]
              : [fc ^ (fb | ~fd), (7 * i) % 16]

      const rotated = (fa + f + K[i]! + (words[g] ?? 0)) >>> 0
      ;[fa, fb, fc, fd] = [fd, (fb + rotl(rotated, SHIFTS[i]!)) >>> 0, fb, fc]
    }

    a = (a + fa) >>> 0
    b = (b + fb) >>> 0
    c = (c + fc) >>> 0
    d = (d + fd) >>> 0
  }

  return [a, b, c, d]
    .flatMap((word) => [0, 8, 16, 24].map((shift) => (word >>> shift) & 0xff))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
