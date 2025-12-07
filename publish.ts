import 'dotenv/config';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHEX } from '@mysten/sui/utils';

const packageId = process.env.PACKAGE_ID || '';
const policyObjectId = process.env.POLICY_OBJECT_ID || '';
const capId = process.env.CAP_ID || '';
const moduleName = process.env.MODULE_NAME || 'contract';
const rpcUrl = process.env.RPC_URL || '';
const privateKey = process.env.PRIVATE_KEY || '';

async function publishBlob(
  blobId: string
) {
  const suiClient = new SuiClient({ url: rpcUrl || getFullnodeUrl('testnet') });
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::${moduleName}::publish`,
    arguments: [
      tx.object(policyObjectId),
      tx.object(capId),
      tx.pure.string(blobId),
    ],
  });

  tx.setGasBudget(10000000);

  if (privateKey) {
    console.log('Signing and sending...');
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const sender = keypair.toSuiAddress();
    console.log(`From: ${sender}`);

    const result = await suiClient.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showRawEffects: true,
        showEffects: true,
      },
    });

    console.log(`Digest: ${result.digest}`);
    
    if (result.effects?.status?.status === 'success') {
      console.log('Published!');
    } else {
      console.log('Failed');
    }

    return result;
  } else {
    console.log('Building transaction...');
    const builtTx = await tx.build({ client: suiClient });
    console.log(`Transaction bytes: ${builtTx.length}`);
    return { builtTx, tx };
  }
}

async function main() {
  const policyObjectId = process.env.POLICY_OBJECT_ID;
  const capId = process.env.CAP_ID;
  const blobId = process.env.BLOB_ID;
  const packageId = process.env.PACKAGE_ID;

  if (!policyObjectId || !capId || !blobId || !packageId) {
    console.error('add envs');
    process.exit(1);
  }

  try {
    await publishBlob(blobId);
  } catch (error) {
    console.error('Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
