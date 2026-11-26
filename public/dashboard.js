const workflowNames = { 'monitor.yml': 'Heartbeat', 'claim.yml': 'Faucet signer', 'control.yml': 'Operator control', 'ci.yml': 'CI' }
const byId = id => document.getElementById(id)
const display = (id, value) => { byId(id).textContent = value }
const time = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
let cooldownEnd, nextRunAt
function remaining(until) {
  if (!Number.isFinite(until)) return '—'
  const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':')
}
function amount(value) {
  if (!/^\d+$/.test(value ?? '')) return 'Balance unavailable'
  const text = value.padStart(19, '0'), fraction = text.slice(-18).replace(/0+$/, '')
  return text.slice(0, -18) + (fraction ? '.' + fraction : '') + ' FLOP'
}
function pill(id, label, state) { const el = byId(id); el.textContent = label; el.className = `pill ${state}-pill` }
function renderActivity(series) {
  const svg = byId('activity-chart').querySelector('svg'); svg.replaceChildren()
  const values = Array.isArray(series) ? series : [], total = values.reduce((n, item) => n + item.total, 0)
  display('activity-total', `${total} ${total === 1 ? 'run' : 'runs'}`); byId('chart-empty').hidden = total > 0
  for (const y of [20, 65, 110, 155]) { const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); line.setAttribute('x1','12');line.setAttribute('x2','708');line.setAttribute('y1',y);line.setAttribute('y2',y);line.setAttribute('class','chart-axis');svg.append(line) }
  const max = Math.max(1, ...values.map(item => item.total)), slot = 696 / Math.max(1, values.length)
  values.forEach((item, i) => {
    const height = item.total ? Math.max(8, item.total / max * 120) : 3
    const bar = document.createElementNS('http://www.w3.org/2000/svg','rect');bar.setAttribute('x',15+i*slot);bar.setAttribute('y',155-height);bar.setAttribute('width',Math.max(8,slot-10));bar.setAttribute('height',height);bar.setAttribute('class','chart-bar');bar.setAttribute('fill',item.total===item.successful&&item.total?'#37a66b':item.total?'#bfc0c8':'#e6e6eb');bar.setAttribute('aria-label',`${item.label||'Interval'}: ${item.total} runs, ${item.successful} successful`);svg.append(bar)
    if(item.label){const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x',15+i*slot);label.setAttribute('y','178');label.setAttribute('class','chart-label');label.textContent=item.label;svg.append(label)}
  })
}
function renderRuns(runs) {
  const list=byId('runs'), items=(runs??[]).map(run=>{const li=document.createElement('li'),a=document.createElement('a'),t=document.createElement('time');a.href=run.url;a.textContent=`${workflowNames[run.workflow]??'Workflow'} · ${run.event} · ${run.conclusion??run.status}`;t.dateTime=run.createdAt;t.textContent=time.format(new Date(run.createdAt));li.append(a,t);return li})
  if(!items.length){const li=document.createElement('li');li.textContent=runs?'No workflow runs reported':'GitHub run data unavailable';items.push(li)} list.replaceChildren(...items)
}
async function refresh(){try{
  const response=await fetch('/api/status',{headers:{accept:'application/json'}});if(!response.ok)throw new Error();const state=await response.json()
  display('updated','Updated '+time.format(new Date(state.checkedAt))+' IST');display('mode',state.executionMode??'MONITOR_ONLY')
  const errors=Array.isArray(state.errors)?state.errors.filter(v=>typeof v==='string').slice(0,5):[];byId('errors').hidden=errors.length===0;display('errors',errors.length?'Status details · '+errors.join(' · '):'')
  display('network-status',state.chain?'Connected':'Unavailable');display('chain-short',state.chain?`Block ${state.chain.height} · runtime ${state.chain.runtime}`:'Waiting for verified Testnet')
  const hb=state.lastHeartbeat;display('heartbeat-time',hb?time.format(new Date(hb.createdAt)):'No heartbeat yet');display('heartbeat-result',hb?`${hb.event} · ${hb.conclusion??hb.status}`:'No GitHub run recorded')
  nextRunAt=Date.parse(state.nextScheduledAt);display('next-run',Number.isFinite(nextRunAt)?remaining(nextRunAt):'Unavailable');display('next-run-label',Number.isFinite(nextRunAt)?`Hourly · ${time.format(new Date(nextRunAt))} IST`:'Hourly · GitHub Actions')
  display('balance',amount(state.balance?.freePlanck));display('address',state.identity?.address??'Awaiting wallet');display('did',state.identity?.did??'Awaiting wallet');pill('wallet-state',state.identity?'Verified address':'Not connected',state.identity?'good':'muted')
  display('faucet',state.faucet?.status??'Unavailable');pill('faucet-pill',state.faucet?.status??'Unavailable',state.faucet?.status==='open'?'good':'muted');display('claim',state.claim?.status??'No claim recorded');cooldownEnd=Date.parse(state.claim?.cooldownEndsAt);display('cooldown',Number.isFinite(cooldownEnd)?remaining(cooldownEnd):'No finalized claim');display('rollover',state.claim?.rollover??'Verified prior inference spend required')
  display('gateway',state.gateway??'Unavailable');pill('gateway-pill',state.gateway==='catalog reachable'?'Catalog only':'Unavailable','muted');display('gateway-note','Catalog only; no payable route verified for this agent');display('models',state.models?.map(m=>`${m.id} · ${Array.isArray(m.advertisedMiners)?m.advertisedMiners.length:0} advertised addresses`).join(' / ')||'Unavailable');display('spend',state.spendingPlanck===null?'No verified spend recorded':amount(state.spendingPlanck));display('settlements',state.settlements?.length?`${state.settlements.length} verified settlements`:'No agent settlements recorded');display('scoring',state.scoring??'Activation unverified')
  display('control',state.controlStatus??'STOPPED');pill('control-pill',state.controlStatus??'STOPPED',state.controlStatus==='RUNNING'?'good':state.controlStatus==='HALTED'?'warn':'muted');display('chain',state.chain?`#${state.chain.height} · runtime ${state.chain.runtime}`:'Unavailable')
  const scheduled=state.scheduled?.[0];display('scheduled',scheduled?`Scheduled run: ${scheduled.conclusion??scheduled.status} · ${time.format(new Date(scheduled.createdAt))} IST`:state.scheduled?'GitHub has no timer-triggered run recorded yet.':'Scheduled run history unavailable.')
  renderActivity(state.activity);renderRuns(state.runs)
}catch{display('updated','Status temporarily unavailable. Retrying shortly.')}}
setInterval(()=>{if(Number.isFinite(cooldownEnd))display('cooldown',remaining(cooldownEnd));if(Number.isFinite(nextRunAt))display('next-run',remaining(nextRunAt))},1000)
await refresh();setInterval(refresh,60000)
