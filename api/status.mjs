import { monitor } from '../src/monitor.mjs'
import { json } from '../src/network.mjs'

const repository = 'pawansatoshi/FLOP-Agent'
const root = 'https://raw.githubusercontent.com/' + repository
const history = 'https://api.github.com/repos/' + repository + '/actions/'
const workflowFiles = ['monitor.yml', 'claim.yml', 'control.yml', 'ci.yml']
const controlModes = ['RUNNING', 'STOPPED', 'HALTED']

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
    json(history + 'runs?branch=main&per_page=12'),
    json(history + 'workflows/monitor.yml/runs?event=schedule&branch=main&per_page=1')
  ])
  const controlStatus = control.status === 'fulfilled' && controlModes.includes(control.value?.mode) ?
    control.value.mode : null
  const record = journal.status === 'fulfilled' ? journal.value : null
  const configuredKey = controlStatus ? control.value.publicKey : undefined
  const candidate = configuredKey || record?.publicKey
  const publicKey = /^[a-f0-9]{64}$/.test(candidate ?? '') ? candidate : undefined
  let state
  try {
    state = await monitor({ publicKey })
  } catch {
    return res.status(503).json({ error: 'Testnet status temporarily unavailable' })
  }
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=60')
  return res.json({
    ...state,
    controlStatus,
    claim: publicKey && record?.publicKey === publicKey ? record.claim : null,
    runs: recent.status === 'fulfilled' ? runs(recent.value) : null,
    scheduled: scheduled.status === 'fulfilled' ? runs(scheduled.value) : null,
    spendingPlanck: null,
    settlements: []
  })
}
