# Security

## Android identity and recovery

1. Download the reviewed [offline identity page](dashboard/identity.html) from a specific repository commit. Open your local HTML copy in an Ed25519 Web Crypto-capable browser while offline.
2. Choose a unique passphrase of at least 16 characters. Generate the dedicated identity once and save the encrypted JSON. Keep two copies and store the passphrase separately. The backup uses PBKDF2-SHA-256 with 600,000 iterations, a random salt, and AES-256-GCM with a random IV. The public key is authenticated with the seed.
3. Select the saved file and verify it with the passphrase. Compare its public key with the one recorded at generation. To recover later, use this same file and passphrase. The page only exposes the seed after you choose **Reveal signing value for GitHub**.

If you prefer a persistent owner-controlled Node.js host, `node src/cli.mjs identity-init /private/flop-agent.seed` remains available. It creates an owner-only raw seed and refuses to overwrite files. Back up the seed in an encrypted vault. Use `identity-show` to compare the recovered identity with your recorded public key. A raw seed and the revealed signing value are wallet credentials.

## Authorized GitHub Testnet signer

In repository **Settings → Environments**, create `flop-testnet-signer`. Restrict deployment branches to `main` and add environment secret `FLOP_ED25519_SEED`. Paste the revealed hex directly into that secret. Clear the offline page and Android clipboard after provisioning. Keep the backup passphrase and encrypted JSON in your own storage. GitHub receives only the signing value.

Use **Settings → Secrets and variables → Actions → Variables** for repository variable `FLOP_PUBLIC_KEY` (the public 64-character hex) and `FLOP_MODE=INTEGRATION_TEST`. This enables only the bounded Testnet workflow. The signer matches the secret to the pinned public key before any request. A first grant requires a manual **start** dispatch on `main`. The daily GitHub run can only continue that one pending claim. Protect edits to `main` and restrict collaborators who can change signer code or workflows.

The signer step keeps the seed in memory and passes a sanitized environment to Git checkpoint commands. The public `flop-claim-state` branch carries a SQLite journal containing only public addresses, faucet state, timestamps, nonces and chain references. It contains zero signing credentials. The intent must be pushed before a request. A failed push aborts the request. Same-nonce retries and finalized-block scans resume from the branch after runner termination. Preserve the branch to retain the operation history. The read-only dashboard sees only the public claim status and chain references.

Set `FLOP_MODE=HALTED` and cancel any current signer run to stop immediately. Keep seeds out of chat, repository content, workflow inputs, artifacts and dashboards. Use the repository's private vulnerability reporting, if enabled.

## Mobile controls and final safety check

Open the [authenticated operator workflow](https://github.com/pawansatoshi/FLOP-Agent/actions/workflows/control.yml) on main. Select **Run workflow**, then **start**, **stop** or **halt**. GitHub requires a repository writer session. Start writes an explicit running state and dispatches the single grant when the integration variable is enabled. Stop blocks submission at the next control check. Halt writes a durable halt and requests cancellation of active signer runs. It cannot retract an already submitted faucet request. For belt-and-suspenders emergency recovery, set the Actions variable to HALTED and cancel the run from its GitHub page.

On Android Chrome, download the HTML from the [offline wallet source](https://github.com/pawansatoshi/FLOP-Agent/blob/main/dashboard/identity.html) or the dashboard download. Open the saved local file offline. The web-hosted page cannot generate or recover a seed. Provision through [GitHub Environments](https://github.com/pawansatoshi/FLOP-Agent/settings/environments) and [Actions repository variables](https://github.com/pawansatoshi/FLOP-Agent/settings/variables/actions). If the mobile layout hides the settings or Run workflow button, enable Chrome's Desktop site. Keep both backup and passphrase on owner-controlled storage.

The Vercel dashboard has no operator credential or wallet secret. The public status function uses read-only inputs from the FLOP endpoints and GitHub. The operator workflow has short-lived GitHub Actions and Contents permissions and does not load the signer secret. The signer resolves a fresh control ref both before loading the identity and again between the durable checkpoint and submission. Its environment secret is scoped to the signing step. Install scripts are disabled, the package lock is enforced, and external Actions are pinned to commits. The signing job retains write access to checkpoint the public journal. GitHub repository writers and changes to main therefore remain trusted. Restrict the signer environment to main and review workflow changes before provisioning.
