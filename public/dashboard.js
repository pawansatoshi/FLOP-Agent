const label = { 'monitor.yml': 'Heartbeat', 'claim.yml': 'Faucet signer', 'control.yml': 'Operator control', 'ci.yml': 'CI' }
const display = (id, value) => { document.getElementById(id).textContent = value }
const time = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
let cooldownEnd

function countDown() {
  if (!Number.isFinite(cooldownEnd)) return
  const seconds = Math.ceil((cooldownEnd - Date.now()) / 1000)
  if (seconds <= 0) return display('cooldown', 'Elapsed · rollover conditions apply')
  display('cooldown', [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':'))
}
setInterval(countDown, 1000)

function amount(value) {
  if (!/^\d+$/.test(value ?? '')) return 'Balance unavailable'
  const text = value.padStart(19, '0')
  const fraction = text.slice(-18).replace(/0+$/, '')
  return text.slice(0, -18) + (fraction ? '.' + fraction : '') + ' FLOP'
}

async function refresh() {
  try {
    const response = await fetch('/api/status')
    if (!response.ok) throw new Error()
    const state = await response.json()
    display('updated', 'Checked ' + time.format(new Date(state.checkedAt)) + ' IST')
    display('balance', amount(state.balance?.freePlanck))
    display('address', state.identity?.address ?? 'Awaiting wallet')
    display('did', state.identity?.did ?? 'Awaiting wallet')
    display('faucet', state.faucet?.status ?? 'Unavailable')
    display('claim', state.claim?.status ?? 'No claim recorded')
    const hash = state.claim?.transactionHash
    if (typeof hash === 'string' && /^0x[0-9a-f]{64}$/.test(hash)) {
      const link = document.createElement('a')
      link.href = 'https://testnet.flopscan.io/'
      link.textContent = ' · ' + hash
      document.getElementById('claim').append(link)
    }
    cooldownEnd = Date.parse(state.claim?.cooldownEndsAt)
    display('cooldown', 'No finalized claim')
    countDown()
    display('rollover', state.claim?.rollover ?? 'Verified prior inference spend required')
    display('gateway', state.gateway ?? 'Unavailable')
    display('models', state.models?.map(model => model.id).join(', ') || 'Unavailable')
    display('spend', state.spendingPlanck === null ? 'No verified spend recorded' : amount(state.spendingPlanck))
    display('settlements', state.settlements.length ? String(state.settlements.length) + ' verified settlements' :
      'No agent settlements recorded')
    display('scoring', state.scoring ?? 'Activation unverified')
    display('control', state.controlStatus ?? 'Unverified · signer defaults to stopped')
    display('chain', state.chain ? `#${state.chain.height} · runtime ${state.chain.runtime}` : 'Unavailable')
    const scheduled = state.scheduled?.[0]
    display('scheduled', scheduled ? `Scheduled heartbeat · ${scheduled.conclusion ?? scheduled.status} · ${time.format(new Date(scheduled.createdAt))} IST` :
      state.scheduled ? 'GitHub has no scheduled heartbeat record' : 'Scheduled status unavailable')
    const items = (state.runs ?? []).map(run => {
      const item = document.createElement('li')
      const link = document.createElement('a')
      link.href = run.url
      link.textContent = `${label[run.workflow]} · ${run.event} · ${run.conclusion ?? run.status}`
      item.append(link, ' · ' + time.format(new Date(run.createdAt)) + ' IST')
      return item
    })
    if (!items.length) {
      const item = document.createElement('li')
      item.textContent = state.runs ? 'No runs reported' : 'GitHub run data unavailable'
      items.push(item)
    }
    document.getElementById('runs').replaceChildren(...items)
  } catch {
    display('updated', 'Status temporarily unavailable. Retrying shortly.')
  }
}
await refresh()
setInterval(refresh, 120000)
