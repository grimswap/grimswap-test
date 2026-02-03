# GrimSwap - Integration Tests

End-to-end integration tests for GrimSwap privacy-preserving swaps on Uniswap v4.

## Test Results Summary

### ZK-SNARK Private Swap (Groth16) - RECOMMENDED

**Date:** February 3, 2026
**Network:** Unichain Sepolia (Chain ID: 1301)
**Status:** ALL TESTS PASSED

#### Timing Breakdown

| Step | Time |
|------|------|
| Initialize Poseidon | 215 ms |
| Create deposit note | 3 ms |
| Submit deposit tx | 3,601 ms |
| Wait for confirmation | 282 ms |
| Build Merkle tree + proof | 5 ms |
| **Generate ZK proof** | **956 ms** |
| On-chain verification | 293 ms |
| Encode hook data | 0 ms |
| **TOTAL** | **5,355 ms (~5.4 seconds)** |

#### Transaction Proofs

| Test | TX Hash | Gas Used |
|------|---------|----------|
| Deposit to GrimPool | [`0x42e735ac8a4ab9957d5c5d6e5afae9c604b1258d21e894252ab4957e17af4878`](https://unichain-sepolia.blockscout.com/tx/0x42e735ac8a4ab9957d5c5d6e5afae9c604b1258d21e894252ab4957e17af4878) | 219,515 |
| Full Swap Deposit | [`0x93ac2a94fe8b6164a2ad9ec8d1be3c4e3d22547d8d221ef0f581f251d20ab90d`](https://unichain-sepolia.blockscout.com/tx/0x93ac2a94fe8b6164a2ad9ec8d1be3c4e3d22547d8d221ef0f581f251d20ab90d) | 224,518 |

#### Privacy Features Verified

| Feature | Status | Description |
|---------|--------|-------------|
| ZK Proof Generation | PASS | Groth16 proof in ~1 second |
| On-chain Verification | PASS | Proof verified by Groth16Verifier |
| Poseidon Commitment | PASS | ZK-friendly hash for deposits |
| Merkle Tree | PASS | 20 levels (supports ~1M deposits) |
| Nullifier | PASS | Prevents double-spend |
| Hook Data Encoding | PASS | 1,026 bytes proof for swap |

---

### Ring Signature Private Swap (Legacy)

**Date:** February 2, 2026
**Status:** PRODUCTION VERIFIED

#### Transaction Proof
- **TX Hash:** [`0x1856c612da4362dc69b34d808359ab709d623d157cc83019f88b98d0ca9260a7`](https://unichain-sepolia.blockscout.com/tx/0x1856c612da4362dc69b34d808359ab709d623d157cc83019f88b98d0ca9260a7)
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

---

## Deployed Contracts (Unichain Sepolia)

### ZK Contracts (Recommended)

| Contract | Address | Description |
|----------|---------|-------------|
| GrimPool | [`0x0102Ba64Eefdbf362E402B9dCe0Cf9edfab611f5`](https://unichain-sepolia.blockscout.com/address/0x0102Ba64Eefdbf362E402B9dCe0Cf9edfab611f5) | Deposit pool with Merkle tree |
| Groth16Verifier | [`0x2AAaCece42E8ec7C6066D547C81a9e7cF09dBaeA`](https://unichain-sepolia.blockscout.com/address/0x2AAaCece42E8ec7C6066D547C81a9e7cF09dBaeA) | ZK proof verification |
| GrimSwapZK | [`0x5a01290281688BC94cA0e0EA9b3Ea7E7f98d00c4`](https://unichain-sepolia.blockscout.com/address/0x5a01290281688BC94cA0e0EA9b3Ea7E7f98d00c4) | Uniswap v4 hook (ZK) |

### Ring Signature Contracts (Legacy)

| Contract | Address | Description |
|----------|---------|-------------|
| GrimHook | [`0xA4D8EcabC2597271DDd436757b6349Ef412B80c4`](https://unichain-sepolia.blockscout.com/address/0xA4D8EcabC2597271DDd436757b6349Ef412B80c4) | Uniswap v4 hook (Ring Sig) |
| StealthRegistry | [`0xA9e4ED4183b3B3cC364cF82dA7982D5ABE956307`](https://unichain-sepolia.blockscout.com/address/0xA9e4ED4183b3B3cC364cF82dA7982D5ABE956307) | Stealth address generation |
| Announcer | [`0x42013A72753F6EC28e27582D4cDb8425b44fd311`](https://unichain-sepolia.blockscout.com/address/0x42013A72753F6EC28e27582D4cDb8425b44fd311) | ERC-5564 announcements |

### Shared Infrastructure

| Contract | Address |
|----------|---------|
| PoolManager | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` |

---

## Running Tests

### Prerequisites
- Node.js 18+
- Private key with Unichain Sepolia ETH

### Install Dependencies
```bash
npm install
```

### Available Test Scripts

```bash
# ZK Proof Tests (Recommended)
npm run test:zk              # Local ZK proof simulation
npm run test:zk:onchain      # On-chain ZK proof verification
npm run test:fullswap        # Full private swap preparation (ZK)
npm run test:timing          # Detailed timing breakdown

# Hook Deployment
npm run deploy:hook          # Mine and deploy GrimSwapZK hook

# Ring Signature Tests (Legacy)
npm run test:swap            # Full ring signature swap
```

### Run ZK Tests

```bash
# Set private key
export PRIVATE_KEY=0x...

# Run timing test
npm run test:timing
```

### Expected Output (Timing Test)

```
╔════════════════════════════════════════════════════════════════╗
║       GRIMSWAP - TIMING TEST                                   ║
╚════════════════════════════════════════════════════════════════╝

┌────────────────────────────────────────┬──────────────┐
│ Step                                   │ Time         │
├────────────────────────────────────────┼──────────────┤
│ 1. Initialize Poseidon                 │       215 ms │
│ 2. Create deposit note                 │         3 ms │
│ 3a. Submit deposit tx                  │      3601 ms │
│ 3b. Wait for confirmation              │       282 ms │
│ 4. Build Merkle tree + proof           │         5 ms │
│ 5. Generate ZK proof                   │       956 ms │
│ 6. On-chain verification               │       293 ms │
│ 7. Encode hook data                    │         0 ms │
├────────────────────────────────────────┼──────────────┤
│ TOTAL                                  │      5355 ms │
└────────────────────────────────────────┴──────────────┘

Summary:
  Total time: 5355 ms (5.36 seconds)
  Off-chain computation: 1472 ms
  Blockchain wait: 3883 ms

  ZK proof generation: 956 ms
  On-chain verification: 293 ms
  Proof valid: true
```

---

## Architecture Comparison

### ZK-SNARK (Groth16) - Recommended

```
┌─────────────────────────────────────────────────────────────────┐
│                    GrimSwap ZK Flow                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. DEPOSIT                                                    │
│   User ──deposit(commitment)──► GrimPool                       │
│          (commitment = Poseidon(nullifier, secret, amount))    │
│                                    │                            │
│                                    ▼                            │
│                              Merkle Tree                        │
│                         (20 levels, ~1M deposits)               │
│                                                                 │
│   2. PRIVATE SWAP                                               │
│   User ──generates proof──► ZK Proof (~1 second)               │
│          (proves: I deposited, without revealing which one)    │
│                                    │                            │
│                                    ▼                            │
│   Relayer ──submits tx──► GrimSwapZK ──verifyProof──► Verifier │
│          (hides gas payer)    (v4 hook)                        │
│                                    │                            │
│                                    ▼                            │
│                              Uniswap v4                         │
│                                    │                            │
│                                    ▼                            │
│   Stealth Address ◄──tokens───────┘                            │
│          (recipient hidden)                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Advantages:**
- Unlimited anonymity set (ALL depositors)
- Lower gas cost (~250k vs ~400k)
- Faster verification (~1 second)
- Proven cryptography (Tornado Cash/Zcash)

### Ring Signatures (Legacy)

```
┌─────────────────────────────────────────────────────────────────┐
│                  GrimSwap Ring Signature Flow                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   User ──creates LSAG signature──► Ring Signature              │
│          (hides among 5-16 decoys)                             │
│                                    │                            │
│                                    ▼                            │
│   Relayer ──submits tx──► GrimHook ──verifyRing──► RingVerifier│
│                              (v4 hook)                         │
│                                    │                            │
│                                    ▼                            │
│                              Uniswap v4                         │
│                                    │                            │
│                                    ▼                            │
│   Stealth Address ◄──tokens───────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Advantages:**
- No trusted setup required
- Simpler cryptography

---

## Privacy Guarantees

| Feature | ZK-SNARK | Ring Signature |
|---------|----------|----------------|
| Anonymity Set | All depositors (~1M) | Ring members (5-16) |
| Sender Privacy | ✅ | ✅ |
| Recipient Privacy | ✅ (stealth address) | ✅ (stealth address) |
| Gas Payer Privacy | ✅ (relayer) | ✅ (relayer) |
| Double-spend Prevention | ✅ (nullifier) | ✅ (key image) |
| Gas Cost | ~250k | ~400k |
| Proof Time | ~1 second | ~100ms |

---

## Related Repositories

- **[grimswap-contracts](../grimswap-contracts)** - Solidity smart contracts
- **[grimswap-circuits](../grimswap-circuits)** - Circom ZK circuits and SDK
- **[grimswap-relayer](../grimswap-relayer)** - Transaction relay service

---

## License

MIT
