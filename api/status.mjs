import { monitor } from '../src/monitor.mjs'
import { connectFlopApi } from '@flop-labs/sdk'
import { json, retryMonitorRead } from '../src/network.mjs'

const repository = 'pawansatoshi/FLOP-Agent'
const root = 'https://raw.githubusercontent.com/' + repository
const history = 'https://api.github.com/repos/' + repository + '/actions/'
const workflowFiles = ['monitor.yml', 'claim.yml', 'control.yml', 'ci.yml']
const controlModes = ['RUNNING', 'STOPPED', 'HALTED']

export function nextHeartbeat(now = new Date()) {
  const next = new Date(now)
  next.setUTCSeconds(0, 0)
  next.setUTCMinutes(7)
  if (next <= now) next.setUTCHours(next.getUTCHours() + 1)
  return next.toISOString()
}

export function activity(items, now = Date.now()) {
  const windowMs = 2 * 60 * 60 * 1000
  const current = Math.floor(now / windowMs) * windowMs
  const slots = Array.from({ length: 12 }, (_, index) => ({
    start: new Date(current - (11 - index) * windowMs).toISOString(), total: 0, successful: 0
  }))
  for (const run of items ?? []) {
    if (run.workflow !== 'monitor.yml') continue
    const age = now - Date.parse(run.createdAt)
    if (!Number.isFinite(age) || age < 0 || age >= 24 * 60 * 60 * 1000) continue
    const slot = slots[11 - Math.floor(age / windowMs)]
    if (slot) {
      slot.total += 1
      if (run.conclusion === 'success') slot.successful += 1
    }
  }
  return slots.map((slot, index) => ({ ...slot, label: index % 2 === 0 ?
    new Intl.DateTimeFormat('en-IN', { hour: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(slot.start)) : '' }))
}

function runs(value) {
  if (!Array.isArray(value?.workflow_runs)) return null
  return value.workflow_runs.flatMap(run => {
    if (!Number.isSafeInteger(run.id) || !workflowFiles.includes(run.path?.split('/').at(-1))) return []
    return [{
      workflow: run.path.split('/').at(-1), event: run.event, status: run.status,
      conclusion: run.conclusion, createdAt: run.created_at,
      url: 'https://github.com/' + repository + '/actions/runs/' + run.id
    }]
  })
}

export default async function handler(req, res) {
  res.setHeader('Allow', 'GET')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const [journal, control, recent, scheduled] = await Promise.allSettled([
    json(root + '/flop-claim-state/public.json'),
    json(root + '/flop-control/control.json'),
    json(history + 'runs?branch=main&per_page=100'),
    json(history + 'workflows/monitor.yml/runs?event=schedule&branch=main&per_page=1')
  ])
  const controlStatus = control.status === 'fulfilled' && controlModes.includes(control.value?.mode) ?
    control.value.mode : 'STOPPED'
  const executionMode = controlStatus === 'HALTED' ? 'HALTED' :
    controlStatus === 'RUNNING' && control.value?.executionMode === 'INTEGRATION_TEST' ?
      'INTEGRATION_TEST' : 'MONITOR_ONLY'
  const record = journal.status === 'fulfilled' ? journal.value : null
  const configuredKey = control.status === 'fulfilled' ? control.value?.publicKey : undefined
  const candidate = configuredKey || record?.publicKey
  const publicKey = /^[a-f0-9]{64}$/.test(candidate ?? '') ? candidate : undefined
  let state
  try {
    state = await monitor({ publicKey, request: retryMonitorRead, connect: connectFlopApi })
  } catch {
    return res.status(503).json({ error: 'Testnet status temporarily unavailable' })
  }
  const workflowRuns = recent.status === 'fulfilled' ? runs(recent.value) : null
  const heartbeatRuns = workflowRuns?.filter(run => run.workflow === 'monitor.yml') ?? []
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=30')
  return res.json({
    ...state,
    executionMode,
    controlStatus,
    lastHeartbeat: heartbeatRuns[0] ?? null,
    nextScheduledAt: nextHeartbeat(),
    claim: publicKey && record?.publicKey === publicKey ? record.claim : null,
    runs: workflowRuns?.slice(0, 16) ?? null,
    activity: activity(workflowRuns),
    scheduled: scheduled.status === 'fulfilled' ? runs(scheduled.value) : null,
    spendingPlanck: null,
    settlements: []
  })
}
