/**
 * GRIMSWAP - Timing Test
 *
 * Measures exact time for each step of a private swap
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

const unichainSepolia = {
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.unichain.org"] } },
} as const;

const CONTRACTS = {
  grimPool: "0x0102Ba64Eefdbf362E402B9dCe0Cf9edfab611f5" as Address,
  groth16Verifier: "0x2AAaCece42E8ec7C6066D547C81a9e7cF09dBaeA" as Address,
};

const GRIM_POOL_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
    stateMutability: "payable",
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

const MERKLE_TREE_HEIGHT = 20;
const FIELD_SIZE = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
const ZERO_VALUE = BigInt("21663839004416932945382355908790599225266501822907911457504978515578255421292");

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
  const hash = poseidon(inputs);
  return BigInt(F.toString(hash));
}

async function createDepositNote(amount: bigint) {
  const secret = randomFieldElement();
  const nullifier = randomFieldElement();
  const commitment = await poseidonHash([nullifier, secret, amount]);
  const nullifierHash = await poseidonHash([nullifier]);
  return { secret, nullifier, amount, commitment, nullifierHash };
}

function formatCommitment(commitment: bigint): Hex {
  return ("0x" + commitment.toString(16).padStart(64, "0")) as Hex;
}

class PoseidonMerkleTree {
  private height: number;
  private zeros: bigint[] = [];
  private layers: bigint[][] = [];

  constructor(height: number = MERKLE_TREE_HEIGHT) {
    this.height = height;
  }

  async initialize() {
    this.zeros = [ZERO_VALUE];
    for (let i = 1; i <= this.height; i++) {
      this.zeros[i] = await poseidonHash([this.zeros[i - 1], this.zeros[i - 1]]);
    }
    this.layers = Array.from({ length: this.height + 1 }, () => []);
  }

  async insert(leaf: bigint): Promise<number> {
    const index = this.layers[0].length;
    let currentValue = leaf;
    this.layers[0].push(currentValue);
    let currentIndex = index;

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
    return this.layers[this.height]?.[0] ?? this.zeros[this.height];
  }

  getProof(leafIndex: number) {
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < this.height; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
      pathElements.push(this.layers[level][siblingIndex] ?? this.zeros[level]);
      pathIndices.push(isLeft ? 0 : 1);
      currentIndex = Math.floor(currentIndex / 2);
    }
    return { root: this.getRoot(), pathElements, pathIndices };
  }
}

function formatProofForContract(proof: any, publicSignals: string[]) {
  return {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])] as [bigint, bigint],
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ] as [[bigint, bigint], [bigint, bigint]],
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])] as [bigint, bigint],
    pubSignals: publicSignals.map((s) => BigInt(s)) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
  };
}

async function main() {
  console.log("");
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║       GRIMSWAP - TIMING TEST                                   ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log("");

  const privateKey = process.env.PRIVATE_KEY as Hex;
  if (!privateKey) {
    console.error("ERROR: Set PRIVATE_KEY");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: unichainSepolia,
    transport: http("https://sepolia.unichain.org"),
  });
  const walletClient = createWalletClient({
    account,
    chain: unichainSepolia,
    transport: http("https://sepolia.unichain.org"),
  });

  console.log("Account:", account.address);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Balance:", formatEther(balance), "ETH");
  console.log("");

  const timings: { step: string; time: number }[] = [];
  let totalStart = Date.now();

  // ============================================
  // STEP 1: Initialize Poseidon
  // ============================================
  let start = Date.now();
  await initPoseidon();
  timings.push({ step: "1. Initialize Poseidon", time: Date.now() - start });

  // ============================================
  // STEP 2: Create Note
  // ============================================
  start = Date.now();
  const depositAmount = parseEther("0.001");
  const note = await createDepositNote(depositAmount);
  timings.push({ step: "2. Create deposit note", time: Date.now() - start });

  // ============================================
  // STEP 3: Deposit On-Chain
  // ============================================
  start = Date.now();
  const commitmentBytes = formatCommitment(note.commitment);

  const depositHash = await walletClient.writeContract({
    address: CONTRACTS.grimPool,
    abi: GRIM_POOL_ABI,
    functionName: "deposit",
    args: [commitmentBytes],
    value: depositAmount,
  });
  timings.push({ step: "3a. Submit deposit tx", time: Date.now() - start });

  start = Date.now();
  const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
  timings.push({ step: "3b. Wait for confirmation", time: Date.now() - start });
  console.log("Deposit TX:", depositHash);
  console.log("Gas used:", receipt.gasUsed.toString());
  console.log("");

  // ============================================
  // STEP 4: Build Merkle Tree
  // ============================================
  start = Date.now();
  const tree = new PoseidonMerkleTree(MERKLE_TREE_HEIGHT);
  await tree.initialize();
  await tree.insert(note.commitment);
  const merkleProof = tree.getProof(0);
  timings.push({ step: "4. Build Merkle tree + proof", time: Date.now() - start });

  // ============================================
  // STEP 5: Generate ZK Proof
  // ============================================
  const circuitsPath = path.resolve(__dirname, "../../grimswap-circuits");
  const wasmPath = path.join(circuitsPath, "build/privateSwap_js/privateSwap.wasm");
  const zkeyPath = path.join(circuitsPath, "setup/privateSwap_final.zkey");

  const recipientBigInt = BigInt(account.address).toString();
  const input = {
    merkleRoot: merkleProof.root.toString(),
    nullifierHash: note.nullifierHash.toString(),
    recipient: recipientBigInt,
    relayer: "0",
    relayerFee: "0",
    swapAmountOut: note.amount.toString(),
    secret: note.secret.toString(),
    nullifier: note.nullifier.toString(),
    depositAmount: note.amount.toString(),
    pathElements: merkleProof.pathElements.map((e) => e.toString()),
    pathIndices: merkleProof.pathIndices,
  };

  start = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  timings.push({ step: "5. Generate ZK proof", time: Date.now() - start });

  // ============================================
  // STEP 6: Verify On-Chain
  // ============================================
  start = Date.now();
  const contractProof = formatProofForContract(proof, publicSignals);
  const isValid = await publicClient.readContract({
    address: CONTRACTS.groth16Verifier,
    abi: GROTH16_VERIFIER_ABI,
    functionName: "verifyProof",
    args: [contractProof.pA, contractProof.pB, contractProof.pC, contractProof.pubSignals],
  });
  timings.push({ step: "6. On-chain verification", time: Date.now() - start });

  // ============================================
  // STEP 7: Encode Hook Data
  // ============================================
  start = Date.now();
  const hookData = encodeAbiParameters(
    parseAbiParameters("uint256[2], uint256[2][2], uint256[2], uint256[8]"),
    [contractProof.pA, contractProof.pB, contractProof.pC, contractProof.pubSignals]
  );
  timings.push({ step: "7. Encode hook data", time: Date.now() - start });

  const totalTime = Date.now() - totalStart;

  // ============================================
  // Results
  // ============================================
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║                    TIMING BREAKDOWN                            ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("┌────────────────────────────────────────┬──────────────┐");
  console.log("│ Step                                   │ Time         │");
  console.log("├────────────────────────────────────────┼──────────────┤");

  for (const t of timings) {
    const stepPadded = t.step.padEnd(38);
    const timePadded = `${t.time} ms`.padStart(12);
    console.log(`│ ${stepPadded} │ ${timePadded} │`);
  }

  console.log("├────────────────────────────────────────┼──────────────┤");
  console.log(`│ ${"TOTAL".padEnd(38)} │ ${`${totalTime} ms`.padStart(12)} │`);
  console.log("└────────────────────────────────────────┴──────────────┘");
  console.log("");

  // Calculate time without blockchain wait
  const offChainTime = timings
    .filter(t => !t.step.includes("confirmation") && !t.step.includes("Submit"))
    .reduce((sum, t) => sum + t.time, 0);

  console.log("Summary:");
  console.log(`  Total time: ${totalTime} ms (${(totalTime / 1000).toFixed(2)} seconds)`);
  console.log(`  Off-chain computation: ${offChainTime} ms`);
  console.log(`  Blockchain wait: ${totalTime - offChainTime} ms`);
  console.log("");
  console.log(`  ZK proof generation: ${timings.find(t => t.step.includes("ZK proof"))?.time} ms`);
  console.log(`  On-chain verification: ${timings.find(t => t.step.includes("On-chain"))?.time} ms`);
  console.log(`  Proof valid: ${isValid}`);
  console.log("");
  console.log("NOTE: Swap execution would add ~1-2 seconds for tx confirmation");
  console.log("");
}

main().catch(console.error);
