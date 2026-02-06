import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { OpenClawClient, Message, Session, Agent, Skill, CronJob, AgentFile } from '../lib/openclaw-client'

interface AgentDetail {
  agent: Agent
  workspace: string
  files: AgentFile[]
}

interface AppState {
  // Theme
  theme: 'dark' | 'light'
  setTheme: (theme: 'dark' | 'light') => void
  toggleTheme: () => void

  // Connection
  serverUrl: string
  setServerUrl: (url: string) => void
  authMode: 'token' | 'password'
  setAuthMode: (mode: 'token' | 'password') => void
  gatewayToken: string
  setGatewayToken: (token: string) => void
  connected: boolean
  connecting: boolean
  client: OpenClawClient | null

  // Settings Modal
  showSettings: boolean
  setShowSettings: (show: boolean) => void

  // Certificate Error Modal
  showCertError: boolean
  certErrorUrl: string | null
  showCertErrorModal: (httpsUrl: string) => void
  hideCertErrorModal: () => void

  // UI State
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  rightPanelOpen: boolean
  setRightPanelOpen: (open: boolean) => void
  rightPanelTab: 'skills' | 'crons'
  setRightPanelTab: (tab: 'skills' | 'crons') => void

  // Main View State
  mainView: 'chat' | 'skill-detail' | 'cron-detail' | 'agent-detail'
  setMainView: (view: 'chat' | 'skill-detail' | 'cron-detail' | 'agent-detail') => void
  selectedSkill: Skill | null
  selectedCronJob: CronJob | null
  selectedAgentDetail: AgentDetail | null
  selectSkill: (skill: Skill) => Promise<void>
  selectCronJob: (cronJob: CronJob) => Promise<void>
  selectAgentForDetail: (agent: Agent) => Promise<void>
  closeDetailView: () => void
  toggleSkillEnabled: (skillId: string, enabled: boolean) => Promise<void>
  saveAgentFile: (agentId: string, fileName: string, content: string) => Promise<boolean>
  refreshAgentFiles: (agentId: string) => Promise<void>

  // Chat
  messages: Message[]
  addMessage: (message: Message) => void
  clearMessages: () => void
  isStreaming: boolean
  setIsStreaming: (streaming: boolean) => void
  thinkingEnabled: boolean
  setThinkingEnabled: (enabled: boolean) => void

  // Sessions
  sessions: Session[]
  currentSessionId: string | null
  setCurrentSession: (sessionId: string) => void
  createNewSession: () => Promise<void>
  deleteSession: (sessionId: string) => void
  updateSessionLabel: (sessionId: string, label: string) => Promise<void>

  // Agents
  agents: Agent[]
  currentAgentId: string | null
  setCurrentAgent: (agentId: string) => void

  // Skills & Crons
  skills: Skill[]
  cronJobs: CronJob[]

  // Actions
  initializeApp: () => Promise<void>
  connect: () => Promise<void>
  disconnect: () => void
  sendMessage: (content: string) => Promise<void>
  fetchSessions: () => Promise<void>
  fetchAgents: () => Promise<void>
  fetchSkills: () => Promise<void>
  fetchCronJobs: () => Promise<void>
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Theme
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

      // Connection
      serverUrl: '',
      setServerUrl: (url) => set({ serverUrl: url }),
      authMode: 'token',
      setAuthMode: (mode) => set({ authMode: mode }),
      gatewayToken: '',
      setGatewayToken: (token) => set({ gatewayToken: token }),
      connected: false,
      connecting: false,
      client: null,

      // Settings Modal
      showSettings: false,
      setShowSettings: (show) => set({ showSettings: show }),

      // Certificate Error Modal
      showCertError: false,
      certErrorUrl: null,
      showCertErrorModal: (httpsUrl) => set({ showCertError: true, certErrorUrl: httpsUrl }),
      hideCertErrorModal: () => set({ showCertError: false, certErrorUrl: null }),

      // UI State
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      rightPanelOpen: true,
      setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
      rightPanelTab: 'skills',
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

      // Main View State
      mainView: 'chat',
      setMainView: (view) => set({ mainView: view }),
      selectedSkill: null,
      selectedCronJob: null,
      selectedAgentDetail: null,
      selectSkill: async (skill) => {
        // All skill data comes from skills.status, no need for separate fetch
        set({ mainView: 'skill-detail', selectedSkill: skill, selectedCronJob: null, selectedAgentDetail: null })
      },
      selectCronJob: async (cronJob) => {
        const { client } = get()
        set({ mainView: 'cron-detail', selectedCronJob: cronJob, selectedSkill: null, selectedAgentDetail: null })

        // Fetch full cron job details including content
        if (client) {
          const details = await client.getCronJobDetails(cronJob.id)
          if (details) {
            set({ selectedCronJob: details })
          }
        }
      },
      selectAgentForDetail: async (agent) => {
        const { client } = get()
        set({ mainView: 'agent-detail', selectedAgentDetail: { agent, workspace: '', files: [] }, selectedSkill: null, selectedCronJob: null })

        if (client) {
          // Fetch workspace files
          const filesResult = await client.getAgentFiles(agent.id)
          if (filesResult) {
            // Fetch content for each file
            const filesWithContent: AgentFile[] = []
            for (const file of filesResult.files) {
              if (!file.missing) {
                const fileContent = await client.getAgentFile(agent.id, file.name)
                filesWithContent.push({
                  ...file,
                  content: fileContent?.content
                })
              } else {
                filesWithContent.push(file)
              }
            }
            set({
              selectedAgentDetail: {
                agent,
                workspace: filesResult.workspace,
                files: filesWithContent
              }
            })
          }
        }
      },
      closeDetailView: () => set({ mainView: 'chat', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null }),
      toggleSkillEnabled: async (skillId, enabled) => {
        const { client } = get()
        if (!client) return

        await client.toggleSkill(skillId, enabled)

        // Update local state
        set((state) => ({
          skills: state.skills.map((s) =>
            s.id === skillId ? { ...s, enabled } : s
          ),
          selectedSkill: state.selectedSkill?.id === skillId
            ? { ...state.selectedSkill, enabled }
            : state.selectedSkill
        }))
      },
      saveAgentFile: async (agentId, fileName, content) => {
        const { client } = get()
        if (!client) return false

        const success = await client.setAgentFile(agentId, fileName, content)
        if (success) {
          // Update local state
          set((state) => {
            if (!state.selectedAgentDetail) return state
            return {
              selectedAgentDetail: {
                ...state.selectedAgentDetail,
                files: state.selectedAgentDetail.files.map((f) =>
                  f.name === fileName ? { ...f, content, missing: false } : f
                )
              }
            }
          })

          // Refresh agents list to update identity
          await get().fetchAgents()
        }
        return success
      },
      refreshAgentFiles: async (agentId) => {
        const { client, selectedAgentDetail } = get()
        if (!client || !selectedAgentDetail) return

        const filesResult = await client.getAgentFiles(agentId)
        if (filesResult) {
          const filesWithContent: AgentFile[] = []
          for (const file of filesResult.files) {
            if (!file.missing) {
              const fileContent = await client.getAgentFile(agentId, file.name)
              filesWithContent.push({
                ...file,
                content: fileContent?.content
              })
            } else {
              filesWithContent.push(file)
            }
          }
          set({
            selectedAgentDetail: {
              ...selectedAgentDetail,
              workspace: filesResult.workspace,
              files: filesWithContent
            }
          })
        }
      },

      // Chat
      messages: [],
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      clearMessages: () => set({ messages: [] }),
      isStreaming: false,
      setIsStreaming: (streaming) => set({ isStreaming: streaming }),
      thinkingEnabled: false,
      setThinkingEnabled: (enabled) => set({ thinkingEnabled: enabled }),

      // Sessions
      sessions: [],
      currentSessionId: null,
      setCurrentSession: (sessionId) => {
        set({ currentSessionId: sessionId, messages: [] })
        // Load session messages
        get().client?.getSessionMessages(sessionId).then((messages) => {
          set({ messages })
        })
      },
      createNewSession: async () => {
        const { client, currentAgentId } = get()
        if (!client) return

        const session = await client.createSession(currentAgentId || undefined)
        set((state) => ({
          sessions: [session, ...state.sessions],
          currentSessionId: session.id,
          messages: []
        }))
      },
      deleteSession: (sessionId) => {
        const { client } = get()
        client?.deleteSession(sessionId)
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
          currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId
        }))
      },
      updateSessionLabel: async (sessionId, label) => {
        const { client } = get()
        if (!client) return

        await client.updateSession(sessionId, { label })
        set((state) => ({
          sessions: state.sessions.map((s) => 
            s.id === sessionId ? { ...s, title: label } : s
          )
        }))
      },

      // Agents
      agents: [],
      currentAgentId: null,
      setCurrentAgent: (agentId) => set({ currentAgentId: agentId }),

      // Skills & Crons
      skills: [],
      cronJobs: [],

      // Actions
      initializeApp: async () => {
        // Try to get config from electron (only use defaults if not already configured)
        if (window.electronAPI) {
          const config = await window.electronAPI.getConfig()
          const { serverUrl } = get()
          if (!serverUrl && config.defaultUrl) {
            set({ serverUrl: config.defaultUrl })
          }
          if (config.theme) {
            set({ theme: config.theme as 'dark' | 'light' })
          }
        }

        // Show settings if no URL or token configured
        const { serverUrl, gatewayToken } = get()
        if (!serverUrl || !gatewayToken) {
          set({ showSettings: true })
          return
        }

        // Auto-connect
        try {
          await get().connect()
        } catch {
          // Show settings on connection failure
          set({ showSettings: true })
        }
      },

      connect: async () => {
        const { serverUrl, gatewayToken } = get()

        // Show settings if URL is not configured
        if (!serverUrl) {
          set({ showSettings: true })
          return
        }

        set({ connecting: true })

        try {
          const { authMode } = get()
          const client = new OpenClawClient(serverUrl, gatewayToken, authMode)

          // Set up event handlers
          client.on('message', (msgArg: unknown) => {
            const message = msgArg as Message
            set((state) => {
              const exists = state.messages.some(m => m.id === message.id)
              if (exists) {
                return {
                  messages: state.messages.map(m => m.id === message.id ? message : m),
                  isStreaming: false // Final message received
                }
              }
              return { 
                messages: [...state.messages, message as Message],
                isStreaming: false
              }
            })
          })

          client.on('connected', () => {
            set({ connected: true, connecting: false })
          })

          client.on('disconnected', () => {
            set({ connected: false })
          })

          client.on('certError', (payload: unknown) => {
            const { httpsUrl } = payload as { url: string; httpsUrl: string }
            get().showCertErrorModal(httpsUrl)
          })

          client.on('streamStart', () => {
            set({ isStreaming: true })
          })

          client.on('streamChunk', (chunkArg: unknown) => {
            const chunk = String(chunkArg)
            // Skip empty chunks
            if (!chunk) return

            set((state) => {
              const messages = [...state.messages]
              const lastMessage = messages[messages.length - 1]

              if (lastMessage && lastMessage.role === 'assistant') {
                // Check if this chunk would create duplicate content
                // (handles case where full content is sent instead of delta)
                if (lastMessage.content.endsWith(chunk) || chunk.startsWith(lastMessage.content)) {
                  // This looks like full content, not a delta - replace instead of append
                  if (chunk.length > lastMessage.content.length) {
                    const updatedMessage = {
                      ...lastMessage,
                      content: chunk
                    }
                    messages[messages.length - 1] = updatedMessage
                    return { messages, isStreaming: true }
                  }
                  // Chunk is same or subset of existing content, skip
                  return state
                }

                // Append to existing assistant message
                const updatedMessage = {
                  ...lastMessage,
                  content: lastMessage.content + chunk
                }
                messages[messages.length - 1] = updatedMessage
                return { messages, isStreaming: true }
              } else {
                // Create new assistant placeholder
                const newMessage: Message = {
                  id: `streaming-${Date.now()}`,
                  role: 'assistant',
                  content: chunk,
                  timestamp: new Date().toISOString()
                }
                return { messages: [...messages, newMessage], isStreaming: true }
              }
            })
          })

          client.on('streamEnd', () => {
            set({ isStreaming: false })
          })

          await client.connect()
          set({ client })

          // Fetch initial data
          await Promise.all([
            get().fetchSessions(),
            get().fetchAgents(),
            get().fetchSkills(),
            get().fetchCronJobs()
          ])
        } catch {
          set({ connecting: false, connected: false })
        }
      },

      disconnect: () => {
        const { client } = get()
        client?.disconnect()
        set({ client: null, connected: false })
      },

      sendMessage: async (content: string) => {
        const { client, currentSessionId, thinkingEnabled, currentAgentId } = get()
        if (!client || !content.trim()) return

        // Add user message immediately
        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content,
          timestamp: new Date().toISOString()
        }
        set((state) => ({ messages: [...state.messages, userMessage] }))

        // Send to server
        await client.sendMessage({
          sessionId: currentSessionId || undefined,
          content,
          agentId: currentAgentId || undefined,
          thinking: thinkingEnabled
        })
      },

      fetchSessions: async () => {
        const { client } = get()
        if (!client) return
        const sessions = await client.listSessions()
        set({ sessions })
      },

      fetchAgents: async () => {
        const { client } = get()
        if (!client) return
        const agents = await client.listAgents()
        set({ agents })
        if (agents.length > 0 && !get().currentAgentId) {
          set({ currentAgentId: agents[0].id })
        }
      },

      fetchSkills: async () => {
        const { client } = get()
        if (!client) return
        const skills = await client.listSkills()
        set({ skills })
      },

      fetchCronJobs: async () => {
        const { client } = get()
        if (!client) return
        const cronJobs = await client.listCronJobs()
        set({ cronJobs })
      }
    }),
    {
  name: 'clawcontrol-storage',
      partialize: (state) => ({
        theme: state.theme,
        serverUrl: state.serverUrl,
        authMode: state.authMode,
        gatewayToken: state.gatewayToken,
        sidebarCollapsed: state.sidebarCollapsed,
        thinkingEnabled: state.thinkingEnabled
      })
    }
  )
)
