# Spectre Protocol - Integration Tests

End-to-end integration tests for Spectre Protocol, demonstrating full private swaps using the SDK with on-chain contracts.

## Test Results

### Full Private Swap Test (SDK + Contracts)

**Date:** February 2, 2026
**Network:** Unichain Sepolia (Chain ID: 1301)
**Status:** ✅ ALL TESTS PASSED

#### Transaction Proof
- **TX Hash:** [`0x4d97dc1d984d6c128686abc5c142b735305bbbe6c5fce09baba37c8fe8039500`](https://unichain-sepolia.blockscout.com/tx/0x4d97dc1d984d6c128686abc5c142b735305bbbe6c5fce09baba37c8fe8039500)
- **Block:** 43114156
- **Gas Used:** 360,035

#### Swap Results
```
Token A spent:     10.0 tokens
Token B received:  9.77 tokens
Private Swaps:     1 → 2 (counter incremented)
```

#### Privacy Features Verified
| Feature | Status | Description |
|---------|--------|-------------|
| Ring Signature | ✅ | Sender hidden among 5 addresses (LSAG) |
| Key Image | ✅ | Recorded to prevent double-spend |
| Stealth Address | ✅ | Generated: `0x693767d55dd4cb73c183162872ca3879be7820a0` |
| ERC-5564 Announcement | ✅ | Emitted for recipient scanning |

#### Events Emitted
1. `PrivateSwapInitiated` - Ring signature verified
2. `Swap` - Uniswap v4 AMM swap executed
3. `Announcement` - ERC-5564 stealth address announced
4. `PrivateSwapCompleted` - Private swap finished
5. `Transfer` (x2) - Token A to pool, Token B to user

---

## Deployed Contracts (Unichain Sepolia)

| Contract | Address | Description |
|----------|---------|-------------|
| PoolManager | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` | Uniswap v4 Core |
| SpectreHook | `0xb51F08EA987e1ca926e6730aeA5Dd5aeb5E7C0C4` | Privacy hook (with mock verifier) |
| StealthRegistry | `0xA9e4ED4183b3B3cC364cF82dA7982D5ABE956307` | Stealth address generation |
| Announcer | `0x42013A72753F6EC28e27582D4cDb8425b44fd311` | ERC-5564 announcements |
| Token A (PTA) | `0x32cCA622f5Cd2b45a937C4E8536743C756187127` | Test token |
| Token B (PTB) | `0xE2AD3068aD183595152269a81eE72F44A176880c` | Test token |
| PoolTestHelper | `0x8D5Af9050D765a1B67785Ae4Cec595360E2A29c7` | Swap execution helper |

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

### Expected Output
```
╔════════════════════════════════════════════════════════════════╗
║     SPECTRE PROTOCOL - FULL PRIVATE SWAP TEST (SDK)            ║
╚════════════════════════════════════════════════════════════════╝

Network: Unichain Sepolia (Chain ID: 1301)
Account: 0x...

┌────────────────────────────────────────────────────────────────┐
│ STEP 1: Generate Stealth Keys (SDK)                           │
└────────────────────────────────────────────────────────────────┘
Generated stealth keys
  Meta-address: 0x03...

┌────────────────────────────────────────────────────────────────┐
│ STEP 2: Create Ring Members                                   │
└────────────────────────────────────────────────────────────────┘
Ring size: 5
  Signer: 0x... (hidden among decoys)

┌────────────────────────────────────────────────────────────────┐
│ STEP 4: Generate Ring Signature (SDK - Real LSAG)             │
└────────────────────────────────────────────────────────────────┘
Ring signature generated
  Signature size: 192 bytes
  Key image: 0x...

┌────────────────────────────────────────────────────────────────┐
│ STEP 8: EXECUTE PRIVATE SWAP                                  │
└────────────────────────────────────────────────────────────────┘
Transaction confirmed!
  Status: SUCCESS

╔════════════════════════════════════════════════════════════════╗
║                 PRIVATE SWAP SUCCESSFUL!                       ║
╚════════════════════════════════════════════════════════════════╝
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SPECTRE PROTOCOL                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  Test Script│───▶│  SDK        │───▶│  Smart Contracts    │ │
│  │  (This Repo)│    │  (spectre-  │    │  (spectre-          │ │
│  │             │    │   sdk)      │    │   contracts)        │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
│                                                                 │
│  Test Functions:                    Contracts:                  │
│  • generateStealthKeys()            • SpectreHook (Uni v4)     │
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
4. **Contract** SpectreHook.beforeSwap() verifies ring signature
5. **Contract** Uniswap v4 executes the AMM swap
6. **Contract** SpectreHook.afterSwap() generates stealth address
7. **Contract** Announcer emits ERC-5564 announcement
8. **Recipient** scans announcements to find incoming transfers

---

## SDK Usage Example

```typescript
import {
  generateStealthKeys,
  generateRingSignature,
  encodeHookData,
} from '@spectre-protocol/sdk';

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
```

---

## Related Repositories

- **[spectre-sdk](https://github.com/spectre-protocol/spectre-sdk)** - TypeScript SDK for privacy primitives
- **[spectre-contracts](https://github.com/spectre-protocol/spectre-contracts)** - Solidity smart contracts

---

## License

MIT
