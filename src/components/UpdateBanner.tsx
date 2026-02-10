import { useState, useEffect } from 'react'
import { useStore } from '../store'
import * as Platform from '../lib/platform'

export function UpdateBanner() {
  const {
    availableUpdate,
    setAvailableUpdate,
    updateDownloaded,
    setUpdateDownloaded,
    updatePolicy,
    lastUpdateCheck
  } = useStore()

  const [dismissed, setDismissed] = useState(false)

  // Listen for update events from the main process
  useEffect(() => {
    Platform.onUpdateAvailable((info) => {
      setAvailableUpdate(info)
      setDismissed(false)
    })

    Platform.onUpdateDownloaded(() => {
      setUpdateDownloaded(true)
      setDismissed(false)
    })

    Platform.onUpdateError((err) => {
      console.error('[ClawControlRSM] Update error:', err)
    })
  }, [setAvailableUpdate, setUpdateDownloaded])

  // Sync update policy to main process whenever it changes
  useEffect(() => {
    Platform.syncUpdatePolicy(updatePolicy, lastUpdateCheck).catch(() => {})
  }, [updatePolicy, lastUpdateCheck])

  const handleDownload = async () => {
    try {
      await Platform.downloadUpdate()
    } catch (err) {
      console.error('[ClawControlRSM] Download update failed:', err)
    }
  }

  const handleInstall = () => {
    Platform.installUpdate().catch(() => {})
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  // Nothing to show
  if (!availableUpdate || dismissed) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      padding: '6px 16px',
      backgroundColor: 'var(--accent, #58a6ff)',
      color: '#fff',
      fontSize: '0.85rem',
      fontWeight: 500,
      lineHeight: '1.4',
      minHeight: '32px',
      flexShrink: 0
    }}>
      {updateDownloaded ? (
        <>
          <span>Update v{availableUpdate.version} ready — Restart to install</span>
          <button
            onClick={handleInstall}
            style={{
              padding: '2px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600
            }}
          >
            Restart Now
          </button>
          <button
            onClick={handleDismiss}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            Later
          </button>
        </>
      ) : (
        <>
          <span>Update v{availableUpdate.version} available</span>
          <button
            onClick={handleDownload}
            style={{
              padding: '2px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600
            }}
          >
            Download
          </button>
          <button
            onClick={handleDismiss}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            ✕
          </button>
        </>
      )}
    </div>
  )
}
