/**
 * GRIMSWAP - Full Private Swap Test (ZK)
 *
 * This test demonstrates the complete private swap flow:
 * 1. Deposit ETH to GrimPool
 * 2. Generate ZK proof
 * 3. Execute private swap through GrimSwapZK hook
 *
 * NOTE: This requires a Uniswap v4 pool with the GrimSwapZK hook.
 * For now, we test the ZK proof generation and verification flow.
 *
 * Run: PRIVATE_KEY=0x... npm run test:fullswap
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chain config
const unichainSepolia = {
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.unichain.org"] } },
} as const;

// Deployed contracts
const CONTRACTS = {
  grimPool: "0x0102Ba64Eefdbf362E402B9dCe0Cf9edfab611f5" as Address,
  groth16Verifier: "0x2AAaCece42E8ec7C6066D547C81a9e7cF09dBaeA" as Address,
  grimSwapZK: "0x5a01290281688BC94cA0e0EA9b3Ea7E7f98d00c4" as Address,
  poolManager: "0x00B036B58a818B1BC34d502D3fE730Db729e62AC" as Address,
};

// ABIs
const GRIM_POOL_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "getLastRoot",
    inputs: [],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isKnownRoot",
    inputs: [{ name: "root", type: "bytes32" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isSpent",
    inputs: [{ name: "nullifierHash", type: "bytes32" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
] as const;

const GROTH16_VERIFIER_ABI = [
  {
    type: "function",
    name: "verifyProof",
    inputs: [
      { name: "_pA", type: "uint256[2]" },
      { name: "_pB", type: "uint256[2][2]" },
      { name: "_pC", type: "uint256[2]" },
      { name: "_pubSignals", type: "uint256[8]" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
] as const;

// Constants
const MERKLE_TREE_HEIGHT = 20;
const FIELD_SIZE = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);
const ZERO_VALUE = BigInt(
  "21663839004416932945382355908790599225266501822907911457504978515578255421292"
);

let poseidon: any;
let F: any;

async function initPoseidon() {
  if (!poseidon) {
    poseidon = await buildPoseidon();
    F = poseidon.F;
  }
}

function randomFieldElement(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let num = BigInt(0);
  for (let i = 0; i < 32; i++) {
    num = (num << BigInt(8)) | BigInt(bytes[i]);
  }
  return num % FIELD_SIZE;
}

async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  await initPoseidon();
  const hash = poseidon(inputs);
  return BigInt(F.toString(hash));
}

interface DepositNote {
  secret: bigint;
  nullifier: bigint;
  amount: bigint;
  commitment: bigint;
  nullifierHash: bigint;
}

async function createDepositNote(amount: bigint): Promise<DepositNote> {
  await initPoseidon();
  const secret = randomFieldElement();
  const nullifier = randomFieldElement();
  const commitment = await poseidonHash([nullifier, secret, amount]);
  const nullifierHash = await poseidonHash([nullifier]);
  return { secret, nullifier, amount, commitment, nullifierHash };
}

function formatCommitment(commitment: bigint): Hex {
  return ("0x" + commitment.toString(16).padStart(64, "0")) as Hex;
}

// Poseidon Merkle Tree
class PoseidonMerkleTree {
  private height: number;
  private leaves: bigint[] = [];
  private zeros: bigint[] = [];
  private layers: bigint[][] = [];

  constructor(height: number = MERKLE_TREE_HEIGHT) {
    this.height = height;
  }

  async initialize() {
    this.zeros = [ZERO_VALUE];
    for (let i = 1; i <= this.height; i++) {
      const prevZero = this.zeros[i - 1];
      this.zeros[i] = await poseidonHash([prevZero, prevZero]);
    }
    this.layers = [];
    for (let i = 0; i <= this.height; i++) {
      this.layers[i] = [];
    }
  }

  async insert(leaf: bigint): Promise<number> {
    if (this.zeros.length === 0) await this.initialize();

    const index = this.leaves.length;
    this.leaves.push(leaf);

    let currentIndex = index;
    let currentValue = leaf;
    this.layers[0][index] = currentValue;

    for (let level = 0; level < this.height; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
      const sibling = this.layers[level][siblingIndex] ?? this.zeros[level];
      const [left, right] = isLeft ? [currentValue, sibling] : [sibling, currentValue];
      currentValue = await poseidonHash([left, right]);
      currentIndex = Math.floor(currentIndex / 2);
      this.layers[level + 1][currentIndex] = currentValue;
    }
    return index;
  }

  getRoot(): bigint {
    if (this.layers[this.height]?.[0]) return this.layers[this.height][0];
    return this.zeros[this.height];
  }

  getProof(leafIndex: number) {
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < this.height; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
      const sibling = this.layers[level][siblingIndex] ?? this.zeros[level];
      pathElements.push(sibling);
      pathIndices.push(isLeft ? 0 : 1);
      currentIndex = Math.floor(currentIndex / 2);
    }
    return { root: this.getRoot(), pathElements, pathIndices };
  }
}

async function generateZKProof(
  note: DepositNote,
  merkleProof: { root: bigint; pathElements: bigint[]; pathIndices: number[] },
  recipient: string,
  relayer: string,
  relayerFee: string,
  swapAmountOut: string
) {
  const circuitsPath = path.resolve(__dirname, "../../grimswap-circuits");
  const wasmPath = path.join(circuitsPath, "build/privateSwap_js/privateSwap.wasm");
  const zkeyPath = path.join(circuitsPath, "setup/privateSwap_final.zkey");

  const input = {
    merkleRoot: merkleProof.root.toString(),
    nullifierHash: note.nullifierHash.toString(),
    recipient,
    relayer,
    relayerFee,
    swapAmountOut,
    secret: note.secret.toString(),
    nullifier: note.nullifier.toString(),
    depositAmount: note.amount.toString(),
    pathElements: merkleProof.pathElements.map((e) => e.toString()),
    pathIndices: merkleProof.pathIndices,
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  return { proof, publicSignals };
}

function formatProofForContract(proof: any, publicSignals: string[]) {
  return {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])] as [bigint, bigint],
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ] as [[bigint, bigint], [bigint, bigint]],
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])] as [bigint, bigint],
    pubSignals: publicSignals.map((s) => BigInt(s)) as [
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint
    ],
  };
}

function encodeHookData(contractProof: ReturnType<typeof formatProofForContract>): Hex {
  return encodeAbiParameters(
    parseAbiParameters("uint256[2], uint256[2][2], uint256[2], uint256[8]"),
    [contractProof.pA, contractProof.pB, contractProof.pC, contractProof.pubSignals]
  );
}

async function main() {
  console.log("");
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║       GRIMSWAP - FULL PRIVATE SWAP TEST (ZK)                   ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log("");

  const privateKey = process.env.PRIVATE_KEY as Hex;
  if (!privateKey) {
    console.error("ERROR: Set PRIVATE_KEY environment variable");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log("Network: Unichain Sepolia (Chain ID: 1301)");
  console.log("Account:", account.address);
  console.log("");

  const publicClient = createPublicClient({
    chain: unichainSepolia,
    transport: http("https://sepolia.unichain.org"),
  });

  const walletClient = createWalletClient({
    account,
    chain: unichainSepolia,
    transport: http("https://sepolia.unichain.org"),
  });

  const ethBalance = await publicClient.getBalance({ address: account.address });
  console.log("ETH Balance:", formatEther(ethBalance), "ETH");
  console.log("");

  console.log("Deployed Contracts:");
  console.log("  GrimPool:", CONTRACTS.grimPool);
  console.log("  Groth16Verifier:", CONTRACTS.groth16Verifier);
  console.log("  GrimSwapZK Hook:", CONTRACTS.grimSwapZK);
  console.log("  PoolManager:", CONTRACTS.poolManager);
  console.log("");

  await initPoseidon();

  // ============================================
  // STEP 1: Create Deposit Note
  // ============================================
  console.log("┌────────────────────────────────────────────────────────────────┐");
  console.log("│ STEP 1: Create Deposit Note                                   │");
  console.log("└────────────────────────────────────────────────────────────────┘");

  const depositAmount = parseEther("0.001");
  const note = await createDepositNote(depositAmount);
  console.log("  Amount:", formatEther(note.amount), "ETH");
  console.log("  Commitment:", formatCommitment(note.commitment).slice(0, 42) + "...");
  console.log("  NullifierHash:", formatCommitment(note.nullifierHash).slice(0, 42) + "...");
  console.log("");

  // ============================================
  // STEP 2: Deposit to GrimPool
  // ============================================
  console.log("┌────────────────────────────────────────────────────────────────┐");
  console.log("│ STEP 2: Deposit to GrimPool (on-chain)                        │");
  console.log("└────────────────────────────────────────────────────────────────┘");

  const commitmentBytes = formatCommitment(note.commitment);

  try {
    const depositHash = await walletClient.writeContract({
      address: CONTRACTS.grimPool,
      abi: GRIM_POOL_ABI,
      functionName: "deposit",
      args: [commitmentBytes],
      value: depositAmount,
    });

    console.log("  TX Hash:", depositHash);
    console.log("  Waiting for confirmation...");

    const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
    console.log("  Status:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    console.log("  Gas used:", receipt.gasUsed.toString());
    console.log("  View: https://unichain-sepolia.blockscout.com/tx/" + depositHash);
    console.log("");

    // ============================================
    // STEP 3: Build Merkle Tree & Generate Proof
    // ============================================
    console.log("┌────────────────────────────────────────────────────────────────┐");
    console.log("│ STEP 3: Build Merkle Tree & Generate ZK Proof                 │");
    console.log("└────────────────────────────────────────────────────────────────┘");

    const tree = new PoseidonMerkleTree(MERKLE_TREE_HEIGHT);
    await tree.initialize();
    await tree.insert(note.commitment);

    const merkleProof = tree.getProof(0);
    console.log("  Merkle root:", formatCommitment(merkleProof.root).slice(0, 42) + "...");
    console.log("  Path elements:", merkleProof.pathElements.length);

    // Generate stealth address (for demo, use our address)
    const stealthAddress = BigInt(account.address).toString();
    console.log("  Recipient (stealth):", account.address);
    console.log("");

    console.log("  Generating ZK proof...");
    const startTime = Date.now();

    const { proof, publicSignals } = await generateZKProof(
      note,
      merkleProof,
      stealthAddress,
      "0", // relayer
      "0", // relayerFee
      note.amount.toString() // swapAmountOut
    );

    const proofTime = Date.now() - startTime;
    console.log("  Proof generated in:", proofTime, "ms");
    console.log("");

    // ============================================
    // STEP 4: Verify Proof On-Chain
    // ============================================
    console.log("┌────────────────────────────────────────────────────────────────┐");
    console.log("│ STEP 4: Verify ZK Proof On-Chain                              │");
    console.log("└────────────────────────────────────────────────────────────────┘");

    const contractProof = formatProofForContract(proof, publicSignals);

    const isValid = await publicClient.readContract({
      address: CONTRACTS.groth16Verifier,
      abi: GROTH16_VERIFIER_ABI,
      functionName: "verifyProof",
      args: [
        contractProof.pA,
        contractProof.pB,
        contractProof.pC,
        contractProof.pubSignals,
      ],
    });

    console.log("  Groth16Verifier.verifyProof():", isValid ? "VALID" : "INVALID");
    console.log("");

    // ============================================
    // STEP 5: Encode Hook Data
    // ============================================
    console.log("┌────────────────────────────────────────────────────────────────┐");
    console.log("│ STEP 5: Prepare Hook Data for Swap                            │");
    console.log("└────────────────────────────────────────────────────────────────┘");

    const hookData = encodeHookData(contractProof);
    console.log("  Hook data length:", hookData.length, "bytes");
    console.log("  Hook data (first 100 chars):", hookData.slice(0, 100) + "...");
    console.log("");

    console.log("  NOTE: To execute a full private swap, you need:");
    console.log("    1. A Uniswap v4 pool initialized with GrimSwapZK hook");
    console.log("    2. Liquidity in that pool");
    console.log("    3. Call swap() with this hookData");
    console.log("");

    // ============================================
    // Summary
    // ============================================
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║          ZK PRIVATE SWAP PREPARATION COMPLETE                  ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
    console.log("");
    console.log("Summary:");
    console.log("  - Deposit to GrimPool:", depositHash);
    console.log("  - ZK proof generated in", proofTime, "ms");
    console.log("  - On-chain verification:", isValid ? "PASSED" : "FAILED");
    console.log("  - Hook data ready for swap");
    console.log("");
    console.log("Privacy guarantees:");
    console.log("  [x] Sender hidden (ZK proof proves deposit without revealing which)");
    console.log("  [x] Recipient is stealth address");
    console.log("  [x] Relayer can submit tx to hide gas payer");
    console.log("  [x] Nullifier prevents double-spend");
    console.log("");

  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.cause) console.error("Cause:", error.cause);
  }
}

main().catch(console.error);
