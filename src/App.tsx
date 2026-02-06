import { useEffect } from 'react'
import { useStore } from './store'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import { TopBar } from './components/TopBar'
import { RightPanel } from './components/RightPanel'
import { InputArea } from './components/InputArea'
import { SettingsModal } from './components/SettingsModal'
import { CertErrorModal } from './components/CertErrorModal'
import { SkillDetailView } from './components/SkillDetailView'
import { CronJobDetailView } from './components/CronJobDetailView'

function App() {
  const { theme, initializeApp, sidebarOpen, rightPanelOpen, mainView } = useStore()

  useEffect(() => {
    initializeApp()
  }, [initializeApp])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className="app">
      <Sidebar />

      <main className="main-content">
        <TopBar />
        {mainView === 'chat' && (
          <>
            <ChatArea />
            <InputArea />
          </>
        )}
        {mainView === 'skill-detail' && <SkillDetailView />}
        {mainView === 'cron-detail' && <CronJobDetailView />}
      </main>

      <RightPanel />

      {/* Overlay for mobile */}
      <div
        className={`overlay ${sidebarOpen || rightPanelOpen ? 'active' : ''}`}
        onClick={() => {
          useStore.getState().setSidebarOpen(false)
          useStore.getState().setRightPanelOpen(false)
        }}
      />

      {/* Settings Modal */}
      <SettingsModal />

      {/* Certificate Error Modal */}
      <CertErrorModal />
    </div>
  )
}

export default App
