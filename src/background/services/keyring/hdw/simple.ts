import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { networks, Psbt } from "bitcoinjs-lib";
import type { ECPairInterface } from "ecpair";

import { BaseWallet } from "./base";
import {
  ECPair,
  tweakSigner,
  privateKeyToWIF,
  ZERO_KEY,
  ZERO_PRIVKEY,
} from "./crypto";
import {
  AddressType,
  Hex,
  Keyring,
  SerializedSimpleKey,
  ToSignInput,
} from "./types";

const HEX_KEY_RE = /^[0-9a-fA-F]{64}$/;

class HDSimpleKey extends BaseWallet implements Keyring<SerializedSimpleKey> {
  privateKey: Uint8Array = ZERO_PRIVKEY;
  publicKey: Buffer = ZERO_KEY;

  private pair?: ECPairInterface;

  constructor(privateKey: Uint8Array) {
    super();
    this.privateKey = privateKey;
  }

  private initPair() {
    if (!this.privateKey)
      throw new Error("Simple Keyring: Invalid privateKey provided");
    if (!this.pair) {
      this.pair = ECPair.fromPrivateKey(Buffer.from(this.privateKey));
      this.publicKey = this.pair.publicKey;
    }
  }

  signTypedData(address: string, typedData: Record<string, unknown>) {
    this.initPair();
    return this.signMessage(address, JSON.stringify(typedData));
  }

  verifyMessage(_address: string, text: string, sig: string) {
    this.initPair();
    return this.pair!.verify(
      Buffer.from(hexToBytes(text)),
      Buffer.from(hexToBytes(sig))
    );
  }

  getAccounts() {
    this.initPair();
    return [this.getAddress(this.publicKey)!];
  }

  serialize() {
    this.initPair();
    return {
      privateKey: bytesToHex(this.privateKey),
      addressType: this.addressType!,
    };
  }

  deserialize(state: SerializedSimpleKey) {
    const wallet = HDSimpleKey.deserialize(state);
    this.privateKey = wallet.privateKey;
    this.addressType = wallet.addressType;
    this.network = wallet.network;
    return this;
  }

  static deserialize(state: SerializedSimpleKey) {
    let privateKey: Uint8Array;
    if (state.isHex || HEX_KEY_RE.test(state.privateKey)) {
      privateKey = hexToBytes(state.privateKey);
    } else {
      const pair = ECPair.fromWIF(state.privateKey);
      privateKey = pair.privateKey!;
    }
    const wallet = new this(privateKey);
    wallet.addressType = state.addressType;
    wallet.network = state.network;
    wallet.initPair();
    return wallet;
  }

  exportAccount(
    _address: Hex,
    _options?: Record<string, unknown> | undefined
  ) {
    this.initPair();
    return privateKeyToWIF(
      Buffer.from(this.privateKey),
      this.network ?? networks.bitcoin,
      this.pair?.compressed ?? true
    );
  }

  exportPublicKey(_address: string) {
    this.initPair();
    return this.publicKey.toString("hex");
  }

  signPsbt(psbt: Psbt, inputs: ToSignInput[]) {
    this.initPair();
    inputs.forEach((input) => {
      if (
        (this.addressType === AddressType.P2TR ||
          this.addressType === AddressType.M44_P2TR) &&
        !input.disableTweakSigner
      ) {
        const signer = tweakSigner(this.pair!, {
          network: this.network ?? networks.bitcoin,
        });
        psbt.signInput(input.index, signer, input.sighashTypes);
      } else {
        psbt.signInput(input.index, this.pair!, input.sighashTypes);
      }
    });
    psbt.finalizeAllInputs();
  }

  signAllInputsInPsbt(
    psbt: Psbt,
    _accountAddress: string,
    disableTweakSigner?: boolean
  ) {
    this.initPair();
    psbt.data.inputs.forEach((input, idx) => {
      if (
        (this.addressType === AddressType.P2TR ||
          this.addressType === AddressType.M44_P2TR) &&
        !disableTweakSigner
      ) {
        const signer = tweakSigner(this.pair!, {
          network: this.network ?? networks.bitcoin,
        });
        psbt.signInput(
          idx,
          signer,
          input.sighashType !== undefined ? [input.sighashType] : undefined
        );
      } else {
        psbt.signInput(
          idx,
          this.pair!,
          input.sighashType !== undefined ? [input.sighashType] : undefined
        );
      }
    });
    return {
      signatures: psbt.data.inputs.map((i) => {
        if (
          i.partialSig &&
          i.partialSig[0] &&
          i.partialSig[0].signature.length
        ) {
          return i.partialSig[0].signature.toString("hex");
        }
      }),
    };
  }

  signInputsWithoutFinalizing(psbt: Psbt, inputs: ToSignInput[]) {
    this.initPair();
    inputs.forEach((input) => {
      if (
        (this.addressType === AddressType.P2TR ||
          this.addressType === AddressType.M44_P2TR) &&
        !input.disableTweakSigner
      ) {
        const signer = tweakSigner(this.pair!, {
          network: this.network ?? networks.bitcoin,
        });
        psbt.signInput(input.index, signer, input.sighashTypes);
      } else {
        psbt.signInput(input.index, this.pair!, input.sighashTypes);
      }
    });
    return psbt.data.inputs.map((f, i) => ({
      inputIndex: i,
      partialSig: f.partialSig?.flatMap((p) => p) ?? [],
    }));
  }

  signMessage(_address: Hex, message: Hex) {
    this.initPair();
    const hash = sha256(message);
    return this.pair!.sign(Buffer.from(hash)).toString("base64");
  }

  signPersonalMessage(address: Hex, message: Hex) {
    return this.signMessage(address, message);
  }
}

export default HDSimpleKey;
