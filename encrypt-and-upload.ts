import 'dotenv/config';
import { SealClient, SealCompatibleClient } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { fromHex, toHex } from '@mysten/sui/utils';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_SEAL_SERVERS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
  '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
];

const PUBLISHERS = [
  'https://publisher.walrus-testnet.walrus.space',
  'https://wal-publisher-testnet.staketab.org',
  'https://walrus-testnet-publisher.redundex.com',
  'https://walrus-testnet-publisher.nodes.guru',
  'https://publisher.walrus.banansen.dev',
  'https://walrus-testnet-publisher.everstake.one',
];

const NUM_EPOCH = 1;

interface EncryptOptions {
  filePath: string;
  policyObjectId: string;
  packageId: string;
  rpcUrl?: string;
  threshold?: number;
  sealServers?: string[];
}

async function encryptFile(options: EncryptOptions): Promise<{
  encryptedData: Uint8Array;
  id: string;
}> {
  const {
    filePath,
    policyObjectId,
    packageId,
    rpcUrl = getFullnodeUrl('testnet'),
    threshold = 2,
    sealServers = DEFAULT_SEAL_SERVERS,
  } = options;

  const suiClient = new SuiClient({ url: rpcUrl });
  const client = new SealClient({
    suiClient: suiClient as unknown as SealCompatibleClient,
    serverConfigs: sealServers.map((id) => ({
      objectId: id,
      weight: 1,
    })),
    verifyKeyServers: false,
  });

  console.log(`read file ${filePath}`);
  const fileData = readFileSync(resolve(process.cwd(), filePath));
  const fileBytes = new Uint8Array(fileData);
  console.log(`Got ${fileBytes.length} bytes`);

  const policyObjectBytes = fromHex(policyObjectId);
  const nonce = crypto.getRandomValues(new Uint8Array(5));
  const id = toHex(new Uint8Array([...policyObjectBytes, ...nonce]));

  console.log(`encrypting.`);
  const { encryptedObject: encryptedBytes } = await client.encrypt({
    threshold,
    packageId,
    id,
    data: fileBytes,
  });

  console.log(`Encrypted to ${encryptedBytes.length} bytes`);

  return {
    encryptedData: encryptedBytes,
    id,
  };
}

async function uploadToWalrus(encryptedData: Uint8Array): Promise<string> {
  for (const publisherBase of PUBLISHERS) {
    try {
      const publisherUrl = `${publisherBase}/v1/blobs?epochs=${NUM_EPOCH}`;
      const response = await fetch(publisherUrl, {
        method: 'PUT',
        body: new Uint8Array(encryptedData),
      });

      if (response.status === 200) {
        const storageInfo: any = await response.json();
        let blobId: string;
        
        if ('alreadyCertified' in storageInfo) {
          blobId = storageInfo.alreadyCertified.blobId;
        } else if ('newlyCreated' in storageInfo) {
          blobId = storageInfo.newlyCreated.blobObject.blobId;
        } else {
          throw new Error('Unexpected Walrus response format');
        }
        
        console.log('Uploaded to Walrus');
        return blobId;
      }
    } catch (err) {
      continue;
    }
  }
  
  throw new Error('Failed to upload to any Walrus publisher');
}

async function main() {
  const filePath = process.env.FILE_PATH;
  const policyObjectId = process.env.POLICY_OBJECT_ID;
  const packageId = process.env.PACKAGE_ID;
  const rpcUrl = process.env.RPC_URL;

  if (!filePath || !policyObjectId || !packageId) {
    console.error('add envs');
    process.exit(1);
  }

  try {
    const result = await encryptFile({
      filePath,
      policyObjectId,
      packageId,
      rpcUrl,
    });

    const blobId = await uploadToWalrus(result.encryptedData);

    const outputPath = filePath + '.encrypted';
    const fs = await import('fs');
    fs.writeFileSync(outputPath, result.encryptedData);
    
    console.log(`\nSaved encrypted file: ${outputPath}`);
    console.log(`Blob ID: ${blobId}`);
  } catch (error) {
    console.error('Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
