// OpenClaw Client - Cron Job API Methods

import type { CronJob, RpcCaller } from './types'

export async function listCronJobs(call: RpcCaller): Promise<CronJob[]> {
  try {
    const result = await call<any>('cron.list')
    const jobs = Array.isArray(result) ? result : (result?.cronJobs || result?.jobs || result?.cron || result?.items || result?.list || [])
    return jobs.map((c: any) => {
      // Handle complex schedule objects (e.g., { kind, expr, tz })
      let schedule = c.schedule
      if (typeof schedule === 'object' && schedule !== null) {
        schedule = schedule.expr || schedule.display || JSON.stringify(schedule)
      }

      let nextRun = c.nextRun
      if (typeof nextRun === 'object' && nextRun !== null) {
        nextRun = nextRun.display || nextRun.time || JSON.stringify(nextRun)
      }

      return {
        id: c.id || c.name || `cron-${Math.random()}`,
        name: c.name || 'Unnamed Job',
        schedule: String(schedule || 'N/A'),
        status: c.status || 'active',
        description: c.description,
        nextRun: nextRun ? String(nextRun) : undefined
      }
    })
  } catch {
    return []
  }
}

export async function toggleCronJob(call: RpcCaller, cronId: string, enabled: boolean): Promise<void> {
  await call('cron.update', { id: cronId, status: enabled ? 'active' : 'paused' })
}

export async function getCronJobDetails(call: RpcCaller, cronId: string): Promise<CronJob | null> {
  try {
    const result = await call<any>('cron.get', { id: cronId })
    if (!result) return null

    let schedule = result.schedule
    if (typeof schedule === 'object' && schedule !== null) {
      schedule = schedule.expr || schedule.display || JSON.stringify(schedule)
    }

    let nextRun = result.nextRun
    if (typeof nextRun === 'object' && nextRun !== null) {
      nextRun = nextRun.display || nextRun.time || JSON.stringify(nextRun)
    }

    return {
      id: result.id || result.name || cronId,
      name: result.name || 'Unnamed Job',
      schedule: String(schedule || 'N/A'),
      status: result.status || 'active',
      description: result.description,
      nextRun: nextRun ? String(nextRun) : undefined,
      content: result.content || result.markdown || result.readme || ''
    }
  } catch {
    return null
  }
}
