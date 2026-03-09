/**
 * Minimal uncompressed ZIP writer — no dependencies.
 * Creates a valid ZIP archive using STORE method (no compression).
 */

interface ZipEntry {
  name: string
  data: Uint8Array<ArrayBuffer>
}

function crc32(data: Uint8Array<ArrayBuffer>): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeU16(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = val & 0xff
  buf[offset + 1] = (val >>> 8) & 0xff
}

function writeU32(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = val & 0xff
  buf[offset + 1] = (val >>> 8) & 0xff
  buf[offset + 2] = (val >>> 16) & 0xff
  buf[offset + 3] = (val >>> 24) & 0xff
}

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const centralHeaders: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    // Local file header (30 + name length)
    const local = new Uint8Array(30 + nameBytes.length)
    writeU32(local, 0, 0x04034b50) // signature
    writeU16(local, 4, 20) // version needed
    writeU16(local, 8, 0) // compression: STORE
    writeU32(local, 14, crc)
    writeU32(local, 18, size) // compressed
    writeU32(local, 22, size) // uncompressed
    writeU16(local, 26, nameBytes.length)
    local.set(nameBytes, 30)

    parts.push(local)
    parts.push(entry.data)

    // Central directory header (46 + name length)
    const central = new Uint8Array(46 + nameBytes.length)
    writeU32(central, 0, 0x02014b50) // signature
    writeU16(central, 4, 20) // version made by
    writeU16(central, 6, 20) // version needed
    writeU16(central, 10, 0) // compression: STORE
    writeU32(central, 16, crc)
    writeU32(central, 20, size) // compressed
    writeU32(central, 24, size) // uncompressed
    writeU16(central, 28, nameBytes.length)
    writeU32(central, 42, offset) // local header offset
    central.set(nameBytes, 46)

    centralHeaders.push(central)
    offset += local.length + entry.data.length
  }

  const centralOffset = offset
  let centralSize = 0
  for (const ch of centralHeaders) {
    parts.push(ch)
    centralSize += ch.length
  }

  // End of central directory (22 bytes)
  const eocd = new Uint8Array(22)
  writeU32(eocd, 0, 0x06054b50) // signature
  writeU16(eocd, 8, entries.length) // entries on disk
  writeU16(eocd, 10, entries.length) // total entries
  writeU32(eocd, 12, centralSize)
  writeU32(eocd, 16, centralOffset)
  parts.push(eocd)

  return new Blob(parts as BlobPart[], { type: 'application/zip' })
}
