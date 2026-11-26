import { readFileSync, writeFileSync } from 'node:fs'
import { network } from './network.mjs'

const [input, output] = process.argv.slice(2)
const state = JSON.parse(readFileSync(input, 'utf8'))
const escape = value => String(value ?? 'Unavailable').replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const checked = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'long', timeZone: 'Asia/Kolkata'
}).format(new Date(state.checkedAt))
const row = (label, value) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`
function tokenBalance(value) {
  if (value === undefined) return 'Unavailable'
  const amount = BigInt(value)
  const unit = 10n ** 18n
  const fraction = (amount % unit).toString().padStart(18, '0').replace(/0+$/, '')
  return amount / unit + (fraction ? '.' + fraction : '') + ' FLOP'
}
const models = (state.models ?? []).map(model =>
  `<li><strong>${escape(model.id)}</strong><ul>${model.advertisedMiners.map(
    miner => '<li>' + escape(miner) + '</li>').join('')}</ul></li>`).join('')
writeFileSync(output, `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FLOP-Agent Testnet Status</title>
<style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#101516;color:#f6fbf8}
body{margin:0}main{max-width:68rem;margin:auto;padding:clamp(1rem,5vw,4rem)}
header{margin-bottom:2rem}h1{font-size:clamp(2.6rem,8vw,5rem);letter-spacing:-.06em;margin:.2em 0}
header p,p,dt{color:#adc1b9}h2{margin-top:0;font-size:1.15rem}a{color:#87efb4}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:1rem}
section{padding:1.25rem;border:1px solid #30423d;border-radius:1rem;background:#18211f;min-width:0}
dd{margin:0;overflow-wrap:anywhere}dl div{padding:.65rem 0;border-bottom:1px solid #30423d}
ul{padding-left:1.2rem;overflow-wrap:anywhere}footer{margin-top:1.25rem}
</style>
<main><header><p>FLOP Network Testnet · ${escape(checked)}</p><h1>FLOP-Agent</h1>
<p>${escape(state.mode)} · ${escape(state.scoring)}</p></header>
<div class="grid">
<section><h2>Network</h2><dl>${row('RPC verification', state.chain ? 'Verified' : 'Unavailable')}
${row('Runtime', state.chain?.runtime)}${row('Finalized height', state.chain?.height)}${row('Finalized block', state.chain?.finalized)}
${row('Faucet', state.faucet?.status)}${row('Gateway', state.gateway)}</dl></section>
<section><h2>Agent wallet</h2><dl>${row('DID', state.identity?.did)}${row('SS58 address', state.identity?.address)}
${row('Finalized free balance', tokenBalance(state.balance?.freePlanck))}
${row('Last successful claim', 'No public receipt connected')}
${row('Next eligible claim', 'Unverified')}</dl></section>
<section><h2>Gateway catalog</h2>${models ? '<ul>' + models + '</ul>' : '<p>No verified catalog entries.</p>'}</section>
<section><h2>Execution and settlement</h2><dl>
${row('Spending', state.spending)}${row('Eligible activity', state.eligibleActivity)}
${row('Inference sessions', 'None executed by monitor')}${row('FLOP spent', 'None by monitor')}
${row('Settlement and transaction hashes', 'No public receipt connected')}</dl>
<ul>${state.errors.map(error => '<li>' + escape(error) + '</li>').join('')}</ul></section></div>
<footer><a href="${network.explorer}/">Open FLOPScan</a></footer></main></html>\n`)
