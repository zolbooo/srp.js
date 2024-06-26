export function byteArrayToHexString(byteArray: Uint8Array): string {
  return [...byteArray].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function byteArrayToBigInt(byteArray: Uint8Array): bigint {
  return BigInt("0x" + byteArrayToHexString(byteArray));
}

export function hexStringToByteArray(hexString: string): Uint8Array {
  if (hexString.length % 2 !== 0) {
    hexString = "0" + hexString;
  }
  const byteArray = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < byteArray.length; i++) {
    byteArray[i] = parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
  }
  return byteArray;
}
export function bigIntToByteArray(bigInt: bigint): Uint8Array {
  return hexStringToByteArray(bigInt.toString(16));
}

export function concatByteArrays(...arrays: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    arrays.reduce((total, curr) => total + curr.length, 0)
  );
  let i = 0;
  for (const array of arrays) {
    result.set(array, i);
    i += array.length;
  }
  return result;
}

export function padData(data: Uint8Array, N: Uint8Array): Uint8Array {
  const paddedData = new Uint8Array(N.length);
  paddedData.set(data, N.length - data.length);
  paddedData.set(
    Array.from({ length: N.length - data.length }).map(() => 0),
    0
  );
  return paddedData;
}

export function generateRandomExponent(mod: bigint): bigint {
  const modSize = Math.floor(mod.toString(2).length / 8);
  while (true) {
    const randomBytes = crypto.getRandomValues(new Uint8Array(modSize));
    const derivedRandom = BigInt("0x" + byteArrayToHexString(randomBytes));
    // (mod - 1) because Fermat's little theorem
    const result = derivedRandom % (mod - 1n);
    if (result > 1n) {
      return result;
    }
  }
}

export function safeByteArrayEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
