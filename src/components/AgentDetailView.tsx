import { useState } from 'react'
import { useStore } from '../store'

export function AgentDetailView() {
  const { selectedAgentDetail, closeDetailView, saveAgentFile, refreshAgentFiles } = useStore()
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  if (!selectedAgentDetail) return null

  const { agent, workspace, files } = selectedAgentDetail

  const handleEditFile = (fileName: string, content: string) => {
    setEditingFile(fileName)
    setEditContent(content || '')
  }

  const handleSave = async () => {
    if (!editingFile) return
    setSaving(true)
    try {
      await saveAgentFile(agent.id, editingFile, editContent)
      setEditingFile(null)
      setEditContent('')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditingFile(null)
    setEditContent('')
  }

  const handleRefresh = async () => {
    await refreshAgentFiles(agent.id)
  }

  const getAvatarDisplayValue = () => {
    if (!agent.avatar) return null
    if (agent.avatar.startsWith('data:')) return '(data URI)'
    return agent.avatar
  }

  return (
    <div className="detail-view">
      <div className="detail-content">
        {/* Agent Profile Section */}
        <section className="detail-section agent-profile-section">
          <div className="agent-profile-header">
            <button className="detail-back" onClick={closeDetailView} aria-label="Back to chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </button>
            <button className="refresh-button" onClick={handleRefresh} title="Refresh files">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
            </button>
          </div>

          <div className="agent-profile-content">
            <div className="agent-avatar-large-container">
              {agent.avatar ? (
                <img
                  src={agent.avatar}
                  alt={agent.name}
                  className="agent-avatar-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    target.parentElement?.classList.add('avatar-error')
                  }}
                />
              ) : agent.emoji ? (
                <span className="agent-emoji-full">{agent.emoji}</span>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </div>

            <div className="agent-profile-info">
              <h1 className="agent-profile-name">{agent.name}</h1>
              {agent.theme && <p className="agent-profile-theme">{agent.theme}</p>}

              <div className="agent-profile-meta">
                <div className="agent-meta-item">
                  <span className="agent-meta-label">ID</span>
                  <span className="agent-meta-value">{agent.id}</span>
                </div>
                <div className="agent-meta-item">
                  <span className="agent-meta-label">Status</span>
                  <span className={`agent-meta-value status-${agent.status}`}>{agent.status}</span>
                </div>
                {agent.emoji && (
                  <div className="agent-meta-item">
                    <span className="agent-meta-label">Emoji</span>
                    <span className="agent-meta-value">{agent.emoji}</span>
                  </div>
                )}
                {agent.avatar && (
                  <div className="agent-meta-item">
                    <span className="agent-meta-label">Avatar</span>
                    <span className="agent-meta-value avatar-url" title={agent.avatar}>
                      {getAvatarDisplayValue()}
                    </span>
                  </div>
                )}
              </div>

              {!agent.avatar && (
                <p className="avatar-hint">
                  To set an avatar, edit <code>IDENTITY.md</code> below and set the Avatar field to an HTTP URL,
                  data URI, or a workspace-relative path like <code>avatars/agent.png</code>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Workspace Section */}
        <section className="detail-section">
          <h2>Workspace</h2>
          <code className="file-path">{workspace}</code>
        </section>

        {/* Files Section */}
        <section className="detail-section">
          <h2>Configuration Files</h2>
          <div className="agent-files-list">
            {files.map((file) => (
              <div key={file.name} className={`agent-file-card ${file.missing ? 'missing' : ''}`}>
                <div className="agent-file-header">
                  <div className="agent-file-info">
                    <span className="agent-file-name">{file.name}</span>
                    {file.missing ? (
                      <span className="agent-file-status missing">Not created</span>
                    ) : (
                      <span className="agent-file-status exists">
                        {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'exists'}
                      </span>
                    )}
                  </div>
                  <button
                    className="edit-file-button"
                    onClick={() => handleEditFile(file.name, file.content || '')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    {file.missing ? 'Create' : 'Edit'}
                  </button>
                </div>

                {editingFile === file.name ? (
                  <div className="agent-file-editor">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="agent-file-textarea"
                      placeholder={`Enter content for ${file.name}...`}
                      rows={15}
                    />
                    <div className="agent-file-editor-actions">
                      <button className="cancel-button" onClick={handleCancel} disabled={saving}>
                        Cancel
                      </button>
                      <button className="save-button" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : file.content && !file.missing ? (
                  <pre className="agent-file-preview">{file.content}</pre>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
