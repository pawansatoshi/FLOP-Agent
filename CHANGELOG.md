# Changelog

## 0.1.0 · 2026-11-26

- Added a pinned SDK, live Testnet chain and runtime verification, faucet and model catalog status, and a mobile status page.
- Added offline Ed25519 identity setup, signed faucet integration for explicitly authorized local tests, persistent reconciliation, and finalized transfer verification.
- Added a read-only GitHub heartbeat, CI, and owner operation documentation.
- Kept inference purchasing and scored execution disabled pending Testnet route and settlement qualification.
- Expanded the production dashboard with mobile status cards, activity charts, GitHub run history, owner-only workflow controls, wallet/faucet fields, and catalog-listed model/miner counts without implying miner reachability.
- Switched chain verification to the genesis-pinned SDK WebSocket with a bounded fallback to allowlisted idempotent HTTP reads when the WebSocket transport is unavailable. CI and the latest push heartbeat pass; a timer-triggered run is still being verified.
- Confirmed the official Testnet gateway catalog is reachable, but no payable inference route is verified for this agent. Scoring remains disabled.
