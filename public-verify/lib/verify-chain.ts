import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL);

export type ChainVerification = {
  isVerified: boolean;
  txHash: string | null;
  blockNumber: number | null;
  explorerUrl: string | null;
};

export async function verifyTx(txHash?: string | null): Promise<ChainVerification> {
  if (!txHash) {
    return { isVerified: false, txHash: null, blockNumber: null, explorerUrl: null };
  }

  try {
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return { isVerified: false, txHash, blockNumber: null, explorerUrl: null };
    }

    const receipt = await provider.getTransactionReceipt(txHash);
    const explorerBase = process.env.NEXT_PUBLIC_POLYGONSCAN_BASE_URL || 'https://polygonscan.com/tx/';

    return {
      isVerified: !!receipt,
      txHash,
      blockNumber: receipt ? Number(receipt.blockNumber) : null,
      explorerUrl: `${explorerBase}${txHash}`,
    };
  } catch {
    return { isVerified: false, txHash, blockNumber: null, explorerUrl: null };
  }
}
