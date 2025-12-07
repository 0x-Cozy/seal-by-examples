import 'dotenv/config';
import { SealClient, SealCompatibleClient, SessionKey, NoAccessError, EncryptedObject, type ExportedSessionKey } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/sui/utils';
import { writeFileSync } from 'fs';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const DEFAULT_SEAL_SERVERS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
  '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
];

const AGGREGATORS = [
  'https://aggregator.walrus-testnet.walrus.space',
  'https://wal-aggregator-testnet.staketab.org',
  'https://walrus-testnet-aggregator.redundex.com',
  'https://walrus-testnet-aggregator.nodes.guru',
  'https://aggregator.walrus.banansen.dev',
  'https://walrus-testnet-aggregator.everstake.one',
];

type MoveCallConstructor = (tx: Transaction, id: string) => void;

function constructMoveCall(packageId: string, policyObjectId: string): MoveCallConstructor {
  return (tx: Transaction, id: string) => {
    tx.moveCall({
      target: `${packageId}::contract::seal_approve`,
      arguments: [
        tx.pure.vector('u8', fromHex(id)),
        tx.object(policyObjectId)
      ],
    });
  };
}

async function downloadBlob(blobId: string): Promise<ArrayBuffer | null> {
  for (const aggregatorBase of AGGREGATORS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const aggregatorUrl = `${aggregatorBase}/v1/blobs/${blobId}`;
      
      const response = await fetch(aggregatorUrl, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (response.ok) {
        return await response.arrayBuffer();
      }
    } catch (err) {
      continue;
    }
  }
  
  return null;
}

async function downloadAndDecrypt(
  blobIds: string[],
  sessionKey: SessionKey,
  suiClient: SuiClient,
  sealClient: SealClient,
  moveCallConstructor: MoveCallConstructor,
  packageId: string,
  policyObjectId: string
): Promise<Uint8Array[]> {
  console.log(`Downloading ${blobIds.length} blob(s)...`);
  
  const downloadResults = await Promise.all(
    blobIds.map(async (blobId) => {
      return await downloadBlob(blobId);
    })
  );

  const validDownloads = downloadResults.filter((result): result is ArrayBuffer => result !== null);
  
  console.log(`Downloaded ${validDownloads.length} of ${blobIds.length} blob(s)`);
  
  if (validDownloads.length === 0) {
    throw new Error('Cannot retrieve files from Walrus aggregators. Files uploaded more than 1 epoch ago may have been deleted.');
  }

  console.log('Fetching decryption keys...');
  
  for (let i = 0; i < validDownloads.length; i += 10) {
    const batch = validDownloads.slice(i, i + 10);
    const ids = batch.map((enc) => EncryptedObject.parse(new Uint8Array(enc)).id);
    
    const tx = new Transaction();
    ids.forEach((id) => moveCallConstructor(tx, id));
    
    const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
    
    try {
      await sealClient.fetchKeys({ ids, txBytes, sessionKey, threshold: 2 });
    } catch (err) {
        console.error(err);
      if (err instanceof NoAccessError) {
        throw new Error('No access to decryption keys');
      }
      throw new Error('Unable to fetch decryption keys');
    }
  }

  console.log('Decrypting files...');
  
  const decryptedFiles: Uint8Array[] = [];
  
  for (const encryptedData of validDownloads) {
    const fullId = EncryptedObject.parse(new Uint8Array(encryptedData)).id;
    const tx = new Transaction();
    moveCallConstructor(tx, fullId);
    const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
    
    try {
      const decryptedFile = await sealClient.decrypt({
        data: new Uint8Array(encryptedData),
        sessionKey,
        txBytes,
      });
      decryptedFiles.push(decryptedFile);
    } catch (err) {
      if (err instanceof NoAccessError) {
        throw new Error('No access to decryption keys');
      }
      throw new Error('Unable to decrypt files');
    }
  }

  return decryptedFiles;
}

async function main() {
  const policyObjectId = process.env.POLICY_OBJECT_ID;
  const packageId = process.env.PACKAGE_ID;
  const blobIds = process.env.BLOB_IDS?.split(',').map(id => id.trim()) || [];
  const rpcUrl = process.env.RPC_URL || getFullnodeUrl('testnet');
  const privateKey = process.env.PRIVATE_KEY;
  const outputDir = process.env.OUTPUT_DIR || './';

  if (!policyObjectId || !packageId || blobIds.length === 0) {
    console.error('Missing required env vars:');
    console.error('  POLICY_OBJECT_ID');
    console.error('  PACKAGE_ID');
    console.error('  BLOB_IDS (comma-separated)');
    process.exit(1);
  }

  if (!privateKey) {
    console.error('PRIVATE_KEY required for signing session key');
    process.exit(1);
  }

  try {
    const suiClient = new SuiClient({ url: rpcUrl });
    const sealClient = new SealClient({
      suiClient: suiClient as unknown as SealCompatibleClient,
      serverConfigs: DEFAULT_SEAL_SERVERS.map((id) => ({
        objectId: id,
        weight: 1,
      })),
      verifyKeyServers: false,
    });

    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const sender = keypair.toSuiAddress();
    
    console.log(`Creating session key for ${sender}...`);
    
    const sessionKey = await SessionKey.create({
      address: sender,
      packageId,
      ttlMin: 10,
      suiClient: suiClient as unknown as SealCompatibleClient,
    });

    console.log('Signing session key message...');
    
    const personalMessage = sessionKey.getPersonalMessage();
    const { signature } = await keypair.signPersonalMessage(personalMessage);
    await sessionKey.setPersonalMessageSignature(signature);

    const moveCallConstructor = constructMoveCall(packageId, policyObjectId);
    
    const decryptedFiles = await downloadAndDecrypt(
      blobIds,
      sessionKey,
      suiClient,
      sealClient,
      moveCallConstructor,
      packageId,
      policyObjectId
    );

    console.log(`\nDecrypted ${decryptedFiles.length} file(s)`);
    
    for (let i = 0; i < decryptedFiles.length; i++) {
      const outputPath = `${outputDir}hereisthefockingdecryptedimage_${i + 1}.png`;
      writeFileSync(outputPath, decryptedFiles[i]);
      console.log(`Saved: ${outputPath}`);
    }
    
  } catch (error) {
    console.error('Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

