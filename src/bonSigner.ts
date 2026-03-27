import { Address, Transaction, TransactionComputer } from '@multiversx/sdk-core';
import { UserSigner } from '@multiversx/sdk-wallet';
import { BON_GATEWAY_API, TARGET_ADDRESS } from './config';
import { loadBonNetworkConfig } from './bonNetwork';
import { log } from './logger';

const txComputer = new TransactionComputer();

function buildPem(privateKeyHex: string, address: string): string {
  return `-----BEGIN PRIVATE KEY for ${address}-----\n${Buffer.from(privateKeyHex, 'hex').toString('base64')}\n-----END PRIVATE KEY for ${address}-----`;
}

export async function buildAndSignBatch(
  privateKeyHex: string,
  senderBech32: string,
  nonces: number[],
  data?: string
): Promise<any[]> {
  const cfg = await loadBonNetworkConfig();
  const sender = Address.newFromBech32(senderBech32);
  const receiver = Address.newFromBech32(TARGET_ADDRESS);
  const signer = UserSigner.fromPem(buildPem(privateKeyHex, senderBech32));
  const dataBytes = data ? Buffer.from(data) : Buffer.alloc(0);

  const txs: any[] = [];
  for (const nonce of nonces) {
    const tx = new Transaction({
      nonce: BigInt(nonce),
      value: BigInt(0),
      receiver,
      sender,
      gasPrice: BigInt(cfg.minGasPrice),
      gasLimit: BigInt(cfg.defaultGasLimit),
      chainID: cfg.chainID,
      data: dataBytes,
    });
    const bytesToSign = txComputer.computeBytesForSigning(tx);
    const signature = await signer.sign(bytesToSign);
    tx.signature = signature;
    txs.push(tx.toPlainObject());
  }
  return txs;
}

////------/////
export async function sendSingleTx(
  privateKeyHex: string,
  senderBech32: string,
  receiverBech32: string,
  value: string,
  data?: string,
  nonce?: number,
  gasLimit?: number
): Promise<string> {
  const cfg = await loadBonNetworkConfig();
  const sender = Address.newFromBech32(senderBech32);
  const receiver = Address.newFromBech32(receiverBech32);
  const signer = UserSigner.fromPem(buildPem(privateKeyHex, senderBech32));
  const dataBytes = data ? Buffer.from(data) : Buffer.alloc(0);

  let txNonce = nonce;
  if (txNonce === undefined) {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`${BON_GATEWAY_API}/address/${senderBech32}`);
    const body: any = await res.json();
    txNonce = Number(body.data?.account?.nonce ?? 0);
  }

  const tx = new Transaction({
    nonce: BigInt(txNonce!),
    value: BigInt(value || 0),
    receiver,
    sender,
    gasPrice: BigInt(cfg.minGasPrice),
    gasLimit: BigInt(gasLimit ?? cfg.defaultGasLimit),
    chainID: cfg.chainID,
    data: dataBytes,
  });

  const bytesToSign = txComputer.computeBytesForSigning(tx);
  const signature = await signer.sign(bytesToSign);
  tx.signature = signature;

  const fetch = (await import('node-fetch')).default;
  const res = await fetch(`${BON_GATEWAY_API}/transaction/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tx.toPlainObject()),
  });
  if (!res.ok) throw new Error(`tx send failed: ${res.status} ${await res.text()}`);
  const body: any = await res.json();
  return body.data?.txHash ?? '';
}

