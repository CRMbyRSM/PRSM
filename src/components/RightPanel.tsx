import { useState } from 'react'
import { useStore, PinnedMessage } from '../store'
import { Skill, CronJob } from '../lib/openclaw-client'
import { safe } from '../lib/safe-render'
import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeSanitize]

export function RightPanel() {
  const {
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
    skills,
    cronJobs,
    selectSkill,
    selectCronJob,
    selectedSkill,
    selectedCronJob,
    pinnedMessages,
    currentSessionId,
    unpinMessage
  } = useStore()

  const [searchQuery, setSearchQuery] = useState('')

  const filteredSkills = skills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredCronJobs = cronJobs.filter(
    (job) =>
      job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.schedule.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Show ALL pins across sessions, sorted newest-pinned first
  const allPins = [...pinnedMessages].sort(
    (a, b) => new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime()
  )

  const filteredPins = allPins.filter(
    (pin) => pin.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Build session name lookup from sessions list
  const sessions = useStore((s) => s.sessions)
  const sessionNameMap: Record<string, string> = {}
  for (const s of sessions) {
    sessionNameMap[s.id] = s.label || s.id.slice(0, 8)
  }

  return (
    <aside className={`right-panel ${rightPanelOpen ? 'visible' : 'hidden'}`}>
      <div className="panel-header">
        <div className="panel-tabs">
          <button
            className={`panel-tab ${rightPanelTab === 'pins' ? 'active' : ''}`}
            onClick={() => setRightPanelTab('pins')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14, marginRight: 4, verticalAlign: -2 }}>
              <path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9l3-9z" />
            </svg>
            Pins{allPins.length > 0 ? ` (${allPins.length})` : ''}
          </button>
          <button
            className={`panel-tab ${rightPanelTab === 'skills' ? 'active' : ''}`}
            onClick={() => setRightPanelTab('skills')}
          >
            Skills
          </button>
          <button
            className={`panel-tab ${rightPanelTab === 'crons' ? 'active' : ''}`}
            onClick={() => setRightPanelTab('crons')}
          >
            Cron Jobs
          </button>
        </div>
        <button
          className="panel-close"
          onClick={() => setRightPanelOpen(false)}
          aria-label="Close panel"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {rightPanelTab !== 'pins' && (
        <div className="panel-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {rightPanelTab === 'pins' ? (
        <div className="panel-content">
          {allPins.length > 0 ? (
            <div className="panel-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search pins..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          ) : null}
          {filteredPins.length > 0 ? (
            filteredPins.map((pin) => (
              <PinItem
                key={pin.id}
                pin={pin}
                sessionName={sessionNameMap[pin.sessionId] || pin.sessionId.slice(0, 8)}
                onUnpin={() => unpinMessage(pin.id)}
              />
            ))
          ) : (
            <div className="empty-panel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 40, height: 40, opacity: 0.3, marginBottom: 8 }}>
                <path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9l3-9z" />
              </svg>
              <p>No pinned messages</p>
              <p className="hint">Hover over a message and click the star to pin it here</p>
            </div>
          )}
        </div>
      ) : rightPanelTab === 'skills' ? (
        <div className="panel-content">
          {filteredSkills.length > 0 ? (
            filteredSkills.map((skill, index) => (
              <SkillItem
                key={skill.id || index}
                skill={skill}
                isSelected={selectedSkill?.id === skill.id}
                onClick={() => selectSkill(skill)}
              />
            ))
          ) : (
            <div className="empty-panel">
              <p>No skills found</p>
            </div>
          )}
        </div>
      ) : (
        <div className="panel-content">
          {filteredCronJobs.length > 0 ? (
            filteredCronJobs.map((job, index) => (
              <CronJobItem
                key={job.id || index}
                job={job}
                isSelected={selectedCronJob?.id === job.id}
                onClick={() => selectCronJob(job)}
              />
            ))
          ) : (
            <div className="empty-panel">
              <p>No cron jobs found</p>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

// Pinned message card
function PinItem({ pin, sessionName, onUnpin }: { pin: PinnedMessage; sessionName: string; onUnpin: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = pin.content.length > 300
  const displayContent = isLong && !expanded ? pin.content.slice(0, 300) + '…' : pin.content

  let pinnedTime = ''
  try {
    pinnedTime = format(new Date(pin.pinnedAt), 'MMM d, h:mm a')
  } catch { /* */ }

  let originalTime = ''
  try {
    originalTime = format(new Date(pin.timestamp), 'MMM d, h:mm a')
  } catch { /* */ }

  return (
    <div className="pin-item">
      <div className="pin-item-header">
        <span className="pin-item-session" title={pin.sessionId}>{safe(sessionName)}</span>
        <span className={`pin-item-role ${pin.role}`}>
          {pin.role === 'user' ? 'You' : pin.role === 'assistant' ? 'Assistant' : 'System'}
        </span>
        <span className="pin-item-time" title={`Pinned ${pinnedTime}`}>{safe(originalTime)}</span>
        <button className="pin-item-unpin" onClick={onUnpin} title="Unpin">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {pin.attachments && pin.attachments.length > 0 && (
        <div className="pin-item-attachments">
          {pin.attachments.filter(a => a.type === 'image').map((att, i) => (
            <img
              key={i}
              src={`data:${safe(att.mimeType)};base64,${safe(att.content)}`}
              alt={`Pinned image ${i + 1}`}
              className="pin-item-image"
            />
          ))}
        </div>
      )}
      <div className="pin-item-content">
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
          {displayContent}
        </ReactMarkdown>
      </div>
      {isLong && (
        <button className="pin-item-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

interface SkillItemProps {
  skill: Skill
  isSelected: boolean
  onClick: () => void
}

function SkillItem({ skill, isSelected, onClick }: SkillItemProps) {
  return (
    <div
      className={`skill-item clickable ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="skill-header">
        <div className="skill-icon">
          {skill.emoji ? (
            <span className="skill-emoji">{safe(skill.emoji)}</span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
            </svg>
          )}
        </div>
        <div className={`skill-status ${skill.enabled === false ? 'disabled' : skill.eligible ? 'enabled' : 'missing'}`}>
          {skill.enabled === false ? 'Disabled' : skill.eligible ? 'Ready' : 'Missing'}
        </div>
      </div>
      <div className="skill-content">
        <div className="skill-name">{safe(skill.name)}</div>
        <div className="skill-description">{safe(skill.description)}</div>
        <div className="skill-triggers">
          {skill.triggers.map((trigger, index) => (
            <span key={safe(trigger) || index} className="trigger-badge">
              {safe(trigger)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

interface CronJobItemProps {
  job: CronJob
  isSelected: boolean
  onClick: () => void
}

function CronJobItem({ job, isSelected, onClick }: CronJobItemProps) {
  const { client, fetchCronJobs } = useStore()

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await client?.toggleCronJob(job.id, job.status === 'paused')
    await fetchCronJobs()
  }

  return (
    <div
      className={`cron-item clickable ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className={`cron-status ${job.status}`} />
      <div className="cron-content">
        <div className="cron-name">{safe(job.name)}</div>
        <div className="cron-schedule">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span>{safe(job.schedule)}</span>
        </div>
        <div className="cron-next">
          {job.status === 'paused' ? 'Paused' : `Next run: ${safe(job.nextRun) || 'Unknown'}`}
        </div>
      </div>
      <button className="cron-toggle" onClick={handleToggle} aria-label="Toggle cron job">
        {job.status === 'paused' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        )}
      </button>
    </div>
  )
}
