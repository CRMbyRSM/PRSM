import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '../store'

export function CronJobDetailView() {
  const { selectedCronJob, closeDetailView, client, fetchCronJobs } = useStore()

  if (!selectedCronJob) return null

  const handleToggle = async () => {
    if (!client) return
    await client.toggleCronJob(selectedCronJob.id, selectedCronJob.status === 'paused')
    await fetchCronJobs()
  }

  const isActive = selectedCronJob.status === 'active'

  return (
    <div className="detail-view">
      <div className="detail-header">
        <button className="detail-back" onClick={closeDetailView} aria-label="Back to chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>Back</span>
        </button>
        <div className="detail-title-section">
          <div className="detail-icon cron-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div>
            <h1 className="detail-title">{selectedCronJob.name}</h1>
            {selectedCronJob.description && (
              <p className="detail-subtitle">{selectedCronJob.description}</p>
            )}
          </div>
        </div>
        <div className="detail-actions">
          <div className={`status-badge ${isActive ? 'enabled' : 'disabled'}`}>
            {isActive ? 'Active' : 'Paused'}
          </div>
          <button
            className={`toggle-button ${isActive ? 'active' : ''}`}
            onClick={handleToggle}
            aria-label={isActive ? 'Pause cron job' : 'Resume cron job'}
          >
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
          </button>
        </div>
      </div>

      <div className="detail-meta">
        <div className="meta-section">
          <h3>Schedule</h3>
          <div className="schedule-display">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="schedule-expression">{selectedCronJob.schedule}</span>
          </div>
        </div>
        {selectedCronJob.nextRun && isActive && (
          <div className="meta-section">
            <h3>Next Run</h3>
            <div className="next-run-display">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span>{selectedCronJob.nextRun}</span>
            </div>
          </div>
        )}
      </div>

      <div className="detail-content">
        {selectedCronJob.content ? (
          <div className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {selectedCronJob.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="empty-content">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>No documentation available for this cron job.</p>
          </div>
        )}
      </div>
    </div>
  )
}
