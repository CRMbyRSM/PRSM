import { useState } from 'react'
import { useStore } from '../store'
import { Skill, CronJob } from '../lib/openclaw-client'

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
    selectedCronJob
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

  return (
    <aside className={`right-panel ${rightPanelOpen ? 'visible' : 'hidden'}`}>
      <div className="panel-header">
        <div className="panel-tabs">
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

      {rightPanelTab === 'skills' ? (
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
        <div className={`skill-status ${skill.enabled !== false ? 'enabled' : 'disabled'}`}>
          {skill.enabled !== false ? 'Enabled' : 'Disabled'}
        </div>
      </div>
      <div className="skill-content">
        <div className="skill-name">{skill.name}</div>
        <div className="skill-description">{skill.description}</div>
        <div className="skill-triggers">
          {skill.triggers.map((trigger, index) => (
            <span key={trigger || index} className="trigger-badge">
              {trigger}
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
        <div className="cron-name">{job.name}</div>
        <div className="cron-schedule">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span>{job.schedule}</span>
        </div>
        <div className="cron-next">
          {job.status === 'paused' ? 'Paused' : `Next run: ${job.nextRun || 'Unknown'}`}
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
