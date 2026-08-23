# Signito Base Contracts

This repository contains the Solidity source and release tooling for Signito on Base.

## Scope

* Standard Signito remains available for the standard pool flow.
* Private Execution is opt in and requires a complete privacy set before processing.
* Relayer funded decoy preparation never charges platform operating costs to user wallets.
* Queue processing applies the protocol fee configured in the deployed pool contract.

## Commands

Use `npm run typecheck`, `npm run compile`, and `npm run test` before any release action. Mainnet deploy and verification commands require explicit operator approval and private environment variables.

## Public release policy

Do not commit keys, deployment artifacts, cache files, generated contract bindings, or transaction evidence. Publish verified contract addresses only after confirmation on Base.
