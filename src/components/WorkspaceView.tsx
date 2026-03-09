import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { safe } from '../lib/safe-render'
import * as Platform from '../lib/platform'

interface WorkspaceFileItem {
  id: string
  label: string
  group: 'core' | 'projects' | 'skills'
  agentId: string
  fileName: string
  path?: string
  description?: string
}

export function WorkspaceView() {
  const {
    client,
    openServerSettings
  } = useStore()

  const [workspaceFiles, setWorkspaceFiles] = useState<Array<{ path: string; name: string; group: 'core' | 'projects' | 'skills'; description?: string }>>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedContent, setSelectedContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [selectedMissing, setSelectedMissing] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingContent, setLoadingContent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [filter, setFilter] = useState('')
  const [activeGroup, setActiveGroup] = useState<'core' | 'projects' | 'skills'>('core')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const isDirty = selectedContent !== savedContent
  const items = useMemo(() => itemsFromWorkspaceFiles(workspaceFiles), [workspaceFiles])
  const selectedItem = useMemo(() => items.find((item) => item.id === selectedItemId) || null, [items, selectedItemId])

  useEffect(() => {
    if (!client) return
    let cancelled = false
    const load = async () => {
      setLoadingList(true)
      try {
        const files = await client.listWorkspaceFiles()
        if (cancelled) return
        setWorkspaceFiles(files)
      } finally {
        if (!cancelled) setLoadingList(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [client])

  const groupedItems = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const filtered = q
      ? items.filter((item) => item.label.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q))
      : items

    return {
      core: filtered.filter((item) => item.group === 'core'),
      projects: filtered.filter((item) => item.group === 'projects'),
      skills: filtered.filter((item) => item.group === 'skills')
    }
  }, [items, filter])

  const activeItems = groupedItems[activeGroup]

  useEffect(() => {
    if (!selectedItemId && items.length > 0) {
      setSelectedItemId(items[0].id)
      setActiveGroup(items[0].group)
    }
  }, [items, selectedItemId])

  useEffect(() => {
    const loadContent = async () => {
      if (!selectedItem) return
      setLoadingContent(true)
      setSaveState('idle')
      try {
        const bridgePath = getWorkspaceBridgePath(selectedItem)
        const canUseBridge = Platform.isDesktopBridgeAvailable() && bridgePath !== null

        if (canUseBridge) {
          const bridgeResult = await Platform.readWorkspaceFile(bridgePath).catch(() => null)
          if (bridgeResult) {
            const content = bridgeResult.content || ''
            setSelectedContent(content)
            setSavedContent(content)
            setSelectedMissing(Boolean(bridgeResult.missing))
            return
          }
        }

        if (!client) {
          setSelectedContent('')
          setSavedContent('')
          setSelectedMissing(true)
          return
        }

        const result = await client.getAgentFile(selectedItem.agentId, selectedItem.fileName)
        const content = result?.content || ''
        setSelectedContent(content)
        setSavedContent(content)
        setSelectedMissing(Boolean(result?.missing))
      } finally {
        setLoadingContent(false)
      }
    }
    loadContent()
  }, [client, selectedItem])

  const handleSelect = (id: string) => {
    if (id === selectedItemId) {
      setMobileNavOpen(false)
      return
    }
    const nextItem = items.find((item) => item.id === id)
    if (!nextItem) return
    if (isDirty) {
      const shouldDiscard = window.confirm('Discard unsaved changes and switch files?')
      if (!shouldDiscard) return
    }
    setSelectedItemId(id)
    setActiveGroup(nextItem.group)
    setMobileNavOpen(false)
  }

  const handleSave = async () => {
    if (!selectedItem) return
    setSaving(true)
    setSaveState('idle')
    try {
      let ok = false

      const bridgePath = getWorkspaceBridgePath(selectedItem)
      if (Platform.isDesktopBridgeAvailable() && bridgePath !== null) {
        const bridgeResult = await Platform.writeWorkspaceFile(bridgePath, selectedContent).catch(() => null)
        ok = Boolean(bridgeResult?.ok)
      }

      if (!ok && client) {
        ok = await client.setAgentFile(selectedItem.agentId, selectedItem.fileName, selectedContent)
      }

      setSaveState(ok ? 'saved' : 'error')
      if (ok) {
        setSavedContent(selectedContent)
        setSelectedMissing(false)
      }
    } catch {
      setSaveState('error')
    } finally {
      setSaving(false)
    }
  }

  const handleRevert = () => {
    setSelectedContent(savedContent)
    setSaveState('idle')
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      handleSave()
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const target = event.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const nextValue = `${selectedContent.slice(0, start)}  ${selectedContent.slice(end)}`
      setSelectedContent(nextValue)
      queueMicrotask(() => {
        target.selectionStart = target.selectionEnd = start + 2
      })
    }
  }

  return (
    <div className="surface-view workspace-surface">
      <div className="surface-header">
        <div>
          <div className="surface-eyebrow">Workspace</div>
          <h1>Files & context</h1>
          <p>Fast access to core docs, project memory, and skills with safer gateway-backed editing.</p>
        </div>
        <div className="workspace-header-actions">
          <button className="surface-link-btn workspace-mobile-nav-toggle" onClick={() => setMobileNavOpen((value) => !value)}>
            {mobileNavOpen ? 'Hide files' : 'Browse files'}
          </button>
          <button className="surface-link-btn" onClick={openServerSettings}>Server settings</button>
        </div>
      </div>

      <div className="workspace-quick-strip" role="tablist" aria-label="Workspace groups">
        <button className={`surface-subnav-btn ${activeGroup === 'core' ? 'active' : ''}`} onClick={() => setActiveGroup('core')}>Core docs</button>
        <button className={`surface-subnav-btn ${activeGroup === 'projects' ? 'active' : ''}`} onClick={() => setActiveGroup('projects')}>Project files</button>
        <button className={`surface-subnav-btn ${activeGroup === 'skills' ? 'active' : ''}`} onClick={() => setActiveGroup('skills')}>Skill files</button>
      </div>

      <div className="workspace-layout">
        <aside className={`workspace-nav ${mobileNavOpen ? 'mobile-open' : ''}`}>
          <div className="workspace-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files…" />
          </div>

          <div className="workspace-active-group-summary">
            <div>
              <div className="workspace-group-title">Showing</div>
              <div className="workspace-active-group-name">{activeGroup === 'core' ? 'Core docs' : activeGroup === 'projects' ? 'Project files' : 'Skill files'}</div>
            </div>
            <span className="mini-badge neutral">{activeItems.length}</span>
          </div>

          <WorkspaceGroup title="Core docs" items={groupedItems.core} selectedItemId={selectedItemId} onSelect={handleSelect} hidden={activeGroup !== 'core'} emptyLabel={loadingList ? 'Loading core docs…' : 'No core docs found'} />
          <WorkspaceGroup title="Project files" items={groupedItems.projects} selectedItemId={selectedItemId} onSelect={handleSelect} hidden={activeGroup !== 'projects'} emptyLabel={loadingList ? 'Loading project files…' : 'No project files found'} />
          <WorkspaceGroup title="Skill files" items={groupedItems.skills} selectedItemId={selectedItemId} onSelect={handleSelect} hidden={activeGroup !== 'skills'} emptyLabel={loadingList ? 'Loading skills…' : 'No skill files found'} />
        </aside>

        <section className="workspace-editor-card">
          {selectedItem ? (
            <>
              <div className="workspace-editor-header">
                <div>
                  <div className="workspace-file-title">{safe(selectedItem.label)}</div>
                  <div className="workspace-file-meta">
                    {safe(selectedItem.description || selectedItem.group)}
                    {selectedItem.path ? ` • ${safe(selectedItem.path)}` : ''}
                    {selectedMissing ? ' • missing on server' : ''}
                  </div>
                </div>
                <div className="workspace-editor-actions">
                  <span className={`mini-badge ${isDirty ? 'warn' : selectedMissing ? 'warn' : 'ok'}`}>{isDirty ? 'unsaved' : selectedMissing ? 'missing' : 'ready'}</span>
                  <button className="surface-link-btn" onClick={handleRevert} disabled={!isDirty || saving || loadingContent}>Revert</button>
                  <button className="surface-primary-btn" onClick={handleSave} disabled={saving || loadingContent || !isDirty}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {loadingContent ? (
                <div className="workspace-loading">Loading file…</div>
              ) : (
                <>
                  <div className="workspace-editor-toolbar">
                    <span className="workspace-editor-shortcut">Cmd/Ctrl+S to save</span>
                    <span className="workspace-editor-shortcut">Tab inserts spaces</span>
                  </div>
                  <textarea
                    ref={editorRef}
                    className="workspace-editor"
                    value={selectedContent}
                    onChange={(e) => {
                      setSelectedContent(e.target.value)
                      setSaveState('idle')
                    }}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                  />
                  <div className="workspace-editor-footer">
                    <span>{selectedContent.length.toLocaleString()} chars</span>
                    <div className="workspace-editor-footer-right">
                      {saveState === 'saved' && <span className="workspace-save-state success">Saved</span>}
                      {saveState === 'error' && <span className="workspace-save-state error">Save failed</span>}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="workspace-loading">Select a file to begin.</div>
          )}
        </section>
      </div>
    </div>
  )
}

function getWorkspaceBridgePath(item: WorkspaceFileItem): string | null {
  if (item.path && item.path.trim()) return item.path
  return item.fileName
}

function itemsFromWorkspaceFiles(
  files: Array<{ path: string; name: string; group: 'core' | 'projects' | 'skills'; description?: string }>
): WorkspaceFileItem[] {
  return files.map((file) => ({
    id: `${file.group}:${file.path}`,
    label: file.group === 'projects' ? file.name.replace(/\.md$/i, '') : file.name,
    group: file.group,
    agentId: 'main',
    fileName: file.name,
    path: file.path,
    description: file.description || file.group
  }))
}

function WorkspaceGroup({
  title,
  items,
  selectedItemId,
  onSelect,
  hidden,
  emptyLabel = 'Nothing here yet'
}: {
  title: string
  items: WorkspaceFileItem[]
  selectedItemId: string | null
  onSelect: (id: string) => void
  hidden?: boolean
  emptyLabel?: string
}) {
  if (hidden) return null

  return (
    <div className="workspace-group">
      <div className="workspace-group-title">{title}</div>
      <div className="workspace-group-items">
        {items.length > 0 ? items.map((item) => (
          <button
            key={item.id}
            className={`workspace-nav-item ${selectedItemId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <div className="workspace-nav-label">{safe(item.label)}</div>
            {item.description && <div className="workspace-nav-meta">{safe(item.description)}</div>}
          </button>
        )) : <div className="surface-empty">{emptyLabel}</div>}
      </div>
    </div>
  )
}
