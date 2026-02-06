import { useStore } from '../store'

export function SkillDetailView() {
  const { selectedSkill, closeDetailView, toggleSkillEnabled, client, fetchSkills } = useStore()

  if (!selectedSkill) return null

  const handleToggle = async () => {
    await toggleSkillEnabled(selectedSkill.id, !selectedSkill.enabled)
  }

  const handleInstall = async (installId: string) => {
    if (!client) return
    try {
      await client.installSkill(selectedSkill.name, installId)
      await fetchSkills()
    } catch (err) {
      console.error('Install failed:', err)
    }
  }

  const hasMissingDeps = selectedSkill.missing && (
    selectedSkill.missing.bins.length > 0 ||
    selectedSkill.missing.env.length > 0 ||
    selectedSkill.missing.config.length > 0
  )

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
          <div className="detail-icon skill-icon">
            {selectedSkill.emoji ? (
              <span className="skill-emoji">{selectedSkill.emoji}</span>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
              </svg>
            )}
          </div>
          <div>
            <h1 className="detail-title">{selectedSkill.name}</h1>
            <p className="detail-subtitle">{selectedSkill.description}</p>
          </div>
        </div>
        <div className="detail-actions">
          <div className={`status-badge ${selectedSkill.enabled ? 'enabled' : 'disabled'}`}>
            {selectedSkill.enabled ? 'Enabled' : 'Disabled'}
          </div>
          <button
            className={`toggle-button ${selectedSkill.enabled ? 'active' : ''}`}
            onClick={handleToggle}
            aria-label={selectedSkill.enabled ? 'Disable skill' : 'Enable skill'}
          >
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
          </button>
        </div>
      </div>

      <div className="detail-content">
        {/* Status Section */}
        <section className="detail-section">
          <h2>Status</h2>
          <div className="status-grid">
            <div className="status-item">
              <span className="status-label">Eligible</span>
              <span className={`status-value ${selectedSkill.eligible ? 'success' : 'warning'}`}>
                {selectedSkill.eligible ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">Source</span>
              <span className="status-value">{selectedSkill.source || 'Unknown'}</span>
            </div>
            {selectedSkill.bundled !== undefined && (
              <div className="status-item">
                <span className="status-label">Bundled</span>
                <span className="status-value">{selectedSkill.bundled ? 'Yes' : 'No'}</span>
              </div>
            )}
            {selectedSkill.always !== undefined && (
              <div className="status-item">
                <span className="status-label">Always Active</span>
                <span className="status-value">{selectedSkill.always ? 'Yes' : 'No'}</span>
              </div>
            )}
          </div>
        </section>

        {/* Homepage Link */}
        {selectedSkill.homepage && (
          <section className="detail-section">
            <h2>Documentation</h2>
            <a href={selectedSkill.homepage} target="_blank" rel="noopener noreferrer" className="homepage-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
              {selectedSkill.homepage}
            </a>
          </section>
        )}

        {/* Requirements Section */}
        {selectedSkill.requirements && (
          <section className="detail-section">
            <h2>Requirements</h2>
            <div className="requirements-list">
              {selectedSkill.requirements.bins.length > 0 && (
                <div className="requirement-group">
                  <h3>Required Binaries</h3>
                  <div className="requirement-items">
                    {selectedSkill.requirements.bins.map((bin) => {
                      const isMissing = selectedSkill.missing?.bins.includes(bin)
                      return (
                        <span key={bin} className={`requirement-badge ${isMissing ? 'missing' : 'satisfied'}`}>
                          {isMissing ? '✗' : '✓'} {bin}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
              {selectedSkill.requirements.env.length > 0 && (
                <div className="requirement-group">
                  <h3>Environment Variables</h3>
                  <div className="requirement-items">
                    {selectedSkill.requirements.env.map((envVar) => {
                      const isMissing = selectedSkill.missing?.env.includes(envVar)
                      return (
                        <span key={envVar} className={`requirement-badge ${isMissing ? 'missing' : 'satisfied'}`}>
                          {isMissing ? '✗' : '✓'} {envVar}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
              {selectedSkill.requirements.config.length > 0 && (
                <div className="requirement-group">
                  <h3>Configuration</h3>
                  <div className="requirement-items">
                    {selectedSkill.requirements.config.map((cfg) => {
                      const isMissing = selectedSkill.missing?.config.includes(cfg)
                      return (
                        <span key={cfg} className={`requirement-badge ${isMissing ? 'missing' : 'satisfied'}`}>
                          {isMissing ? '✗' : '✓'} {cfg}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
              {selectedSkill.requirements.os.length > 0 && (
                <div className="requirement-group">
                  <h3>Operating System</h3>
                  <div className="requirement-items">
                    {selectedSkill.requirements.os.map((os) => (
                      <span key={os} className="requirement-badge satisfied">
                        {os}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Install Options */}
        {hasMissingDeps && selectedSkill.install && selectedSkill.install.length > 0 && (
          <section className="detail-section">
            <h2>Install Missing Dependencies</h2>
            <div className="install-options">
              {selectedSkill.install.map((option) => (
                <button
                  key={option.id}
                  className="install-button"
                  onClick={() => handleInstall(option.id)}
                >
                  <div className="install-info">
                    <span className="install-label">{option.label}</span>
                    <span className="install-kind">{option.kind}</span>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Triggers Section */}
        {selectedSkill.triggers && selectedSkill.triggers.length > 0 && (
          <section className="detail-section">
            <h2>Triggers</h2>
            <div className="triggers-list">
              {selectedSkill.triggers.map((trigger, index) => (
                <span key={trigger || index} className="trigger-badge large">
                  {trigger}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* File Path (for debugging/reference) */}
        {selectedSkill.filePath && (
          <section className="detail-section muted">
            <h2>Skill Location</h2>
            <code className="file-path">{selectedSkill.filePath}</code>
          </section>
        )}
      </div>
    </div>
  )
}
