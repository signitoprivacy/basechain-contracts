# Signito Base Chain Contracts

Smart contracts powering the Signito privacy protocol on Base mainnet.

## Deployed Addresses (Base Mainnet)

| Contract | Address |
|---|---|
| ShieldedETH (sETH) | `0x8C7Eeb11C7c8D58b0d12A772B146313aaAAEaBdb` |
| SignitoPool | `0xDD6A1A34eD412A439A2268863549C884C15D40C0` |
| Relayer EOA | `0xf70494e69aE7090dB21179d2412D76566959B43c` |

Both contracts verified MIT on [BaseScan](https://basescan.org/address/0x8C7Eeb11C7c8D58b0d12A772B146313aaAAEaBdb#code).

## Contracts

### ShieldedETH (sETH)
Non-transferable ERC-20 backed 1:1 by ETH in SignitoPool. Only the pool can mint or burn. Includes `version()` returning `"1.0.0"`.

### SignitoPool
Privacy pool for ETH on Base. Implements shield, burnAndQueue, processQueue, batchAdminMint. Includes `version()` returning `"1.0.0"`.

## Privacy Model

shield() mints sETH to both stokenAddress and msg.sender (user wallet). Total burn set: 22 accounts (stokenAddress + user wallet + 20 decoys). burnAndQueue has no stokenAddress param -- the shuffled array is passed and the contract identifies the real account via OTS hash match. processQueue is a separate transaction with zero accounts in common with burnAndQueue.

## License

MIT

https://signito.org
