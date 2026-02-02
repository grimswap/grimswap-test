# GrimSwap - Integration Tests

End-to-end integration tests for GrimSwap, demonstrating full private swaps using the SDK with on-chain contracts.

## Test Results

### Full Private Swap Test - PRODUCTION PRIVACY

**Date:** February 2, 2026
**Network:** Unichain Sepolia (Chain ID: 1301)
**Status:** PRODUCTION PRIVACY VERIFIED

#### Transaction Proof
- **TX Hash:** [`0x1856c612da4362dc69b34d808359ab709d623d157cc83019f88b98d0ca9260a7`](https://unichain-sepolia.blockscout.com/tx/0x1856c612da4362dc69b34d808359ab709d623d157cc83019f88b98d0ca9260a7)
- **Block:** 43115916
- **Gas Used:** 392,918

#### Privacy Verification
```
SENDER (public address):
  Token A balance: 996132 → 996122 (-10 spent)
  Token B balance: 997132 → 997132 (UNCHANGED!)

STEALTH ADDRESS (0xa7f9f1296f34e768200b2a56864117cd35d700a5):
  Token B balance: 0 → 9.77 (received from swap!)

>>> TOKENS ROUTED TO STEALTH ADDRESS - RECIPIENT PRIVACY VERIFIED <<<
```

#### Privacy Features Verified
| Feature | Status | Description |
|---------|--------|-------------|
| Ring Signature | PASS | Sender hidden among 5 addresses (LSAG) |
| Key Image | PASS | Recorded to prevent double-spend |
| Stealth Address | PASS | Generated: `0xa7f9f1296f34e768200b2a56864117cd35d700a5` |
| Token Routing | PASS | Output tokens sent to stealth, NOT sender |
| ERC-5564 Announcement | PASS | Emitted for recipient scanning |

#### Events Emitted
1. `PrivateSwapInitiated` - Ring signature verified
2. `Swap` - Uniswap v4 AMM swap executed
3. `Announcement` - ERC-5564 stealth address announced
4. `PrivateSwapCompleted` - Private swap finished
5. `Transfer` - Token A from sender to pool
6. `Transfer` - Token B from pool to STEALTH ADDRESS (not sender!)

---

## Deployed Contracts (Unichain Sepolia)

### Production Contracts (with stealth routing)
| Contract | Address | Description |
|----------|---------|-------------|
| PoolManager | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` | Uniswap v4 Core |
| GrimHook | `0xA4D8EcabC2597271DDd436757b6349Ef412B80c4` | Privacy hook (routes to stealth) |
| StealthRegistry | `0xA9e4ED4183b3B3cC364cF82dA7982D5ABE956307` | Stealth address generation |
| Announcer | `0x42013A72753F6EC28e27582D4cDb8425b44fd311` | ERC-5564 announcements |
| Token A (PTA) | `0x48bA64b5312AFDfE4Fc96d8F03010A0a86e17963` | Test token |
| Token B (PTB) | `0x96aC37889DfDcd4dA0C898a5c9FB9D17ceD60b1B` | Test token |
| PoolTestHelper | `0x26a669aC1e5343a50260490eC0C1be21f9818b17` | Swap execution (stealth routing) |

---

## Running Tests

### Prerequisites
1. Node.js 18+
2. Private key with Unichain Sepolia ETH
3. Pool must have liquidity (deploy via Foundry first)

### Install Dependencies
```bash
npm install
```

### Run Full Private Swap Test
```bash
PRIVATE_KEY=0x... npm run test:swap
```

**Note:** Each private key can only execute ONE private swap due to key image tracking (prevents double-spend). Use a fresh private key for each test run.

### Expected Output
```
╔════════════════════════════════════════════════════════════════╗
║       GRIMSWAP - FULL PRIVATE SWAP TEST (SDK)                  ║
╚════════════════════════════════════════════════════════════════╝

Network: Unichain Sepolia (Chain ID: 1301)
Account: 0x...

┌────────────────────────────────────────────────────────────────┐
│ STEP 1: Generate Stealth Keys (SDK)                           │
└────────────────────────────────────────────────────────────────┘
Generated stealth keys
  Meta-address: 0x03...

┌────────────────────────────────────────────────────────────────┐
│ STEP 4: Generate Ring Signature (SDK - Real LSAG)             │
└────────────────────────────────────────────────────────────────┘
Ring signature generated
  Signature size: 192 bytes
  Key image: 0x...

┌────────────────────────────────────────────────────────────────┐
│ STEP 9: Verify Stealth Address Routing                        │
└────────────────────────────────────────────────────────────────┘
Stealth Address (from event): 0x...
Amount sent to stealth: 9.77

Sender Balances:
  Token A after: 996122.0 (spent 10)
  Token B after: 997132.0 (unchanged = privacy working!)

Stealth Address Balance:
  Token B: 9.77

╔════════════════════════════════════════════════════════════════╗
║          PRIVATE SWAP SUCCESSFUL - FULL PRIVACY!              ║
╚════════════════════════════════════════════════════════════════╝
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          GRIMSWAP                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  Test Script│───▶│  SDK        │───▶│  Smart Contracts    │ │
│  │  (This Repo)│    │  (grimswap- │    │  (grimswap-         │ │
│  │             │    │   sdk)      │    │   contracts)        │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
│                                                                 │
│  Test Functions:                    Contracts:                  │
│  • generateStealthKeys()            • GrimHook (Uni v4)        │
│  • generateRingSignature()          • RingVerifier (LSAG)      │
│  • encodeHookData()                 • StealthRegistry          │
│  • Execute swap via viem            • Announcer (ERC-5564)     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Privacy Flow
1. **SDK** generates stealth keys for recipient
2. **SDK** creates LSAG ring signature (hides sender among decoys)
3. **SDK** encodes hook data with signature + stealth meta-address
4. **Contract** GrimHook.beforeSwap() verifies ring signature
5. **Contract** Uniswap v4 executes the AMM swap
6. **Contract** GrimHook.afterSwap() generates stealth address
7. **Contract** PoolTestHelper routes output tokens to stealth address
8. **Contract** Announcer emits ERC-5564 announcement
9. **Recipient** scans announcements to find incoming transfers

### What Makes It Private?

**Sender Privacy (Ring Signatures):**
- Sender proves membership in a group without revealing which member they are
- LSAG signatures with 5-10 decoy addresses
- Key images prevent double-spending without revealing identity

**Recipient Privacy (Stealth Addresses):**
- One-time addresses generated for each swap
- Output tokens sent to stealth address, NOT sender's public address
- Sender's token balance unchanged after swap
- Only recipient can derive private key to spend from stealth address

---

## SDK Usage Example

```typescript
import {
  generateStealthKeys,
  generateRingSignature,
  encodeHookData,
} from '@grimswap/sdk';

// 1. Generate recipient's stealth keys
const recipientKeys = generateStealthKeys();

// 2. Create ring signature (hides sender)
const { signature, keyImage } = generateRingSignature({
  message: swapMessageHash,
  privateKey: userPrivateKey,
  publicKeys: ringMembers,  // 5-10 addresses
  signerIndex: 0,
});

// 3. Encode hook data
const hookData = encodeHookData({
  ringSignature: signature,
  keyImage,
  ringMembers,
  stealthMetaAddress: recipientKeys.stealthMetaAddress,
});

// 4. Execute swap with hookData via Uniswap v4
// Output tokens automatically routed to stealth address!
```

---

## Related Repositories

- **[grimswap-sdk](https://github.com/grimswap/grimswap-sdk)** - TypeScript SDK for privacy primitives
- **[grimswap-contracts](https://github.com/grimswap/grimswap-contracts)** - Solidity smart contracts

---

## License

MIT
