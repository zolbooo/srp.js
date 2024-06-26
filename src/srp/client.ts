import { modPow } from "../math";
import { SRPParameterSet, defaultParameters } from "../constants";
import {
  concatByteArrays,
  bigIntToByteArray,
  byteArrayToBigInt,
  hexStringToByteArray,
  generateRandomExponent,
} from "../utils";

import { deriveSharedHash } from "./common";
import { deriveMultiplierSRP6a } from "./multiplier";
import { DigestFn, deriveVerifier } from "./verifier";

export function generateClientEphemeral(
  parameters: SRPParameterSet = defaultParameters
): {
  clientPrivateEphemeral: Uint8Array;
  clientPublicEphemeral: Uint8Array;
} {
  const modulo = byteArrayToBigInt(parameters.N);
  const generator = byteArrayToBigInt(parameters.G);
  while (true) {
    const clientPrivateEphemeral = generateRandomExponent(modulo);
    const clientPublicEphemeral = modPow(
      generator,
      clientPrivateEphemeral,
      modulo
    );
    if (clientPublicEphemeral > 1n) {
      return {
        clientPrivateEphemeral: hexStringToByteArray(
          clientPrivateEphemeral.toString(16)
        ),
        clientPublicEphemeral: hexStringToByteArray(
          clientPublicEphemeral.toString(16)
        ),
      };
    }
  }
}

function modNegative(a: bigint, n: bigint): bigint {
  if (a >= 0n) {
    return a % n;
  }
  const A = -a;
  return n - (A % n);
}

type ClientSharedHashOptions =
  | { sharedHash: Uint8Array }
  | { clientPublicEphemeral: Uint8Array };
export async function deriveSessionKey({
  username,
  password,
  salt,
  clientPrivateEphemeral,
  serverPublicEphemeral,
  digest,
  parameters = defaultParameters,
  unsafe_skipOutputHashing = false,
  ...options
}: ClientSharedHashOptions & {
  username: string;
  password: string;
  salt: Uint8Array;
  clientPrivateEphemeral: Uint8Array;
  serverPublicEphemeral: Uint8Array;
  digest?: DigestFn;
  parameters?: SRPParameterSet;
  unsafe_skipOutputHashing?: boolean;
}): Promise<Uint8Array> {
  const u = byteArrayToBigInt(
    "sharedHash" in options
      ? options.sharedHash
      : await deriveSharedHash({
          serverPublicEphemeral,
          clientPublicEphemeral: options.clientPublicEphemeral,
          parameters,
        })
  );
  const { deriveMultiplier = deriveMultiplierSRP6a } = parameters;
  const k = byteArrayToBigInt(await deriveMultiplier(parameters));

  const N = byteArrayToBigInt(parameters.N);
  const { x: xBytes, verifier } = await deriveVerifier(
    { username, password },
    {
      salt,
      parameters,
      digest,
    }
  );
  const v = byteArrayToBigInt(verifier);
  const B = byteArrayToBigInt(serverPublicEphemeral);
  // B - (k * g^x) = B - (k * v) since g^x = v
  const base = modNegative(B - ((k * v) % N), N);
  const a = byteArrayToBigInt(clientPrivateEphemeral);
  const x = byteArrayToBigInt(xBytes);
  const exp = (a + ((u * x) % N)) % N;
  const S = modPow(base, exp, N);
  if (unsafe_skipOutputHashing) {
    return bigIntToByteArray(S);
  }
  return new Uint8Array(
    await crypto.subtle.digest(parameters.algorithm, bigIntToByteArray(S))
  );
}

export async function deriveClientProof({
  username,
  salt,
  clientPublicEphemeral,
  serverPublicEphemeral,
  sessionKey,
  parameters = defaultParameters,
}: {
  username: string;
  salt: Uint8Array;
  clientPublicEphemeral: Uint8Array;
  serverPublicEphemeral: Uint8Array;
  sessionKey: Uint8Array;
  parameters?: SRPParameterSet;
}) {
  const moduloHash = new Uint8Array(
    await crypto.subtle.digest(parameters.algorithm, parameters.N)
  );
  const generatorHash = new Uint8Array(
    await crypto.subtle.digest(parameters.algorithm, parameters.G)
  );
  const combinedHash = new Uint8Array(
    Array.from({ length: moduloHash.length }).map(
      (_, i) => moduloHash[i] ^ generatorHash[i]
    )
  );
  const usernameHash = new Uint8Array(
    await crypto.subtle.digest(
      parameters.algorithm,
      new TextEncoder().encode(username)
    )
  );
  return new Uint8Array(
    await crypto.subtle.digest(
      parameters.algorithm,
      concatByteArrays(
        combinedHash,
        usernameHash,
        salt,
        clientPublicEphemeral,
        serverPublicEphemeral,
        sessionKey
      )
    )
  );
}

export * from "./verifier";
export * from "./multiplier";
export { safeByteArrayEquals } from "../utils";
