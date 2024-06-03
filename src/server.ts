import * as constants from "./constants";
import { safeByteArrayEquals } from "./utils";
import type { SRPParameterSet } from "./constants";

import {
  deriveSessionKey,
  deriveServerProof,
  generateServerEphemeral,
} from "./srp/server";
import { deriveClientProof } from "./srp/client";

export interface ServerState {
  clientVerifier: Uint8Array;
  clientPublicEphemeral: Uint8Array;
  serverPrivateEphemeral: Uint8Array;
  serverPublicEphemeral: Uint8Array;
}

export class ServerSession {
  private parameters: SRPParameterSet = constants.SRP_PARAMETERS_RFC5054_2048;

  private state?: ServerState;
  exportState(): ServerState {
    if (!this.state) {
      throw TypeError(
        "Session is not initialized. Did you call prepareHandshake or importState?"
      );
    }
    return this.state;
  }
  importState(state: ServerState): ServerSession {
    this.state = state;
    return this;
  }

  constructor({
    parameters,
  }: {
    parameters?: SRPParameterSet;
  } = {}) {
    if (parameters) {
      this.parameters = parameters;
    }
  }
  static fromState(
    state: ServerState,
    parameters?: SRPParameterSet
  ): ServerSession {
    return new ServerSession({ parameters }).importState(state);
  }

  async prepareHandshake({
    verifier,
    clientPublicEphemeral,
  }: {
    verifier: Uint8Array;
    clientPublicEphemeral: Uint8Array;
  }): Promise<{ serverPublicEphemeral: Uint8Array }> {
    const { serverPrivateEphemeral, serverPublicEphemeral } =
      await generateServerEphemeral({
        verifier,
        parameters: this.parameters,
      });
    this.state = {
      clientVerifier: verifier,
      clientPublicEphemeral,
      serverPrivateEphemeral,
      serverPublicEphemeral,
    };
    return { serverPublicEphemeral };
  }

  async finalizeHandshake({
    username,
    salt,
    clientProof,
  }: {
    username: string;
    salt: Uint8Array;
    clientProof: Uint8Array;
  }): Promise<{
    serverProof: Uint8Array | null;
    clientVerified: boolean;
  }> {
    if (!this.state) {
      throw Error(
        "Session is not initialized. Did you call prepareHandshake or importState?"
      );
    }

    const sessionKey = await deriveSessionKey({
      verifier: this.state.clientVerifier,
      clientPublicEphemeral: this.state.clientPublicEphemeral,
      serverPublicEphemeral: this.state.serverPublicEphemeral,
      serverPrivateEphemeral: this.state.serverPrivateEphemeral,
      parameters: this.parameters,
    });
    const expectedClientProof = await deriveClientProof({
      username,
      salt,
      clientPublicEphemeral: this.state.clientPublicEphemeral,
      serverPublicEphemeral: this.state.serverPublicEphemeral,
      sessionKey,
      parameters: this.parameters,
    });
    const clientVerified = safeByteArrayEquals(
      clientProof,
      expectedClientProof
    );
    // Don't return server proof if password is invalid!
    // This might compromise the security of user's password.
    // See: https://datatracker.ietf.org/doc/html/rfc2945#section-3
    if (!clientVerified) {
      return { serverProof: null, clientVerified };
    }
    return {
      serverProof: await deriveServerProof({
        clientPublicEphemeral: this.state.clientPublicEphemeral,
        clientProof,
        sessionKey,
        parameters: this.parameters,
      }),
      clientVerified,
    };
  }
}
