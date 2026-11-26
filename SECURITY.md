# Security

## Create and recover the identity

For Android, download the reviewed [offline identity page](dashboard/identity.html) from a specific repository commit. Open the downloaded HTML in an Ed25519 Web Crypto-capable browser after going offline. Generate the key once and save the binary seed file. If the browser denies the download or lacks support, use `node src/cli.mjs identity-init /private/flop-agent.seed` in an owner-controlled environment with persistent storage. The CLI refuses to overwrite an existing file.

Immediately move the file out of shared Downloads into protected storage. Keep a second copy in an encrypted owner-controlled vault with independent recovery access. The downloaded seed is a raw signing secret, so treat both copies as wallet credentials. Record the public key separately. For a recovery drill, restore the file to an owner-controlled host, restrict it with `chmod 600`, and compare the output of `node src/cli.mjs identity-show /private/flop-agent.seed` against the recorded public key, DID and SS58 address. Preserve the SQLite journal and restore it alongside the wallet.

The hosted heartbeat uses only the optional public key. Keep seeds out of chat, repository content, Codespaces logs, workflow inputs, artifacts, and rendered status. This release has no hosted signer. A halted or incompatible runtime requires operator review before any future signing resumes.

## Operational boundaries

GitHub Actions receives read-only repository access. Owner-approved local integration is limited to a single grant and uses a durable nonce, local exclusive lock, pinned network and SDK runtime policy. Finality requires the canonical block, exact extrinsic hash, expected faucet transfer event and successful extrinsic. Balance alone cannot identify a grant. The Testnet opening gives zero scored credit.

For private vulnerability reports, use the repository’s **Security → Report a vulnerability** if available. Keep keys, signed requests and private paths out of public issues.
