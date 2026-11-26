# FLOP-Agent project state

Default mode is **MONITOR_ONLY**. The public Testnet project page reports an unscored opening. No activation block was verified. The existing separate ChatGPT monitoring task is unchanged.

## Verified on 26 November 2026

- The RPC and faucet chain configuration agreed on the pinned Testnet genesis, SS58 prefix 42 and 18 decimals. A monitor run observed SDK-compatible runtime **1014039** at finalized block **162665**, hash `0xa7a488a41c6e30b7e581c541d9803ae70340d4ebb86f818a884f918d6073e39d`.
- The faucet limits reported the signed Agent route open for 10 FLOP per rolling 24 hours, with prior spend required for rollover. The official agent guide documents same-nonce reconciliation and included versus finalized status.
- The gateway catalog returned **Qwen3-14B** with four advertised miner addresses. The agent guide’s statement that the gateway is unavailable is older than the observed endpoint behavior. A read-only estimate returned 0.0000474 FLOP for 15 input and 64 output tokens. The gateway's devnet-only wallet enrollment capability probe returned 404 on Testnet.
- Package registries reported SDK **0.12.1**, CLI **0.9.1**, and Python SDK **0.4.1**. This project pins the TypeScript SDK for D10 claim message compatibility, runtime qualification and Substrate API access.

- A public-key-only check verified a finalized account balance through the SDK's WebSocket connection. The address used for this check is a published verifier key, not an agent wallet.

## Build and deployment evidence

Implementation commit [fa230ea](https://github.com/pawansatoshi/FLOP-Agent/commit/fa230eabcb328c95e52929fd0c95dd1bf96ec669) passed all 11 local tests. The staged-source credential-pattern scan found no matches, and npm audit reported zero vulnerabilities. [GitHub CI](https://github.com/pawansatoshi/FLOP-Agent/actions/runs/45809684290) passed install, tests and audit.

The [push-triggered heartbeat](https://github.com/pawansatoshi/FLOP-Agent/actions/runs/45809684370) passed live Testnet verification and produced the mobile summary and `flop-testnet-status` artifact. The hourly schedule is configured at minute 17. A cron-triggered run has not yet been observed. The monitor uses public endpoints and GitHub-hosted runners for this public repository.

## Remaining release gates

- The dedicated production key was not created or provisioned. The owner must keep the generated seed and recovery copy in owner-controlled storage.
- A live faucet claim has not been submitted. Tests exercise simulated transport, durable reconciliation and event matching. The CLI requires explicit opt-in for an unscored claim.
- The Testnet gateway purchase route, native direct session spending, request-to-finalized-settlement attribution and eligibility remain unverified. Inference purchasing and rollover are disabled. No transaction, settlement or reward is recorded.
- Local transaction operations require persistent owner-controlled storage. There is no cloud signer or autonomous scheduled transaction workflow in this release.

## Official references

- [Agent guide](https://flop.network/llms.txt)
- [Testnet phase and rules](https://flop.finance/testnet/)
- [Operator hub](https://docs.flop.network/operators)
- [Faucet chain](https://faucet.flop.network/chain) and [limits](https://faucet.flop.network/limits)
- [Gateway OpenAPI](https://gateway.testnet.flop.network/openapi.json)
- [Explorer offline wallet](https://testnet.flopscan.io/offline-wallet)
