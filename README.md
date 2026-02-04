# GrimSwap Integration Tests

End-to-end integration tests for GrimSwap ZK private swaps on Uniswap v4.

## Test Results

### Full ZK Private Swap with Relayer - FULL PRIVACY

**Date:** February 5, 2026
**Network:** Unichain Sepolia (Chain ID: 1301)
**Status:** SUCCESS

| Test | TX Hash | Gas Used |
|------|---------|----------|
| **ZK Swap + Relayer** | [`0x06bd555a2819c3ed0cccbf0da7822b4cf3940f2fb2dcc25b72c77a9d87ef4934`](https://unichain-sepolia.blockscout.com/tx/0x06bd555a2819c3ed0cccbf0da7822b4cf3940f2fb2dcc25b72c77a9d87ef4934) | **1,127,146** |

#### Privacy Achieved
- **Sender**: Hidden by ZK proof (proves deposit without revealing which one)
- **Recipient**: Hidden by stealth address
- **Gas Payer**: Hidden by relayer (user wallet never touches chain)

#### Timing
| Step | Time |
|------|------|
| Create deposit note | 1 ms |
| Build Merkle tree | 5 ms |
| Add root to GrimPool | ~13s |
| **Generate ZK proof** | **914 ms** |
| Relayer submission | ~5s |
| **TOTAL** | **~23 seconds** |

---

### Full ZK Private Swap (Direct)

**Date:** February 4, 2026
**Status:** SUCCESS

| Test | TX Hash | Gas Used |
|------|---------|----------|
| **Full ZK Private Swap** | [`0xdc0532d5454ac670f08fc5b45cf55c136d755c7a4f478fe3c93024184a9871c1`](https://unichain-sepolia.blockscout.com/tx/0xdc0532d5454ac670f08fc5b45cf55c136d755c7a4f478fe3c93024184a9871c1) | **828,010** |

---

## Deployed Contracts (Unichain Sepolia)

| Contract | Address | Description |
|----------|---------|-------------|
| GrimPool | [`0xad079eAC28499c4eeA5C02D2DE1C81E56b9AA090`](https://unichain-sepolia.blockscout.com/address/0xad079eAC28499c4eeA5C02D2DE1C81E56b9AA090) | Deposit pool with Merkle tree |
| Groth16Verifier | [`0xF7D14b744935cE34a210D7513471a8E6d6e696a0`](https://unichain-sepolia.blockscout.com/address/0xF7D14b744935cE34a210D7513471a8E6d6e696a0) | ZK proof verification |
| GrimSwapZK | [`0x95ED348fCC232FB040e46c77C60308517e4BC0C4`](https://unichain-sepolia.blockscout.com/address/0x95ED348fCC232FB040e46c77C60308517e4BC0C4) | Uniswap v4 hook |
| PoolHelper | [`0x26a669aC1e5343a50260490eC0C1be21f9818b17`](https://unichain-sepolia.blockscout.com/address/0x26a669aC1e5343a50260490eC0C1be21f9818b17) | Swap router |

---

## Running Tests

### Prerequisites
- Node.js 18+
- Private key with Unichain Sepolia ETH
- For relayer test: Running relayer service

### Install
```bash
npm install
```

### Test Scripts

```bash
# Full ZK Private Swap (direct submission)
PRIVATE_KEY=0x... npm test

# Full ZK Private Swap with Relayer (full privacy)
# First start relayer: cd ../grimswap-relayer && npm run dev
PRIVATE_KEY=0x... npm run test:relayer
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    GrimSwap ZK Flow                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. DEPOSIT                                                    │
│   User ──deposit(commitment)──► GrimPool                        │
│          commitment = Poseidon(nullifier, secret, amount)       │
│                                    │                            │
│                                    ▼                            │
│                              Merkle Tree                        │
│                         (20 levels, ~1M deposits)               │
│                                                                 │
│   2. PRIVATE SWAP                                               │
│   User ──generates proof──► ZK Proof (~1 second)                │
│          (proves deposit membership without revealing which)    │
│                                    │                            │
│                                    ▼                            │
│   Relayer ──submits tx──► GrimSwapZK ──verifyProof──► Verifier  │
│          (hides gas payer)    (v4 hook)                         │
│                                    │                            │
│                                    ▼                            │
│                              Uniswap v4                         │
│                                    │                            │
│                                    ▼                            │
│   Stealth Address ◄──tokens───────┘                             │
│          (recipient hidden)                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Privacy Guarantees

| Feature | Status | Description |
|---------|--------|-------------|
| Sender Privacy | ✅ | ZK proof hides which deposit is being spent |
| Recipient Privacy | ✅ | Stealth address unlinkable to user |
| Gas Payer Privacy | ✅ | Relayer submits tx on behalf of user |
| Double-spend Prevention | ✅ | Nullifier system prevents reuse |
| Anonymity Set | ~1M | All depositors in Merkle tree |

---

## Related Repositories

- **[grimswap-contracts](../grimswap-contracts)** - Solidity smart contracts
- **[grimswap-circuits](../grimswap-circuits)** - Circom ZK circuits and SDK
- **[grimswap-relayer](../grimswap-relayer)** - Transaction relay service

---

## License

MIT
