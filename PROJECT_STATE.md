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

The [push-triggered heartbeat](https://github.com/pawansatoshi/FLOP-Agent/actions/runs/45809684370) passed live Testnet verification and produced the mobile summary and `flop-testnet-status` artifact. The initial hourly schedule was configured at minute 17. The follow-up moved it to minute 37 to obtain an earlier scheduled verification. A cron-triggered run has not yet been observed. The monitor uses public endpoints and GitHub-hosted runners for this public repository.

## Remaining release gates

- The dedicated production key was not created or provisioned. The owner must keep the generated seed and recovery copy in owner-controlled storage.
- A live faucet claim has not been submitted. Tests exercise simulated transport, durable reconciliation and event matching. The CLI requires explicit opt-in for an unscored claim.
- The Testnet gateway purchase route, native direct session spending, request-to-finalized-settlement attribution and eligibility remain unverified. Inference purchasing and rollover are disabled. No transaction, settlement or reward is recorded.
- Local transaction operations use persistent owner-controlled storage. Hosted one-time claim support is described below.

## Official references

- [Agent guide](https://flop.network/llms.txt)
- [Testnet phase and rules](https://flop.finance/testnet/)
- [Operator hub](https://docs.flop.network/operators)
- [Faucet chain](https://faucet.flop.network/chain) and [limits](https://faucet.flop.network/limits)
- [Gateway OpenAPI](https://gateway.testnet.flop.network/openapi.json)
- [Explorer offline wallet](https://testnet.flopscan.io/offline-wallet)

## Unscored integration follow-up

The signer and checkpoint workflow supports an owner-provisioned Ed25519 key and one manually initiated free Testnet claim. The daily trigger can only continue that same claim. The default stays MONITOR_ONLY. The first hosted transaction still requires the owner to provision the secret; no replacement identity was generated.

The gateway wallet capability probe returned HTTP 404 on both documented path aliases. Gateway OpenAPI marks wallet enrollment Devnet-only and describes the disabled-route 404. Testnet connect options returned 200, but connect grants and preflight require a bearer credential. FLOP’s direct-session documentation describes a reachable, opted-in miner endpoint. The published SDK uses the explorer session-offer feed for signed spot offers, and the Testnet feed returned 404. Catalog addresses do not identify reachable miner endpoints. No paid alternative was used.

A read-only settlement verifier now distinguishes a finalized payout on the expected channel from an outstanding challenge or a failed or over-budget extrinsic. Issuing a payment remains disabled pending a qualified Testnet direct endpoint. Official references include the [direct miner procedure](https://docs.flop.network/docs/send-to-specific-miner), the [published SDK](https://www.npmjs.com/package/@flop-labs/sdk/v/0.12.1), [release notes](https://github.com/flop-labs/network/releases), and [offer publication issue #306](https://github.com/flop-labs/network/issues/306).

The live SDK registry probe verified Qwen3-14B with a finalized BF16 measured root at height 163582. Live Testnet metadata confirmed the documented `Settled` and `SettlementPosted` event shapes. An offline Chromium mobile viewport check passed encrypted download, wrong-passphrase rejection, recovery, seed-to-public-key matching and signing-value clearing. This was browser emulation. The physical Android device has not been tested. A local bare Git remote verified cross-run journal restoration and rejection of stale writes.

## Vercel dashboard and operator controls

The dashboard consumes public GitHub run metadata, the journal summary, and verified FLOP snapshots. It is read-only on Vercel. Start, Stop and Halt route to GitHub's authenticated operator workflow. Only a writer can dispatch on main. The control workflow never loads wallet credentials. A missing or inaccessible control branch prevents signing. Live payment remains disabled.

Production is available at [flop-agent.vercel.app](https://flop-agent.vercel.app/). The dashboard revision [cdec943](https://github.com/pawansatoshi/FLOP-Agent/commit/cdec9438cd1d6500958b2cda34b79a1c4411b7f8) passed [CI](https://github.com/pawansatoshi/FLOP-Agent/actions/runs/45819182175) and the [push-triggered heartbeat](https://github.com/pawansatoshi/FLOP-Agent/actions/runs/45819182264). Fourteen tests passed locally. The production status function returned live chain runtime 1014039, open faucet data and actual GitHub workflow links. The scheduled heartbeat is independently tracked from push-triggered runs.

## Production follow-up (26 November 2026)

The current source adds a mobile-first Control Center with live runtime/chain status, explicit execution mode, last heartbeat and countdown to the next scheduled slot, public wallet fields, cooldown, workflow activity chart, and recent GitHub run links. Spending and settlement values remain explicitly unavailable because there is no verified Testnet inference purchase. Controls continue through GitHub's authenticated `workflow_dispatch` interface; the public Vercel dashboard does not receive or store a GitHub credential. Stop and Halt remain distinct signer states, and only Halt reports `HALTED`.

The schedule is now `7 * * * *` UTC. As of the source update, GitHub's Actions API had not yet recorded a timer-triggered run. A push heartbeat does not count as cron evidence. The dashboard reports the timer history separately and must not mark a scheduled run successful until GitHub returns an actual `schedule` event.

Current official protocol documentation was rechecked. It says Testnet inference is not open, the published gateway and enrollment route are Devnet-only, and there is no public Testnet miner pack. The SDK's direct-session route requires a reachable opted-in miner HTTPS endpoint, matching signed offer or accepted force-open, exact registered model identity, calibration, finalized channel state, and verified settlement. No eligible Testnet offer or endpoint is published, so this agent has not submitted an inference payment. The [official guide](https://docs.flop.network/docs/official-links), [direct-session guide](https://docs.flop.network/docs/send-to-specific-miner), [Testnet miner onboarding](https://docs.flop.network/docs/run-miner?network=testnet), and [operator hub](https://docs.flop.network/operators) document these gates. Scoring remains unverified and `SCORED_ACTIVE` remains disabled.

The offline recovery page now verifies the restored seed against its public key by signing a random challenge before enabling provisioning. An offline Chromium Android-sized check passed encryption, incorrect-password rejection, recovery verification, comparison with the SDK-derived public key, and clearing the signing field. This emulation is not a physical-device test. No production wallet was created or provisioned. The exact owner setup links and separate environment secret/repository-variable steps are in [SECURITY.md](SECURITY.md).
