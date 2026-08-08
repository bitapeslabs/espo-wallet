/*
  Minimal cellpack decoding shared by the UI's protostone renderer and the
  background's activity classifier. A protostone message is the LEB128-encoded
  u128 list [target.block, target.tx, opcode, ...inputs].
*/

export interface Cellpack {
  target: { block: bigint; tx: bigint };
  opcode: bigint;
  inputs: bigint[];
}

/** Decode a LEB128 u128 list (the alkanes `unpack` behaviour). */
export function decodeLEB128List(buf: Uint8Array): bigint[] {
  const out: bigint[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let result = 0n;
    let ok = false;
    let consumed = 0;
    for (let i = 0; i <= 18; i++) {
      if (pos + i >= buf.length) {
        // Unterminated varint at end of buffer -> stop.
        ok = false;
        break;
      }
      const byte = buf[pos + i];
      const value = BigInt(byte) & 127n;
      if (i === 18 && (value & 124n) !== 0n) {
        // Overflow (would set bits above u128) -> stop.
        ok = false;
        break;
      }
      result |= value << BigInt(7 * i);
      if ((byte & 128) === 0) {
        ok = true;
        consumed = i + 1;
        break;
      }
    }
    if (!ok) break;
    out.push(result);
    pos += consumed;
  }
  return out;
}

/** Drop trailing 0x00 padding bytes (added by the 15-byte packing). */
export function stripTrailingZeros(buf: Uint8Array): Uint8Array {
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end--;
  return buf.subarray(0, end);
}

/** Parse cellpack bytes into target + opcode + inputs. */
export function decodeCellpack(message: Uint8Array): Cellpack | undefined {
  if (!message || message.length === 0) return undefined;
  const values = decodeLEB128List(stripTrailingZeros(message));
  // Need at least target.block + target.tx.
  if (values.length < 2) return undefined;
  const target = { block: values[0], tx: values[1] };
  const opcode = values.length >= 3 ? values[2] : 0n;
  const inputs = values.length > 3 ? values.slice(3) : [];
  return { target, opcode, inputs };
}

/** decodeCellpack over a hex string (espo serializes messages as hex). */
export function decodeCellpackHex(hex: string): Cellpack | undefined {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!clean || clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    return undefined;
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return decodeCellpack(bytes);
}
