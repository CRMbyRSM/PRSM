// Static popout viewer for tool call output.
// Reads tool call data from localStorage (written by the main app before opening).

import { useState, useEffect } from 'react'
import { stripAnsi } from '../lib/openclaw'
import { resolveToolDisplay, extractToolDetail } from '../lib/openclaw/tool-display'
import { ToolIcon } from './ToolIcon'

interface StoredToolCall {
  toolCallId: string
  name: string
  phase: 'start' | 'result'
  result?: string
  args?: Record<string, unknown>
  startedAt: number
}

export function ToolCallViewer({ toolCallId }: { toolCallId: string }) {
  const [toolCall, setToolCall] = useState<StoredToolCall | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`toolcall-${toolCallId}`)
      if (!raw) {
        setError('Tool call data not found')
        return
      }
      setToolCall(JSON.parse(raw))
    } catch {
      setError('Failed to load tool call data')
    }
  }, [toolCallId])

  if (error) {
    return (
      <div className="toolcall-viewer" data-theme="dark">
        <div className="toolcall-viewer-header">
          <span className="toolcall-viewer-error">{error}</span>
        </div>
      </div>
    )
  }

  if (!toolCall) {
    return (
      <div className="toolcall-viewer" data-theme="dark">
        <div className="toolcall-viewer-header">
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  const display = resolveToolDisplay(toolCall.name)
  const detail = extractToolDetail(toolCall.name, toolCall.args)
  const isRunning = toolCall.phase === 'start'

  return (
    <div className="toolcall-viewer" data-theme="dark">
      <div className="toolcall-viewer-header">
        <div className="toolcall-viewer-title">
          <ToolIcon type={display.icon} size={18} />
          <span>{display.title}</span>
          {detail && <span className="toolcall-viewer-detail">{detail}</span>}
        </div>
        <div className={`toolcall-viewer-status ${isRunning ? 'running' : 'completed'}`}>
          <span className="status-dot-small" />
          {isRunning ? 'Running...' : 'Completed'}
        </div>
      </div>

      <div className="toolcall-viewer-body">
        {toolCall.args && Object.keys(toolCall.args).length > 0 && (
          <div className="toolcall-viewer-section">
            <h3 className="toolcall-viewer-section-title">Arguments</h3>
            <div className="toolcall-viewer-args">
              {Object.entries(toolCall.args).map(([key, value]) => (
                <div key={key} className="toolcall-viewer-arg">
                  <span className="toolcall-viewer-arg-key">{key}</span>
                  <pre className="toolcall-viewer-arg-value">
                    {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {toolCall.result && (
          <div className="toolcall-viewer-section">
            <h3 className="toolcall-viewer-section-title">Result</h3>
            <div className="toolcall-viewer-result">
              <pre>{stripAnsi(toolCall.result)}</pre>
            </div>
          </div>
        )}

        {!toolCall.result && !isRunning && (
          <div className="toolcall-viewer-section">
            <p className="toolcall-viewer-empty">No result available</p>
          </div>
        )}
      </div>
    </div>
  )
}
