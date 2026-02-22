import { useState } from 'react'
import { useStore } from '../store'

export function CreateCronJobView() {
    const { client, closeDetailView, fetchCronJobs } = useStore()
    const [name, setName] = useState('')
    const [schedule, setSchedule] = useState('0 * * * *')
    const [scriptContent, setScriptContent] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleCreate = async () => {
        if (!client) return
        if (!name.trim() || !schedule.trim() || !scriptContent.trim()) {
            setError('Please fill in all fields')
            return
        }

        try {
            setLoading(true)
            setError(null)
            await client.addCronJob({
                name,
                schedule,
                content: scriptContent,
                status: 'active'
            })
            await fetchCronJobs()
            closeDetailView()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create cron job')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="create-agent-view">
            <div className="detail-header">
                <button className="detail-back" onClick={closeDetailView}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    <span>Back</span>
                </button>
                <div className="detail-title-section">
                    <div>
                        <h1 className="detail-title">Create Cron Job</h1>
                        <p className="detail-subtitle">Schedule recurring tasks for OpenClaw</p>
                    </div>
                </div>
            </div>

            <div className="create-agent-content">
                {error && <div className="settings-error">{error}</div>}

                <div className="create-agent-section">
                    <h3>Job Name</h3>
                    <p className="section-description">A unique name to identify this cron job.</p>
                    <input
                        type="text"
                        className="settings-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Daily Cleanup"
                        autoFocus
                    />
                </div>

                <div className="create-agent-section">
                    <h3>Schedule (CRON Expression)</h3>
                    <p className="section-description">Define when the job should run (e.g., '0 * * * *' for every hour).</p>
                    <input
                        type="text"
                        className="settings-input"
                        value={schedule}
                        onChange={(e) => setSchedule(e.target.value)}
                        placeholder="0 0 * * *"
                    />
                </div>

                <div className="create-agent-section">
                    <h3>Script Content</h3>
                    <p className="section-description">The script to execute. Use the OpenClaw API or node.js code depending on your setup.</p>
                    <textarea
                        className="settings-textarea"
                        style={{ height: '200px', fontFamily: 'monospace' }}
                        value={scriptContent}
                        onChange={(e) => setScriptContent(e.target.value)}
                        placeholder="console.log('Running cron task...');"
                    />
                </div>

                <div className="create-agent-actions">
                    <button className="settings-button secondary" onClick={closeDetailView}>
                        Cancel
                    </button>
                    <button
                        className="settings-button primary"
                        onClick={handleCreate}
                        disabled={loading || !name.trim() || !schedule.trim() || !scriptContent.trim()}
                    >
                        {loading ? 'Creating...' : 'Create Cron Job'}
                    </button>
                </div>
            </div>
        </div>
    )
}
