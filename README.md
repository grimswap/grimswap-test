# GrimSwap Test

End-to-end test scripts for the GrimSwap privacy system.

## V3 Multi-Token Tests

### ETH → USDC Swap
`src/ethToUsdcSwap.ts` - Deposit ETH, receive USDC at stealth address

### USDC → ETH Swap
`src/usdcToEthSwap.ts` - Deposit USDC, receive ETH at stealth address

## Test Flow

1. Create deposit note (Poseidon commitment) - local
2. Deposit ETH or USDC to GrimPoolMultiToken - on-chain
3. Build Poseidon Merkle tree - local
4. Add Merkle root to pool - on-chain (testnet only)
5. Generate stealth address - local
6. Generate Groth16 ZK proof - local (snarkjs)
7. Send proof to relayer → GrimSwapRouterV2 → Uniswap v4 swap
8. Verify privacy + token receipt at stealth address

## Running

```bash
# Start relayer first
cd ../grimswap-relayer && npm run dev

# Run ETH → USDC test
PRIVATE_KEY=0x... npx ts-node --esm src/ethToUsdcSwap.ts

# Run USDC → ETH test
PRIVATE_KEY=0x... npx ts-node --esm src/usdcToEthSwap.ts
```

## Contract Addresses (V3 - Unichain Sepolia)

| Contract | Address |
|----------|---------|
| GrimPoolMultiToken | `0x6777cfe2A72669dA5a8087181e42CA3dB29e7710` |
| GrimSwapZK (Hook) | `0x6AFe3f3B81d6a22948800C924b2e9031e76E00C4` |
| GrimSwapRouterV2 | `0x5EE78E89A0d5B4669b05aC8B7D7ea054a08f555f` |
| Groth16Verifier | `0xF7D14b744935cE34a210D7513471a8E6d6e696a0` |
| PoolManager | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` |
| USDC | `0x31d0220469e10c4E71834a79b1f276d740d3768F` |

## Pool Configuration (V3)

```typescript
const POOL_KEY = {
  currency0: "0x0000000000000000000000000000000000000000", // ETH
  currency1: "0x31d0220469e10c4E71834a79b1f276d740d3768F", // USDC
  fee: 500,        // 0.05%
  tickSpacing: 10,
  hooks: "0x6AFe3f3B81d6a22948800C924b2e9031e76E00C4",
};
```

## Swap Directions

| Direction | zeroForOne | inputToken |
|-----------|------------|------------|
| ETH → USDC | `true` | (not set) |
| USDC → ETH | `false` | USDC address |

## Test Results (V3)

### ETH → USDC
- TX: `0x22b313f89d9a706e79e34dfcaa24c411fcd10335af46995ed6677c85562b65be`
- Input: 0.001 ETH → Output: 224.36 USDC at stealth address
- Gas: 901,815
- All privacy guarantees verified

### USDC → ETH
- TX: `0xbf064fbc7344be22b3ad1bb52181fb0223602c334b74236eb70b9215d20e5120`
- Input: 1 USDC → Output: ~0.0005 ETH at stealth address
- Gas: 566,146
- All privacy guarantees verified

## Other Scripts

| Script | Description |
|--------|-------------|
| `checkBalances.ts` | Check ETH/token balances |
| `fullZKSwap.ts` | Legacy ETH-only swap test |
| `fullZKSwapWithRelayer.ts` | Legacy relayer test |

## License

MIT
