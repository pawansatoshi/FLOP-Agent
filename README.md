# FLOP-Agent

FLOP-Agent monitors verified FLOP Testnet chain, faucet and gateway data. Its GitHub heartbeat runs without a signing key. The local CLI can attempt an explicitly authorized unscored faucet claim and reconcile its finalized transfer. It cannot purchase inference or enable scoring in this release.

## Android administration

Open the [production dashboard](https://flop-agent.vercel.app/) for Testnet and GitHub status, the downloadable offline wallet tool, and owner controls.

1. Open the [heartbeat workflow](https://github.com/pawansatoshi/FLOP-Agent/actions/workflows/monitor.yml) in your browser. Use desktop site view if GitHub hides **Run workflow**.
2. Open the latest successful run and read its **Summary**. A responsive HTML snapshot and its JSON data are available in the `flop-testnet-status` artifact. The summary uses India time.
3. To publish the wallet’s optional public DID, address and balance, add `FLOP_PUBLIC_KEY` under **Settings → Secrets and variables → Actions → Variables**. Use the 64 lowercase hex characters from the public key. The workflow only reads public data.
4. For an emergency halt, set the Actions variable `FLOP_MODE` to `HALTED`. Cancel an in-progress heartbeat if immediate cessation is required. Reset the variable to `MONITOR_ONLY` to resume. The owner running a local process must also stop it or set its own mode.

GitHub schedule execution can be delayed or disabled by platform policy. Use recent run history to verify the heartbeat. See [project state](PROJECT_STATE.md) for observed results.

## Local operation

Install Node.js 24 and run `npm ci --ignore-scripts`, `npm test`, and `npm run monitor`. To generate the responsive page, run `node src/cli.mjs monitor report.json` followed by `node src/dashboard.mjs report.json status.html`.

Create the dedicated identity only after choosing owner-controlled storage and a backup location. Follow [SECURITY.md](SECURITY.md) for Android offline initialization and recovery. Paid inference, rollover and hosted signing remain disabled.

A local one-time faucet integration test is available only with explicit owner approval. Use an owner-controlled host, a dedicated account, your pinned public key, and a persistent journal. Keep these files outside the checkout.

```bash
export FLOP_MODE=INTEGRATION_TEST
export FLOP_PUBLIC_KEY='<public-key-hex>'
export FLOP_KEY_FILE='/private/flop-agent.seed'
export FLOP_JOURNAL='/private/flop-agent.sqlite'
node src/cli.mjs claim --owner-approved-unscored
node src/cli.mjs reconcile '<finalized-block-hash-from-explorer>'
```

A timeout leaves a pending nonce. Re-running the same command after backoff reconciles that nonce. A known transaction hash returns the pending record and requires finalized block reconciliation. After an interrupted process, verify no process owns the local lock before removing the empty `.lock` directory. Preserve the journal and use the same identity.

For a cost estimate without buying inference, save a public-safe prompt to a file and use `FLOP_MODE=INTEGRATION_TEST FLOP_MODEL=qwen/qwen3-14b FLOP_MAX_TOKENS=64 FLOP_MAX_ESTIMATE=0.001 node src/cli.mjs estimate /path/to/prompt.txt`. This sends the prompt to the official Testnet estimator. Use only text you are prepared to share with the gateway.

## One-time hosted Testnet claim

Follow the [Android provisioning steps](SECURITY.md), then open [FLOP operator controls](https://github.com/pawansatoshi/FLOP-Agent/actions/workflows/control.yml) and dispatch **start** once on `main`. The operator workflow authenticates through GitHub and dispatches the bounded claim. A daily continuation at 09:11 IST resumes a pending nonce or a bounded finalized-block scan. If the matching finalized block is already known, dispatch **reconcile** with its block hash to avoid waiting for the scan.

The hosted mode does not start a second grant. Rollover requires verified prior spend and is blocked. `node src/cli.mjs direct-readiness` checks finalized model registry data and the public offer feed. `node src/cli.mjs verify-settlement CHANNEL_HASH BLOCK_HASH TX_HASH MAX_PLANCK` checks an independently identified on-chain settlement. A matching event establishes a channel payout, not that an arbitrary gateway request used that channel.
