# FLOP-Agent repository instructions

Keep the repository public and the agent Testnet-only. Run `npm ci --ignore-scripts`, `npm test` and `npm audit --omit=dev` before changes land. Update PROJECT_STATE.md with evidence and unresolved blockers.

Use the pinned SDK and official endpoints. Never log or commit private keys or signed claim bodies. Preserve pending nonces and journal format across updates. Never enable repeat claims without qualified prior-spend evidence or scoring without explicit official activation and owner-authorized bounds.
