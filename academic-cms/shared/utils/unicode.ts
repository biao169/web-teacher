const encoder = new TextEncoder()

/** Returns true only for malformed UTF-16; valid supplementary-plane pairs are accepted. */
export function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return true
      index += 1
    }
    else if (unit >= 0xDC00 && unit <= 0xDFFF) return true
  }
  return false
}

export function codePointLength(value: string): number {
  return [...value].length
}

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength
}
