# Signito Base Chain Contracts

Smart contracts powering the Signito privacy protocol on Base mainnet.

## Deployed Addresses (Base Mainnet)

| Contract | Address |
|---|---|
| ShieldedETH (sETH) | `0x78decA117eC6DAD3384E7a574F300edef5434688` |
| SignitoPool v2.1.0 | `0x949AFBF896b161b5d1E40FD77a4d32D0e427685d` |
| Relayer EOA | `0xf70494e69aE7090dB21179d2412D76566959B43c` |

Both contracts source-verified on [BaseScan](https://basescan.org/address/0x949AFBF896b161b5d1E40FD77a4d32D0e427685d#code).

## Contracts

### ShieldedETH (sETH)
Non-transferable ERC-20 backed 1:1 by ETH in SignitoPool. Only the pool can mint or burn. Includes `version()` returning `"1.0.0"`.

### SignitoPool v2.1.0
Privacy pool for ETH on Base. Implements shield, shieldWithDecoys, burnAndQueue, processQueue (0.15% relayer fee), refreshOts, batchAdminMint, mintAirsign, claimAirsign. Includes `version()` returning `"2.1.0"`.

## Privacy Model

shield() mints sETH to both stokenAddress and msg.sender (user wallet). Total burn set: 22 accounts (stokenAddress + user wallet + 20 decoys). burnAndQueue has no stokenAddress param -- the shuffled array is passed and the contract identifies the real account via OTS hash match. processQueue is a separate transaction with zero accounts in common with burnAndQueue. Both relayer transactions submitted via Flashbots private mempool.

## OTS Chain

H0 = PBKDF2(vaultCode, walletAddress, 100000 iters, SHA-256) [browser-side]
H_n = keccak256(H_{n-1})
Chain tip stored in userStates[stokenAddress].currentOtsHash.
To prove ownership: reveal H_{n-1}, contract checks keccak256(preimage) == currentOtsHash.

## License

MIT

https://signito.org
