# FLOP-Agent

Public independent testnet agent. Status: pre-activation, monitoring only.

Official sources: https://docs.flop.network/operators and https://faucet.flop.network/ and https://x.com/flop_labs

## Release gates
- Verify official testnet network identity, pinned SDK release, inference endpoint, scoring activation and eligibility.
- Verify existing identity and supported signing scheme; never regenerate automatically or commit secrets.
- Verify faucet cooldown, request idempotency and settlement receipts. Never blindly retry writes.
- Default to disabled spending; only genuine eligible inference, testnet only, no multi-identity farming.
- Add durable journal, tests and owner-controlled enable switch before any live execution.

ChatGPT hourly monitoring is separate from execution. No live farming or reward guarantees.
