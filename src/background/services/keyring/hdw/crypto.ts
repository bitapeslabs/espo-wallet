import * as ecc from "@bitcoinerlab/secp256k1";
import { initEccLib, crypto as belCrypto, Network } from "bitcoinjs-lib";
import ECPairFactory, { ECPairInterface } from "ecpair";
import BIP32Factory from "bip32";
import bs58check from "bs58check";
import { toXOnly } from "@/shared/utils/transactions";

// bitcoinjs-lib needs the secp256k1 backend registered once for taproot
initEccLib(ecc);

export { ecc };
export const ECPair = ECPairFactory(ecc);
export const bip32 = BIP32Factory(ecc);

export const ZERO_PRIVKEY = Buffer.alloc(32);
export const ZERO_KEY = Buffer.alloc(33);

/**
 * WIF-encode a private key WITHOUT ecpair's `toWIF()`. ecpair@2's bundled
 * `wif`/`bs58check` hash via create-hash/sha.js, which isn't polyfilled in this
 * browser build and throws ("Cannot read properties of undefined (reading
 * 'call')"). bs58check@3 hashes with @noble/hashes, matching bitcoinjs-lib v6.
 */
export function privateKeyToWIF(
  privateKey: Buffer,
  network: Network,
  compressed = true
): string {
  const payload = Buffer.concat([
    Buffer.from([network.wif]),
    privateKey,
    compressed ? Buffer.from([0x01]) : Buffer.alloc(0),
  ]);
  return bs58check.encode(payload);
}

function tapTweakHash(pubKey: Buffer, h?: Buffer): Buffer {
  return belCrypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  );
}

export function tweakSigner(
  signer: ECPairInterface,
  opts: { network?: Network; tweakHash?: Buffer }
): ECPairInterface {
  let privateKey: Uint8Array | undefined = signer.privateKey;
  if (!privateKey) {
    throw new Error("Private key is required for tweaking signer!");
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }
  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(Buffer.from(signer.publicKey)), opts.tweakHash)
  );
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!");
  }
  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}
