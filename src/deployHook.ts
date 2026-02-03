/**
 * Deploy GrimSwapZK Hook with CREATE2 address mining
 *
 * This script:
 * 1. Mines for a valid hook address (correct flag bits)
 * 2. Deploys GrimSwapZK at that address
 * 3. Authorizes it in GrimPool
 *
 * Run: PRIVATE_KEY=0x... npx tsx src/deployHook.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  encodePacked,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
  type Address,
  concat,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as fs from "fs";
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

// Addresses
const POOL_MANAGER = "0x00B036B58a818B1BC34d502D3fE730Db729e62AC" as Address;
const GRIM_POOL = "0x0102Ba64Eefdbf362E402B9dCe0Cf9edfab611f5" as Address;
const GROTH16_VERIFIER = "0x2AAaCece42E8ec7C6066D547C81a9e7cF09dBaeA" as Address;

// Hook flags (from Hooks.sol)
const BEFORE_SWAP_FLAG = 1n << 7n;           // 0x0080
const AFTER_SWAP_FLAG = 1n << 6n;            // 0x0040
const AFTER_SWAP_RETURNS_DELTA_FLAG = 1n << 2n; // 0x0004
const FLAG_MASK = 0x3FFFn; // Bottom 14 bits

// Required flags for GrimSwapZK
const REQUIRED_FLAGS = BEFORE_SWAP_FLAG | AFTER_SWAP_FLAG | AFTER_SWAP_RETURNS_DELTA_FLAG;

async function main() {
  console.log("");
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║       GRIMSWAP - HOOK DEPLOYMENT                               ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log("");

  const privateKey = process.env.PRIVATE_KEY as Hex;
  if (!privateKey) {
    console.error("ERROR: Set PRIVATE_KEY environment variable");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log("Network: Unichain Sepolia (Chain ID: 1301)");
  console.log("Deployer:", account.address);
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

  console.log("Configuration:");
  console.log("  PoolManager:", POOL_MANAGER);
  console.log("  GrimPool:", GRIM_POOL);
  console.log("  Groth16Verifier:", GROTH16_VERIFIER);
  console.log("  Required flags:", "0x" + REQUIRED_FLAGS.toString(16));
  console.log("");

  // Read GrimSwapZK bytecode
  const contractsPath = path.resolve(__dirname, "../../grimswap-contracts");
  const artifactPath = path.join(contractsPath, "out/GrimSwapZK.sol/GrimSwapZK.json");

  if (!fs.existsSync(artifactPath)) {
    console.error("ERROR: GrimSwapZK artifact not found. Run 'forge build' first.");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const creationCode = artifact.bytecode.object as Hex;

  // Encode constructor args
  const constructorArgs = encodeAbiParameters(
    parseAbiParameters("address, address, address"),
    [POOL_MANAGER, GROTH16_VERIFIER, GRIM_POOL]
  );

  const initCode = concat([creationCode, constructorArgs]);
  const initCodeHash = keccak256(initCode);

  console.log("┌────────────────────────────────────────────────────────────────┐");
  console.log("│ STEP 1: Mining for valid hook address                         │");
  console.log("└────────────────────────────────────────────────────────────────┘");

  const flags = REQUIRED_FLAGS & FLAG_MASK;
  console.log("  Target flags:", "0x" + flags.toString(16).padStart(4, "0"));
  console.log("  Mining...");

  let hookAddress: Address | null = null;
  let salt: bigint = 0n;
  const MAX_ITERATIONS = 500_000n;

  // Forge uses deterministic deployer for CREATE2 in scripts
  // When using new Contract{salt: salt}() in broadcast mode
  const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as Address;
  console.log("  CREATE2 Deployer:", CREATE2_DEPLOYER);

  const startTime = Date.now();
  for (salt = 0n; salt < MAX_ITERATIONS; salt++) {
    const saltHex = ("0x" + salt.toString(16).padStart(64, "0")) as Hex;
    const addr = computeCreate2Address(CREATE2_DEPLOYER, saltHex, initCodeHash);

    if ((BigInt(addr) & FLAG_MASK) === flags) {
      // Check address has no code
      const code = await publicClient.getCode({ address: addr });
      if (!code || code === "0x") {
        hookAddress = addr;
        break;
      }
    }

    if (salt % 10000n === 0n && salt > 0n) {
      console.log(`  Checked ${salt} salts...`);
    }
  }

  const mineTime = Date.now() - startTime;

  if (!hookAddress) {
    console.error("ERROR: Could not find valid salt after", MAX_ITERATIONS.toString(), "iterations");
    process.exit(1);
  }

  console.log("");
  console.log("  Found valid hook address!");
  console.log("  Address:", hookAddress);
  console.log("  Salt:", salt.toString());
  console.log("  Mining time:", mineTime, "ms");
  console.log("  Address flags:", "0x" + (BigInt(hookAddress) & FLAG_MASK).toString(16).padStart(4, "0"));
  console.log("");

  // Deploy the hook
  console.log("┌────────────────────────────────────────────────────────────────┐");
  console.log("│ STEP 2: Deploy GrimSwapZK                                     │");
  console.log("└────────────────────────────────────────────────────────────────┘");

  // We need to deploy using CREATE2 - this requires sending initCode with salt
  // Using raw transaction to CREATE2_DEPLOYER
  const saltHex = ("0x" + salt.toString(16).padStart(64, "0")) as Hex;

  console.log("  Deploying with CREATE2...");
  console.log("  Init code length:", initCode.length);

  // Deploy via direct CREATE2 (using forge script is more reliable)
  console.log("");
  console.log("  To deploy, run this forge command:");
  console.log("");
  console.log(`  cd ${contractsPath} && \\`);
  console.log(`    forge script script/DeployGrimSwapZK.s.sol:DeployGrimSwapZK \\`);
  console.log(`    --rpc-url https://sepolia.unichain.org \\`);
  console.log(`    --broadcast \\`);
  console.log(`    --private-key $PRIVATE_KEY`);
  console.log("");

  // Save the mined values for the forge script
  const mineResult = {
    hookAddress,
    salt: salt.toString(),
    saltHex,
    flags: "0x" + flags.toString(16),
    timestamp: new Date().toISOString(),
  };

  const outputPath = path.join(__dirname, "../../grimswap-contracts/hook-mine-result.json");
  fs.writeFileSync(outputPath, JSON.stringify(mineResult, null, 2));
  console.log("  Saved mining result to:", outputPath);
  console.log("");

  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║          HOOK ADDRESS MINED SUCCESSFULLY                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Hook address:", hookAddress);
  console.log("Salt:", salt.toString());
  console.log("");
}

function computeCreate2Address(deployer: Address, salt: Hex, initCodeHash: Hex): Address {
  const data = encodePacked(
    ["bytes1", "address", "bytes32", "bytes32"],
    ["0xff", deployer, salt as `0x${string}`, initCodeHash]
  );
  const hash = keccak256(data);
  return ("0x" + hash.slice(-40)) as Address;
}

main().catch(console.error);
