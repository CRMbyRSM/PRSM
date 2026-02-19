import { isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns'
import type { Session } from '../lib/openclaw'

export interface SessionGroup {
  label: string
  sessions: Session[]
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older']

function getGroupLabel(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  if (isThisWeek(date, { weekStartsOn: 1 })) return 'This Week'
  if (isThisMonth(date)) return 'This Month'
  return 'Older'
}

export function groupSessionsByDate(sessions: Session[]): SessionGroup[] {
  const groups = new Map<string, Session[]>()

  for (const session of sessions) {
    const date = new Date(session.updatedAt)
    const label = getGroupLabel(date)
    const list = groups.get(label)
    if (list) {
      list.push(session)
    } else {
      groups.set(label, [session])
    }
  }

  // Sort sessions within each group by updatedAt descending
  for (const list of groups.values()) {
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }

  // Return groups in fixed order, skipping empty ones
  return GROUP_ORDER
    .filter(label => groups.has(label))
    .map(label => ({ label, sessions: groups.get(label)! }))
}
