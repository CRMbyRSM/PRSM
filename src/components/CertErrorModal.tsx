import { useStore } from '../store'
import { trustHost, openExternal, getPlatform } from '../lib/platform'

export function CertErrorModal() {
  const { showCertError, certErrorUrl, hideCertErrorModal, connect } = useStore()

  if (!showCertError || !certErrorUrl) return null

  const handleTrustCert = async () => {
    try {
      const url = new URL(certErrorUrl)
      const hostname = url.hostname
      const platform = getPlatform()

      if (platform === 'electron') {
        const result = await trustHost(hostname)
        if (result.trusted) {
          hideCertErrorModal()
          await connect()
        }
      } else {
        // On mobile/web, open the URL in browser so the user can accept the cert
        await openExternal(certErrorUrl)
      }
    } catch {
      // Trust failed - modal stays open, user can retry or cancel
    }
  }

  return (
    <div className="modal-overlay" onClick={hideCertErrorModal}>
      <div className="modal cert-error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Certificate Error</h2>
          <button className="modal-close" onClick={hideCertErrorModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="cert-error-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <p className="cert-error-message">
            The server is using a self-signed or untrusted certificate.
          </p>

          <div className="cert-error-url">
            <code>{certErrorUrl}</code>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={hideCertErrorModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleTrustCert}>
            Trust Certificate & Connect
          </button>
        </div>
      </div>
    </div>
  )
}
