import { useStore } from '../store'

export function CertErrorModal() {
  const { showCertError, certErrorUrl, hideCertErrorModal } = useStore()

  if (!showCertError || !certErrorUrl) return null

  const handleOpenUrl = () => {
    window.open(certErrorUrl, '_blank')
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
            The server is using a self-signed certificate that your browser doesn't trust.
          </p>

          <div className="cert-error-steps">
            <h3>To fix this:</h3>
            <ol>
              <li>Click the button below to open the server URL</li>
              <li>Accept the certificate warning in your browser</li>
              <li>Close that tab and try connecting again</li>
            </ol>
          </div>

          <div className="cert-error-url">
            <code>{certErrorUrl}</code>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={hideCertErrorModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleOpenUrl}>
            Open URL to Accept Certificate
          </button>
        </div>
      </div>
    </div>
  )
}
