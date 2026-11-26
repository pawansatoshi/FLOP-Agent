import { readFileSync } from 'node:fs'

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const time = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'long',
  timeZone: 'Asia/Kolkata' }).format(new Date(state.checkedAt))

function cell(value) {
  return String(value ?? 'Unavailable').replace(/[^a-zA-Z0-9 .:,+/_()–-]/g, ' ')
}

const rows = [
  ['Checked', time], ['Mode', state.mode], ['Scoring', state.scoring],
  ['Runtime', state.chain?.runtime], ['Finalized height', state.chain?.height],
  ['Finalized block', state.chain?.finalized], ['Faucet', state.faucet?.status],
  ['Gateway', state.gateway], ['Models', state.models?.map(model => model.id).join(', ')],
  ['Public DID', state.identity?.did], ['SS58 address', state.identity?.address],
  ['Finalized free balance (Planck)', state.balance?.freePlanck],
  ['Spend', state.spending], ['Eligible activity', state.eligibleActivity]
]
console.log('# FLOP-Agent Testnet status\n\n| Check | Result |\n| --- | --- |')
for (const [name, value] of rows) console.log(`| ${name} | ${cell(value)} |`)
for (const error of state.errors) console.log('\n- ' + cell(error))
