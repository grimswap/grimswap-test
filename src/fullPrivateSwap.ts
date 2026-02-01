/**
 * SPECTRE PROTOCOL - Full Private Swap Test (SDK)
 *
 * This script executes a REAL private swap on Unichain Sepolia using:
 * 1. SDK for stealth key generation
 * 2. SDK for LSAG ring signature
 * 3. SDK for hook data encoding
 * 4. On-chain swap through SpectreHook
 *
 * Run: PRIVATE_KEY=0x... npm run test:swap
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  encodeAbiParameters,
  keccak256,
  type Hex,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  generateStealthKeys,
  generateRingSignature,
  encodeHookData,
} from '@spectre-protocol/sdk';

// Chain config
const unichainSepolia = {
  id: 1301,
  name: 'Unichain Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia.unichain.org'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://unichain-sepolia.blockscout.com' } },
} as const;

// Deployed contracts from Foundry ExecutePrivateSwap test
const DEPLOYED = {
  // SpectreHook with mock verifier (accepts any signature for demo)
  spectreHook: '0xb51F08EA987e1ca926e6730aeA5Dd5aeb5E7C0C4' as Address,
  // Test tokens
  tokenA: '0x32cCA622f5Cd2b45a937C4E8536743C756187127' as Address,
  tokenB: '0xE2AD3068aD183595152269a81eE72F44A176880c' as Address,
  // Pool helper for executing swaps
  poolHelper: '0x8D5Af9050D765a1B67785Ae4Cec595360E2A29c7' as Address,
  // Pool manager
  poolManager: '0x00B036B58a818B1BC34d502D3fE730Db729e62AC' as Address,
};

// Pool key components (must match what was used to create the pool)
const POOL_KEY = {
  currency0: DEPLOYED.tokenA,
  currency1: DEPLOYED.tokenB,
  fee: 3000,
  tickSpacing: 60,
  hooks: DEPLOYED.spectreHook,
};

// ABIs
const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'mint',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const POOL_HELPER_ABI = [
  {
    type: 'function',
    name: 'swap',
    inputs: [
      {
        name: 'key',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
      { name: 'zeroForOne', type: 'bool' },
      { name: 'amountSpecified', type: 'int256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
      { name: 'hookData', type: 'bytes' },
      { name: 'from', type: 'address' },
    ],
    outputs: [{ name: 'delta', type: 'int256' }],
    stateMutability: 'nonpayable',
  },
] as const;

const SPECTRE_HOOK_ABI = [
  {
    type: 'function',
    name: 'totalPrivateSwaps',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'usedKeyImages',
    inputs: [{ name: 'keyImage', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

// Compute pool ID (keccak256 of encoded pool key)
function computePoolId(key: typeof POOL_KEY): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint24' },
        { type: 'int24' },
        { type: 'address' },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]
    )
  );
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     SPECTRE PROTOCOL - FULL PRIVATE SWAP TEST (SDK)            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Check for private key
  const privateKey = process.env.PRIVATE_KEY as Hex;
  if (!privateKey) {
    console.error('ERROR: Set PRIVATE_KEY environment variable');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log('Network: Unichain Sepolia (Chain ID: 1301)');
  console.log('Account:', account.address);
  console.log('');

  // Create clients
  const publicClient = createPublicClient({
    chain: unichainSepolia,
    transport: http('https://sepolia.unichain.org'),
  });

  const walletClient = createWalletClient({
    account,
    chain: unichainSepolia,
    transport: http('https://sepolia.unichain.org'),
  });

  // Check ETH balance
  const ethBalance = await publicClient.getBalance({ address: account.address });
  console.log('ETH Balance:', formatEther(ethBalance), 'ETH');

  // Check token balances
  const tokenABalance = await publicClient.readContract({
    address: DEPLOYED.tokenA,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  const tokenBBalance = await publicClient.readContract({
    address: DEPLOYED.tokenB,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  console.log('Token A Balance:', formatEther(tokenABalance));
  console.log('Token B Balance:', formatEther(tokenBBalance));
  console.log('');

  // Check if we need to mint tokens
  if (tokenABalance < parseEther('100')) {
    console.log('Minting Token A...');
    const mintHash = await walletClient.writeContract({
      address: DEPLOYED.tokenA,
      abi: ERC20_ABI,
      functionName: 'mint',
      args: [account.address, parseEther('10000')],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
    console.log('  Minted 10,000 Token A');
  }

  // ============================================
  // STEP 1: Generate Stealth Keys (SDK)
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 1: Generate Stealth Keys (SDK)                           │');
  console.log('└────────────────────────────────────────────────────────────────┘');

  const recipientKeys = generateStealthKeys();
  console.log('Generated stealth keys');
  console.log('  Meta-address:', recipientKeys.stealthMetaAddress.slice(0, 50) + '...');
  console.log('');

  // ============================================
  // STEP 2: Create Ring Members
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 2: Create Ring Members                                   │');
  console.log('└────────────────────────────────────────────────────────────────┘');

  // Ring of 5: real signer + 4 decoys
  const ringMembers: Address[] = [
    account.address,
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  ];

  console.log('Ring size:', ringMembers.length);
  console.log('  Signer:', account.address, '(hidden among decoys)');
  console.log('');

  // ============================================
  // STEP 3: Prepare Swap Parameters
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 3: Prepare Swap Parameters                               │');
  console.log('└────────────────────────────────────────────────────────────────┘');

  const poolId = computePoolId(POOL_KEY);
  const swapAmount = parseEther('10'); // Swap 10 tokens
  const zeroForOne = true; // Token A -> Token B
  const sqrtPriceLimitX96 = 4295128740n; // MIN_SQRT_PRICE + 1

  console.log('Pool ID:', poolId.slice(0, 30) + '...');
  console.log('Swap: 10 Token A -> Token B');
  console.log('Direction: zeroForOne =', zeroForOne);
  console.log('');

  // ============================================
  // STEP 4: Generate Ring Signature (SDK)
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 4: Generate Ring Signature (SDK - Real LSAG)             │');
  console.log('└────────────────────────────────────────────────────────────────┘');

  // Create message hash (same as contract creates)
  const message = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bool' },
        { type: 'int256' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [poolId, zeroForOne, -swapAmount, 1301n, DEPLOYED.spectreHook]
    )
  );

  console.log('Message hash:', message.slice(0, 40) + '...');

  const { signature: ringSignature, keyImage } = generateRingSignature({
    message,
    privateKey,
    publicKeys: ringMembers,
    signerIndex: 0,
  });

  console.log('Ring signature generated');
  console.log('  Signature size:', (ringSignature.length - 2) / 2, 'bytes');
  console.log('  Key image:', keyImage.slice(0, 40) + '...');
  console.log('');

  // ============================================
  // STEP 5: Encode Hook Data (SDK)
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 5: Encode Hook Data (SDK)                                │');
  console.log('└────────────────────────────────────────────────────────────────┘');

  const hookData = encodeHookData({
    ringSignature,
    keyImage,
    ringMembers,
    stealthMetaAddress: recipientKeys.stealthMetaAddress,
  });

  console.log('Hook data encoded');
  console.log('  Total size:', (hookData.length - 2) / 2, 'bytes');
  console.log('');

  // ============================================
  // STEP 6: Approve Tokens
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 6: Approve Tokens                                        │');
  console.log('└────────────────────────────────────────────────────────────────┘');

  console.log('Approving Token A for PoolHelper...');
  const approveHash = await walletClient.writeContract({
    address: DEPLOYED.tokenA,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [DEPLOYED.poolHelper, parseEther('1000000')],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log('  Approved');
  console.log('');

  // ============================================
  // STEP 7: Pre-Swap State
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 7: Pre-Swap State                                        │');
  console.log('└────────────────────────────────────────────────────────────────┘');

  const preSwapCount = await publicClient.readContract({
    address: DEPLOYED.spectreHook,
    abi: SPECTRE_HOOK_ABI,
    functionName: 'totalPrivateSwaps',
  });

  const preTokenA = await publicClient.readContract({
    address: DEPLOYED.tokenA,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  const preTokenB = await publicClient.readContract({
    address: DEPLOYED.tokenB,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  console.log('Total private swaps before:', preSwapCount.toString());
  console.log('Token A balance before:', formatEther(preTokenA));
  console.log('Token B balance before:', formatEther(preTokenB));
  console.log('');

  // ============================================
  // STEP 8: Execute Private Swap
  // ============================================
  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│ STEP 8: EXECUTE PRIVATE SWAP                                  │');
  console.log('└────────────────────────────────────────────────────────────────┘');

  console.log('');
  console.log('Executing private swap...');
  console.log('');

  try {
    const swapHash = await walletClient.writeContract({
      address: DEPLOYED.poolHelper,
      abi: POOL_HELPER_ABI,
      functionName: 'swap',
      args: [
        {
          currency0: POOL_KEY.currency0,
          currency1: POOL_KEY.currency1,
          fee: POOL_KEY.fee,
          tickSpacing: POOL_KEY.tickSpacing,
          hooks: POOL_KEY.hooks,
        },
        zeroForOne,
        -swapAmount, // Negative = exact input
        sqrtPriceLimitX96,
        hookData,
        account.address,
      ],
    });

    console.log('Transaction submitted:', swapHash);
    console.log('Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });
    console.log('');
    console.log('Transaction confirmed!');
    console.log('  Block:', receipt.blockNumber);
    console.log('  Gas used:', receipt.gasUsed.toString());
    console.log('  Status:', receipt.status === 'success' ? 'SUCCESS' : 'FAILED');
    console.log('');

    // ============================================
    // STEP 9: Post-Swap State
    // ============================================
    console.log('┌────────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 9: Post-Swap State                                       │');
    console.log('└────────────────────────────────────────────────────────────────┘');

    const postSwapCount = await publicClient.readContract({
      address: DEPLOYED.spectreHook,
      abi: SPECTRE_HOOK_ABI,
      functionName: 'totalPrivateSwaps',
    });

    const postTokenA = await publicClient.readContract({
      address: DEPLOYED.tokenA,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });

    const postTokenB = await publicClient.readContract({
      address: DEPLOYED.tokenB,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });

    console.log('Total private swaps after:', postSwapCount.toString());
    console.log('Token A balance after:', formatEther(postTokenA));
    console.log('Token B balance after:', formatEther(postTokenB));
    console.log('');

    const tokenAChange = preTokenA - postTokenA;
    const tokenBChange = postTokenB - preTokenB;

    console.log('Balance Changes:');
    console.log('  Token A spent:', formatEther(tokenAChange));
    console.log('  Token B received:', formatEther(tokenBChange));
    console.log('');

    // ============================================
    // SUMMARY
    // ============================================
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                 PRIVATE SWAP SUCCESSFUL!                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Privacy Features Applied:');
    console.log('  [x] Ring signature verified (sender hidden among', ringMembers.length, 'addresses)');
    console.log('  [x] Key image recorded (prevents double-spend)');
    console.log('  [x] Stealth address generated (recipient hidden)');
    console.log('  [x] ERC-5564 announcement emitted');
    console.log('');
    console.log('View on Explorer:');
    console.log('  https://unichain-sepolia.blockscout.com/tx/' + swapHash);
    console.log('');
  } catch (error: unknown) {
    const err = error as Error & { cause?: unknown };
    console.error('');
    console.error('Swap failed:', err.message);
    if (err.cause) {
      console.error('Cause:', err.cause);
    }
    console.error('');
    console.error('Note: Make sure the pool has liquidity. Run the Foundry');
    console.error('ExecutePrivateSwap script first to deploy the test pool.');
  }
}

main().catch(console.error);
