# Architecture

- `network.json` pins Testnet origins and genesis. The network adapter checks live block zero and faucet identity, followed by the finalized and tip runtime against the pinned SDK's compatibility list.
- `src/monitor.mjs` reads chain, faucet and gateway catalog data. An optional public key enables a finalized account lookup via the SDK. Gateway-advertised miners are catalog observations rather than on-chain miner qualification.
- `src/identity.mjs` imports an Ed25519 wallet seed, computes the SS58 and did:key encodings, and signs the SDK's D10 message. The CLI pins the authorized public key before signing.
- `src/faucet.mjs` stores the nonce before sending. Its SQLite journal survives restarts on a persistent volume. One directory lock serializes local commands. A timed-out request can resume only with the same nonce. Pending transactions require canonical finalized transfer evidence. A subsequent grant fails closed until a finalized compute spend verifier exists.
- GitHub Actions runs CI and read-only monitoring with no signing credentials or transaction permissions. Its run history and short-lived public status files provide diagnostics. Transaction state is stored in the local journal rather than workflow artifacts.
- `HALTED` suppresses network operations, `MONITOR_ONLY` is the default, `INTEGRATION_TEST` allows explicitly authorized local faucet testing, and `SCORED_ACTIVE` is blocked pending activation and settlement qualification.

A gateway ledger receipt has gateway semantics. To qualify spending, a future adapter needs an officially supported Testnet route, a bounded wallet or channel authorization, and a binding from the request to independently finalized compute spend. Catalog availability is insufficient evidence for any of those gates.
