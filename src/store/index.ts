import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { OpenClawClient, Message, Session, Agent, Skill, CronJob, AgentFile, stripThinkingTags, CreateAgentParams } from '../lib/openclaw'
import type { ClawHubSkill, ClawHubSort } from '../lib/clawhub'
import { listClawHubSkills, searchClawHub, getClawHubSkill, getClawHubSkillVersion, getClawHubSkillConvex } from '../lib/clawhub'
import * as Platform from '../lib/platform'
import { deepSanitize } from '../lib/safe-render'
import type { MainView, SystemSubview } from '../lib/view-state'

// Cache for ClawHub stats (downloads/stars) to enrich search results
const _clawHubStatsCache = new Map<string, { downloads: number; stars: number }>()

export interface ToolCall {
  toolCallId: string
  name: string
  phase: 'start' | 'result'
  result?: string
  args?: Record<string, unknown>
  afterMessageId?: string
  startedAt: number
}

export interface SubagentInfo {
  sessionKey: string
  label: string
  status: 'running' | 'completed' | 'error'
  afterMessageId?: string
  startedAt: number
}

interface AgentDetail {
  agent: Agent
  workspace: string
  files: AgentFile[]
}

export interface PinnedMessage {
  id: string
  sessionId: string
  messageId: string
  content: string
  role: 'user' | 'assistant' | 'system'
  timestamp: string
  pinnedAt: string
  attachments?: Array<{ type: string; mimeType: string; content: string }>
}

interface AppState {
  // Theme
  theme: 'dark' | 'light'
  setTheme: (theme: 'dark' | 'light') => void
  toggleTheme: () => void

  // Connection
  bridgeUrl: string
  setBridgeUrl: (url: string) => void
  bridgeToken: string
  setBridgeToken: (token: string) => void
  connected: boolean
  connecting: boolean
  client: OpenClawClient | null

  // Settings Modal
  showSettings: boolean
  setShowSettings: (show: boolean) => void

  // UI State
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  rightPanelOpen: boolean
  setRightPanelOpen: (open: boolean) => void
  rightPanelTab: 'skills' | 'crons' | 'pins'
  setRightPanelTab: (tab: 'skills' | 'crons' | 'pins') => void
  collapsedSessionGroups: string[]
  toggleSessionGroup: (label: string) => void

  // Main View State
  mainView: MainView
  setMainView: (view: AppState['mainView']) => void
  lastSurfaceView: 'chat' | 'system' | 'workspace'
  systemSubview: SystemSubview
  setSystemSubview: (view: SystemSubview) => void
  selectedSkill: Skill | null
  selectedCronJob: CronJob | null
  selectedAgentDetail: AgentDetail | null
  selectSkill: (skill: Skill) => Promise<void>
  selectCronJob: (cronJob: CronJob) => Promise<void>
  selectAgentForDetail: (agent: Agent) => Promise<void>
  closeDetailView: () => void
  openServerSettings: () => void
  openSystemView: () => void
  openWorkspaceView: () => void
  openDashboard: () => void
  openUsage: () => void
  openCreateCron: () => void
  showCreateAgent: () => void
  createAgent: (params: CreateAgentParams) => Promise<{ success: boolean; error?: string }>
  deleteAgent: (agentId: string) => Promise<{ success: boolean; error?: string }>
  toggleSkillEnabled: (skillId: string, enabled: boolean) => Promise<void>
  saveAgentFile: (agentId: string, fileName: string, content: string) => Promise<boolean>
  refreshAgentFiles: (agentId: string) => Promise<void>

  // Chat
  messages: Message[]
  addMessage: (message: Message) => void
  clearMessages: () => void
  isStreaming: boolean
  setIsStreaming: (streaming: boolean) => void
  hadStreamChunks: boolean
  thinkingEnabled: boolean
  setThinkingEnabled: (enabled: boolean) => void
  streamingThinking: Record<string, string>
  compactingSession: string | null

  // Display Settings
  fontSize: number
  setFontSize: (size: number) => void

  // STT Settings
  sttUrl: string
  setSttUrl: (url: string) => void
  sttModel: string
  setSttModel: (model: string) => void
  sttApiKey: string
  setSttApiKey: (key: string) => void

  // Update Settings
  updatePolicy: 'instant' | 'daily' | 'weekly' | 'bugfix' | 'feature' | 'off'
  setUpdatePolicy: (policy: 'instant' | 'daily' | 'weekly' | 'bugfix' | 'feature' | 'off') => void
  lastUpdateCheck: number
  setLastUpdateCheck: (ts: number) => void
  availableUpdate: { version: string; releaseNotes: string } | null
  setAvailableUpdate: (update: { version: string; releaseNotes: string } | null) => void
  updateDownloaded: boolean
  setUpdateDownloaded: (downloaded: boolean) => void

  // Notifications & Unread
  notificationsEnabled: boolean
  setNotificationsEnabled: (enabled: boolean) => Promise<void>
  unreadCounts: Record<string, number>
  clearUnread: (sessionId: string) => void
  streamingSessionId: string | null

  // Sessions
  sessions: Session[]
  currentSessionId: string | null
  pendingSessionLabel: string | null
  setPendingSessionLabel: (label: string | null) => void
  setCurrentSession: (sessionId: string) => void
  createNewSession: () => Promise<void>
  deleteSession: (sessionId: string) => void
  updateSessionLabel: (sessionId: string, label: string) => Promise<void>
  spawnSubagentSession: (agentId: string, prompt?: string) => Promise<void>

  // Agents
  agents: Agent[]
  currentAgentId: string | null
  setCurrentAgent: (agentId: string) => void

  // Skills & Crons
  skills: Skill[]
  cronJobs: CronJob[]

  // ClawHub
  clawHubSkills: ClawHubSkill[]
  clawHubLoading: boolean
  clawHubSearchQuery: string
  clawHubSort: ClawHubSort
  selectedClawHubSkill: ClawHubSkill | null
  skillsSubTab: 'installed' | 'available'
  installingHubSkill: string | null
  installHubSkillError: string | null
  setSkillsSubTab: (tab: 'installed' | 'available') => void
  fetchClawHubSkills: () => Promise<void>
  searchClawHubSkills: (query: string) => Promise<void>
  setClawHubSort: (sort: ClawHubSort) => void
  selectClawHubSkill: (skill: ClawHubSkill) => void
  installClawHubSkill: (slug: string) => Promise<void>
  fetchClawHubSkillDetail: (slug: string) => Promise<void>

  // Pinned Messages
  pinnedMessages: PinnedMessage[]
  pinMessage: (sessionId: string, message: Message) => void
  unpinMessage: (pinId: string) => void
  isPinned: (sessionId: string, messageId: string) => boolean
  getPinsForSession: (sessionId: string) => PinnedMessage[]

  // Agent Busy & Message Queue
  agentBusy: boolean
  messageQueue: Array<{ id: string; content: string; timestamp: string; attachments?: Array<{type: string, mimeType: string, content: string}> }>
  removeFromQueue: (id: string) => void

  // Tool Calls & Subagents
  activeToolCalls: ToolCall[]
  activeSubagents: SubagentInfo[]
  abortChat: () => Promise<void>
  openSubagentPopout: (sessionKey: string) => void
  openToolCallPopout: (toolCallId: string) => void
  startSubagentPolling: () => void
  stopSubagentPolling: () => void

  // Actions
  initializeApp: () => Promise<void>
  connect: () => Promise<void>
  disconnect: () => void
  sendMessage: (content: string, attachments?: Array<{type: string, mimeType: string, content: string}>) => Promise<void>
  fetchSessions: () => Promise<void>
  fetchAgents: () => Promise<void>
  fetchSkills: () => Promise<void>
  fetchCronJobs: () => Promise<void>
}

// Module-level polling state (not persisted)
let _subagentPollTimer: ReturnType<typeof setInterval> | null = null
let _baselineSessionKeys: Set<string> | null = null

function finalizeStreamingMessage(messages: Message[]): { messages: Message[]; finalizedId: string | null } {
  if (messages.length === 0) return { messages, finalizedId: null }
  const last = messages[messages.length - 1]
  if (last.role !== 'assistant' || !last.id.startsWith('streaming-')) {
    return { messages, finalizedId: last.id }
  }
  const stableId = `msg-finalized-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const updated = [...messages]
  updated[updated.length - 1] = { ...last, id: stableId }
  return { messages: updated, finalizedId: stableId }
}

function shouldNotify(
  notificationsEnabled: boolean,
  msgSessionId: string | null,
  currentSessionId: string | null
): boolean {
  if (!notificationsEnabled) return false
  if (Platform.isAppActive() && msgSessionId === currentSessionId) return false
  return true
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Theme
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

      // Connection
      bridgeUrl: '',
      setBridgeUrl: (url) => set({ bridgeUrl: url }),
      bridgeToken: '',
      setBridgeToken: (token) => {
        set({ bridgeToken: token })
        Platform.saveToken(token).catch(() => {})
      },
      connected: false,
      connecting: false,
      client: null,

      // Settings Modal
      showSettings: false,
      setShowSettings: (show) => set({ showSettings: show }),

      // UI State
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      collapsedSessionGroups: [],
      toggleSessionGroup: (label) => set((state) => {
        const groups = state.collapsedSessionGroups
        return {
          collapsedSessionGroups: groups.includes(label)
            ? groups.filter(g => g !== label)
            : [...groups, label]
        }
      }),
      rightPanelOpen: !Platform.isMobile(),
      setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
      rightPanelTab: 'skills',
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

      // Main View State
      mainView: 'chat',
      lastSurfaceView: 'chat',
      systemSubview: 'overview',
      setMainView: (view) => set((state) => ({
        mainView: view,
        lastSurfaceView: view === 'chat' || view === 'system' || view === 'workspace' ? view : state.lastSurfaceView
      })),
      setSystemSubview: (view) => set({ systemSubview: view, mainView: 'system', lastSurfaceView: 'system' }),
      selectedSkill: null,
      selectedCronJob: null,
      selectedAgentDetail: null,
      selectSkill: async (skill) => {
        set({ mainView: 'skill-detail', selectedSkill: skill, selectedCronJob: null, selectedAgentDetail: null })
      },
      selectCronJob: async (cronJob) => {
        const { client } = get()
        set({ mainView: 'cron-detail', selectedCronJob: cronJob, selectedSkill: null, selectedAgentDetail: null })
        if (client) {
          const details = await client.getCronJobDetails(cronJob.id)
          if (details) set({ selectedCronJob: details })
        }
      },
      selectAgentForDetail: async (agent) => {
        const { client } = get()
        set({ mainView: 'agent-detail', selectedAgentDetail: { agent, workspace: '', files: [] }, selectedSkill: null, selectedCronJob: null })
        if (client) {
          const filesResult = await client.getAgentFiles(agent.id)
          if (filesResult) {
            const filesWithContent: AgentFile[] = []
            for (const file of filesResult.files) {
              if (!file.missing) {
                const fileContent = await client.getAgentFile(agent.id, file.name)
                filesWithContent.push({ ...file, content: fileContent?.content })
              } else {
                filesWithContent.push(file)
              }
            }
            set({ selectedAgentDetail: { agent, workspace: filesResult.workspace, files: filesWithContent } })
          }
        }
      },
      closeDetailView: () => set((state) => ({
        mainView: state.lastSurfaceView || 'chat',
        selectedSkill: null,
        selectedCronJob: null,
        selectedAgentDetail: null,
        selectedClawHubSkill: null
      })),
      openServerSettings: () => set({ mainView: 'server-settings', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null, selectedClawHubSkill: null }),
      openSystemView: () => set({ mainView: 'system', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null, selectedClawHubSkill: null }),
      openWorkspaceView: () => set({ mainView: 'workspace', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null, selectedClawHubSkill: null }),
      openDashboard: () => set({ mainView: 'pixel-dashboard', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null, selectedClawHubSkill: null }),
      openUsage: () => set({ mainView: 'usage', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null, selectedClawHubSkill: null }),
      openCreateCron: () => set({ mainView: 'create-cron', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null, selectedClawHubSkill: null }),
      showCreateAgent: () => set({ mainView: 'create-agent', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null, selectedClawHubSkill: null }),
      createAgent: async (params) => {
        const { client } = get()
        if (!client) return { success: false, error: 'Not connected' }
        try {
          const result = await client.createAgent({ name: params.name, workspace: params.workspace, model: params.model })
          if (!result?.ok) return { success: false, error: 'Server returned an error' }
          await get().fetchAgents()
          const newAgent = get().agents.find(a => a.id === result.agentId)
          if (newAgent) {
            set({ currentAgentId: result.agentId })
            await get().selectAgentForDetail(newAgent)
          } else {
            set({ mainView: 'chat' })
          }
          return { success: true }
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to create agent' }
        }
      },
      deleteAgent: async (agentId) => {
        const { client } = get()
        if (!client) return { success: false, error: 'Not connected' }
        try {
          const result = await client.deleteAgent(agentId)
          if (!result?.ok) return { success: false, error: 'Server returned an error' }
          const { currentAgentId, mainView, selectedAgentDetail } = get()
          if (currentAgentId === agentId) set({ currentAgentId: 'main' })
          if (mainView === 'agent-detail' && selectedAgentDetail?.agent.id === agentId) {
            set({ mainView: 'chat', selectedAgentDetail: null })
          }
          await get().fetchAgents()
          const { agents, currentAgentId: newAgentId } = get()
          if (newAgentId === agentId || !agents.some(a => a.id === newAgentId)) {
            set({ currentAgentId: agents[0]?.id || 'main' })
          }
          return { success: true }
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to delete agent' }
        }
      },
      toggleSkillEnabled: async (skillId, enabled) => {
        const { client } = get()
        if (!client) return
        await client.toggleSkill(skillId, enabled)
        set((state) => ({
          skills: state.skills.map((s) => s.id === skillId ? { ...s, enabled } : s),
          selectedSkill: state.selectedSkill?.id === skillId ? { ...state.selectedSkill, enabled } : state.selectedSkill
        }))
      },
      saveAgentFile: async (agentId, fileName, content) => {
        const { client } = get()
        if (!client) return false
        const success = await client.setAgentFile(agentId, fileName, content)
        if (success) {
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
              filesWithContent.push({ ...file, content: fileContent?.content })
            } else {
              filesWithContent.push(file)
            }
          }
          set({ selectedAgentDetail: { ...selectedAgentDetail, workspace: filesResult.workspace, files: filesWithContent } })
        }
      },

      // Chat
      messages: [],
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      clearMessages: () => set({ messages: [] }),
      isStreaming: false,
      setIsStreaming: (streaming) => set({ isStreaming: streaming }),
      hadStreamChunks: false,
      thinkingEnabled: false,
      setThinkingEnabled: (enabled) => set({ thinkingEnabled: enabled }),
      streamingThinking: {},
      compactingSession: null,

      // Display Settings
      fontSize: 100,
      setFontSize: (size) => {
        set({ fontSize: size })
        document.documentElement.style.fontSize = `${size}%`
      },

      // STT Settings
      sttUrl: '',
      setSttUrl: (url) => set({ sttUrl: url }),
      sttModel: '',
      setSttModel: (model) => set({ sttModel: model }),
      sttApiKey: '',
      setSttApiKey: (key) => set({ sttApiKey: key }),

      // Update Settings
      updatePolicy: 'daily',
      setUpdatePolicy: (policy) => set({ updatePolicy: policy }),
      lastUpdateCheck: 0,
      setLastUpdateCheck: (ts) => set({ lastUpdateCheck: ts }),
      availableUpdate: null,
      setAvailableUpdate: (update) => set({ availableUpdate: update }),
      updateDownloaded: false,
      setUpdateDownloaded: (downloaded) => set({ updateDownloaded: downloaded }),

      // Notifications & Unread
      notificationsEnabled: false,
      setNotificationsEnabled: async (enabled) => {
        if (enabled) {
          const granted = await Platform.requestNotificationPermission()
          if (!granted) return
        }
        set({ notificationsEnabled: enabled })
      },
      unreadCounts: {},
      clearUnread: (sessionId) => set((state) => {
        const { [sessionId]: _, ...rest } = state.unreadCounts
        return { unreadCounts: rest }
      }),
      streamingSessionId: null,

      // Sessions
      sessions: [],
      currentSessionId: null,
      pendingSessionLabel: null,
      setPendingSessionLabel: (label) => set({ pendingSessionLabel: label }),
      setCurrentSession: (sessionId) => {
        const { currentSessionId, unreadCounts, mainView } = get()
        if (sessionId === currentSessionId) {
          if (mainView !== 'chat') {
            set({ mainView: 'chat', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null, selectedClawHubSkill: null })
          }
          return
        }
        const { [sessionId]: _, ...restCounts } = unreadCounts
        get().client?.setPrimarySessionKey(null)
        get().stopSubagentPolling()
        set({
          currentSessionId: sessionId,
          messages: [],
          unreadCounts: restCounts,
          activeToolCalls: [],
          activeSubagents: [],
          mainView: 'chat',
          selectedSkill: null,
          selectedCronJob: null,
          selectedAgentDetail: null,
          selectedClawHubSkill: null
        })
        get().client?.getSessionMessages(sessionId).then((result) => {
          if (get().currentSessionId === sessionId) {
            set({ messages: deepSanitize(result.messages) })
          }
        })
      },
      createNewSession: async () => {
        set({
          currentSessionId: null,
          messages: [],
          isStreaming: false,
          hadStreamChunks: false,
          streamingSessionId: null
        })
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
        try {
          await client.updateSession(sessionId, { label })
          set((state) => ({
            sessions: state.sessions.map((s) => s.id === sessionId ? { ...s, title: label } : s)
          }))
        } catch (err) {
          console.error('[PRSM] updateSessionLabel failed:', err)
        }
      },
      spawnSubagentSession: async (agentId, prompt) => {
        const { client } = get()
        if (!client) return
        const session = await client.spawnSession(agentId, prompt)
        set((state) => ({
          sessions: [session, ...state.sessions],
          currentSessionId: session.id,
          messages: []
        }))
        const result = await client.getSessionMessages(session.id)
        if (result.messages.length > 0) {
          set({ messages: deepSanitize(result.messages) })
        }
      },

      // Agents
      agents: [],
      currentAgentId: null,
      setCurrentAgent: (agentId) => set({ currentAgentId: agentId }),

      // Skills & Crons
      skills: [],
      cronJobs: [],

      // ClawHub
      clawHubSkills: [],
      clawHubLoading: false,
      clawHubSearchQuery: '',
      clawHubSort: 'downloads' as ClawHubSort,
      selectedClawHubSkill: null,
      skillsSubTab: 'installed' as const,
      installingHubSkill: null,
      installHubSkillError: null,
      setSkillsSubTab: (tab: 'installed' | 'available') => {
        set({ skillsSubTab: tab })
        if (tab === 'available' && get().clawHubSkills.length === 0 && !get().clawHubLoading) {
          get().fetchClawHubSkills()
        }
      },
      fetchClawHubSkills: async () => {
        set({ clawHubLoading: true })
        try {
          const skills = await listClawHubSkills(get().clawHubSort)
          for (const s of skills) {
            _clawHubStatsCache.set(s.slug, { downloads: s.downloads, stars: s.stars })
          }
          set({ clawHubSkills: skills })
        } catch { /* fetch failed */ }
        set({ clawHubLoading: false })
      },
      searchClawHubSkills: async (query: string) => {
        set({ clawHubSearchQuery: query, clawHubLoading: true })
        try {
          let skills = query.trim()
            ? await searchClawHub(query)
            : await listClawHubSkills(get().clawHubSort)
          skills = skills.map(s => {
            const cached = _clawHubStatsCache.get(s.slug)
            if (cached && s.downloads === 0 && s.stars === 0) {
              return { ...s, downloads: cached.downloads, stars: cached.stars }
            }
            if (s.downloads > 0 || s.stars > 0) {
              _clawHubStatsCache.set(s.slug, { downloads: s.downloads, stars: s.stars })
            }
            return s
          })
          set({ clawHubSkills: skills })
        } catch { /* search failed */ }
        set({ clawHubLoading: false })
      },
      setClawHubSort: (sort: ClawHubSort) => {
        set({ clawHubSort: sort })
        get().fetchClawHubSkills()
      },
      selectClawHubSkill: (skill: ClawHubSkill) => {
        set({ mainView: 'clawhub-skill-detail', selectedClawHubSkill: skill, selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null })
      },
      installClawHubSkill: async (slug: string) => {
        set({ installingHubSkill: slug, installHubSkillError: null })
        const { client, currentSessionId } = get()
        if (!client) {
          set({ installHubSkillError: 'Not connected to server', installingHubSkill: null })
          return
        }
        try {
          await client.installHubSkill(slug, currentSessionId || undefined)
          const maxAttempts = 24
          const pollInterval = 5000
          for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, pollInterval))
            if (get().installingHubSkill !== slug) return
            await get().fetchSkills()
            const installed = get().skills.some(s => {
              const sl = slug.toLowerCase()
              if (s.name.toLowerCase() === sl || s.id.toLowerCase() === sl) return true
              if (s.filePath) {
                const parts = s.filePath.replace(/\\/g, '/').split('/')
                const idx = parts.lastIndexOf('skills')
                if (idx >= 0 && idx + 1 < parts.length && parts[idx + 1].toLowerCase() === sl) return true
              }
              return false
            })
            if (installed) {
              set({ installingHubSkill: null })
              return
            }
          }
          set({ installingHubSkill: null, installHubSkillError: 'Install may still be running — check the chat for output' })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Install failed'
          set({ installHubSkillError: msg, installingHubSkill: null })
        }
      },
      fetchClawHubSkillDetail: async (slug: string) => {
        try {
          const [detail, convexData] = await Promise.all([
            getClawHubSkill(slug),
            getClawHubSkillConvex(slug)
          ])
          if (detail && get().selectedClawHubSkill?.slug === slug) {
            if (convexData?.vtAnalysis) detail.vtAnalysis = convexData.vtAnalysis
            set({ selectedClawHubSkill: detail })
            if (detail.downloads > 0 || detail.stars > 0) {
              _clawHubStatsCache.set(slug, { downloads: detail.downloads, stars: detail.stars })
            }
            if (detail.version) {
              const versionInfo = await getClawHubSkillVersion(slug, detail.version)
              if (versionInfo && get().selectedClawHubSkill?.slug === slug) {
                set((state) => ({
                  selectedClawHubSkill: state.selectedClawHubSkill ? {
                    ...state.selectedClawHubSkill,
                    changelog: versionInfo.changelog,
                    versionFiles: versionInfo.files
                  } : null
                }))
              }
            }
          }
        } catch { /* detail fetch failed */ }
      },

      // Agent Busy & Message Queue
      agentBusy: false,
      messageQueue: [],
      removeFromQueue: (id) => {
        set((state) => ({ messageQueue: state.messageQueue.filter((m) => m.id !== id) }))
      },

      // Pinned Messages
      pinnedMessages: [],
      pinMessage: (sessionId, message) => {
        const pinId = `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const pin: PinnedMessage = {
          id: pinId,
          sessionId,
          messageId: message.id,
          content: message.content,
          role: message.role,
          timestamp: message.timestamp,
          pinnedAt: new Date().toISOString(),
          attachments: message.attachments
        }
        set((state) => ({ pinnedMessages: [...state.pinnedMessages, pin] }))
      },
      unpinMessage: (pinId) => {
        set((state) => ({ pinnedMessages: state.pinnedMessages.filter((p) => p.id !== pinId) }))
      },
      isPinned: (sessionId, messageId) => {
        return get().pinnedMessages.some((p) => p.sessionId === sessionId && p.messageId === messageId)
      },
      getPinsForSession: (sessionId) => {
        return get().pinnedMessages.filter((p) => p.sessionId === sessionId)
      },

      // Tool Calls & Subagents
      activeToolCalls: [],
      activeSubagents: [],
      abortChat: async () => {
        const { client, streamingSessionId } = get()
        if (!client || !streamingSessionId) return
        try {
          await client.abortChat(streamingSessionId)
        } catch (err) {
          console.error('[PRSM] abortChat failed:', err)
        }
        set({ isStreaming: false, streamingSessionId: null, hadStreamChunks: false, activeToolCalls: [] })
        get().stopSubagentPolling()
      },
      openSubagentPopout: (sessionKey: string) => {
        const { bridgeUrl, bridgeToken, activeSubagents } = get()
        const subagent = activeSubagents.find(a => a.sessionKey === sessionKey)
        Platform.openSubagentPopout({
          sessionKey,
          serverUrl: bridgeUrl,
          authToken: bridgeToken,
          authMode: 'token',
          label: subagent?.label || sessionKey
        })
      },
      openToolCallPopout: (toolCallId: string) => {
        const { activeToolCalls } = get()
        const toolCall = activeToolCalls.find(t => t.toolCallId === toolCallId)
        if (!toolCall) return
        try {
          localStorage.setItem(`toolcall-${toolCallId}`, JSON.stringify(toolCall))
        } catch { /* storage full */ }
        Platform.openToolCallPopout({ toolCallId, name: toolCall.name })
      },
      startSubagentPolling: () => {
        const { client, sessions } = get()
        if (!client || _subagentPollTimer) return
        _baselineSessionKeys = new Set(sessions.map(s => s.key || s.id))
        _subagentPollTimer = setInterval(async () => {
          const { client: c, currentSessionId } = get()
          if (!c) return
          try {
            const allSessions = await c.listSessions()
            const newSubagents: SubagentInfo[] = []
            for (const s of allSessions) {
              const key = s.key || s.id
              if (_baselineSessionKeys?.has(key)) continue
              const isSubagent = s.spawned === true || s.parentSessionId === currentSessionId
              if (!isSubagent) continue
              const { activeSubagents } = get()
              if (activeSubagents.some(a => a.sessionKey === key)) continue
              newSubagents.push({
                sessionKey: key,
                label: s.title || key,
                status: 'running',
                startedAt: Date.now()
              })
            }
            if (newSubagents.length > 0) {
              set((state) => {
                const { messages: finalizedMsgs, finalizedId } = finalizeStreamingMessage(state.messages)
                const tagged = newSubagents.map(sa => ({ ...sa, afterMessageId: finalizedId || undefined }))
                return { messages: finalizedMsgs, activeSubagents: [...state.activeSubagents, ...tagged] }
              })
            }
          } catch { /* polling failure */ }
        }, 2000)
      },
      stopSubagentPolling: () => {
        if (_subagentPollTimer) {
          clearInterval(_subagentPollTimer)
          _subagentPollTimer = null
        }
        _baselineSessionKeys = null
        set((state) => ({
          activeSubagents: state.activeSubagents.map(a =>
            a.status === 'running' ? { ...a, status: 'completed' as const } : a
          )
        }))
      },

      // Actions
      initializeApp: async () => {
        try {
          const config = await Platform.getConfig().catch(() => ({ defaultUrl: '', theme: '' }))
          if (!get().bridgeUrl && config.defaultUrl) {
            set({ bridgeUrl: config.defaultUrl })
          }
          if (config.theme) {
            set({ theme: config.theme as 'dark' | 'light' })
          }

          // Load token from secure storage
          const secureToken = await Platform.getToken().catch(() => '')
          if (secureToken) {
            set({ bridgeToken: secureToken })
          } else {
            const legacyToken = get().bridgeToken
            if (legacyToken) {
              await Platform.saveToken(legacyToken).catch(() => {})
            }
          }

          // Clean up legacy token from localStorage
          try {
            const raw = localStorage.getItem('clawcontrol-storage')
            if (raw) {
              const parsed = JSON.parse(raw)
              if (parsed.state?.bridgeToken) {
                delete parsed.state.bridgeToken
                localStorage.setItem('clawcontrol-storage', JSON.stringify(parsed))
              }
            }
          } catch { /* ignore */ }

          const { bridgeUrl, bridgeToken } = get()
          if (!bridgeUrl || !bridgeToken) {
            set({ showSettings: true })
            return
          }

          try {
            await get().connect()
          } catch {
            set({ showSettings: true })
          }
        } catch (err) {
          console.error('[PRSM] initializeApp failed:', err)
          set({ showSettings: true })
        }
      },

      connect: async () => {
        const { bridgeUrl, bridgeToken, client: existingClient, connecting } = get()

        if (connecting) return

        if (!bridgeUrl) {
          set({ showSettings: true })
          return
        }

        if (existingClient) {
          existingClient.disconnect()
          set({ client: null })
        }

        const stale = (globalThis as any).__prsmClient as OpenClawClient | undefined
        if (stale && stale !== existingClient) {
          try { stale.disconnect() } catch { /* already closed */ }
        }

        set({ connecting: true })

        try {
          const client = new OpenClawClient(bridgeUrl, bridgeToken)

          // Set up event handlers
          client.on('message', (msgArg: unknown) => {
            const message = deepSanitize(msgArg as Message)
            const msgSessionKey = (message as any).sessionKey || get().streamingSessionId
            const { currentSessionId } = get()
            if (currentSessionId && (!msgSessionKey || msgSessionKey !== currentSessionId)) return

            const rawRole = String((message as any).role || '').toLowerCase()
            if (rawRole === 'system') return

            const sysContent = typeof message.content === 'string' ? message.content : ''
            if (/^\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(sysContent) &&
                /(?:GatewayRestart|Exec completed|config-apply|SIGUSR)/i.test(sysContent)) return

            const isTool = message.isToolResult
              || rawRole === 'tool' || rawRole === 'toolresult' || rawRole === 'tool_result' || rawRole === 'function'
              || !!(message as any).toolCallId || !!(message as any).tool_call_id
            if (!get().thinkingEnabled && isTool) return

            let replacedStreaming = false
            set((state) => {
              const lastIdx = state.messages.length - 1
              const lastMsg = lastIdx >= 0 ? state.messages[lastIdx] : null
              if (lastMsg && lastMsg.role === 'assistant' && lastMsg.id.startsWith('streaming-')) {
                replacedStreaming = true
                const messages = [...state.messages]
                messages[lastIdx] = message
                return { messages, isStreaming: false }
              }
              const exists = state.messages.some(m => m.id === message.id)
              if (exists) {
                return { messages: state.messages.map(m => m.id === message.id ? message : m), isStreaming: false }
              }
              return { messages: [...state.messages, message as Message], isStreaming: false }
            })

            if (message.role === 'assistant' && !replacedStreaming) {
              const preview = message.content.slice(0, 100)
              const { notificationsEnabled, streamingSessionId: msgSession, currentSessionId: activeSession } = get()
              if (shouldNotify(notificationsEnabled, msgSession, activeSession)) {
                Platform.showNotification('Agent responded', preview).catch(() => {})
              }
            }
          })

          client.on('connected', () => {
            set({ connected: true, connecting: false })
          })

          client.on('session', (payload: unknown) => {
            const data = payload as any
            if (!data) return
            const key = data.key || data.id || data.sessionKey
            const title = data.title || data.label
            if (key && title && typeof title === 'string') {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === key || s.key === key ? { ...s, title } : s
                )
              }))
            }
          })

          client.on('disconnected', () => {
            set({ connected: false, isStreaming: false, hadStreamChunks: false, activeToolCalls: [], streamingSessionId: null, agentBusy: false, messageQueue: [], streamingThinking: {}, compactingSession: null })
            get().stopSubagentPolling()
          })

          client.on('streamStart', (payload: unknown) => {
            const { sessionKey } = (payload || {}) as { sessionKey?: string }
            const { currentSessionId, streamingSessionId: existingStream } = get()
            const streamSession = existingStream || sessionKey
            if (currentSessionId && (!streamSession || streamSession !== currentSessionId)) return
            set({
              isStreaming: true,
              hadStreamChunks: false,
              activeToolCalls: [],
              agentBusy: true,
              ...(sessionKey && !existingStream ? { streamingSessionId: sessionKey } : {})
            })
            get().startSubagentPolling()
          })

          client.on('streamChunk', (chunkArg: unknown) => {
            let text: string
            let sessionKey: string | undefined
            if (typeof chunkArg === 'string') {
              text = chunkArg
            } else if (chunkArg && typeof chunkArg === 'object') {
              const payload = chunkArg as any
              text = String(payload.text || payload.delta || payload.content || '')
              sessionKey = payload.sessionKey
            } else {
              text = String(chunkArg ?? '')
            }
            const kind = (chunkArg && typeof chunkArg === 'object') ? String((chunkArg as any).kind || '') : ''

            if (text.includes('MEDIA:')) {
              text = text.split('\n').filter(l => !/\bMEDIA:\s/i.test(l)).join('\n').trim()
            }

            const { currentSessionId, streamingSessionId } = get()
            const chunkSession = sessionKey || streamingSessionId
            if (currentSessionId && (!chunkSession || chunkSession !== currentSessionId)) return
            if (!text) return

            set((state) => {
              const messages = [...state.messages]
              const lastMessage = messages[messages.length - 1]

              if (lastMessage && lastMessage.role === 'assistant' && lastMessage.id.startsWith('streaming-')) {
                const rawContent = kind === 'replace'
                  ? text
                  : (lastMessage.rawContent ?? lastMessage.content) + text
                const displayContent = stripThinkingTags(rawContent)
                messages[messages.length - 1] = { ...lastMessage, content: displayContent, rawContent }
                return { messages, isStreaming: true, hadStreamChunks: true }
              } else if (lastMessage && lastMessage.role === 'assistant' && !state.thinkingEnabled) {
                const rawContent = (lastMessage.rawContent ?? lastMessage.content) + '\n\n' + text
                const displayContent = stripThinkingTags(rawContent)
                messages[messages.length - 1] = {
                  ...lastMessage,
                  id: `streaming-${Date.now()}`,
                  content: displayContent,
                  rawContent
                }
                return { messages, isStreaming: true, hadStreamChunks: true }
              } else {
                const displayContent = stripThinkingTags(text)
                const newMessage: Message = {
                  id: `streaming-${Date.now()}`,
                  role: 'assistant',
                  content: displayContent,
                  rawContent: text,
                  timestamp: new Date().toISOString()
                }
                return { messages: [...messages, newMessage], isStreaming: true, hadStreamChunks: true }
              }
            })
          })

          client.on('streamEnd', (payload: unknown) => {
            const { sessionKey } = (payload || {}) as { sessionKey?: string }
            const { currentSessionId, streamingSessionId } = get()
            const endSession = sessionKey || streamingSessionId
            if (currentSessionId && (!endSession || endSession !== currentSessionId)) {
              if (streamingSessionId && sessionKey === streamingSessionId) {
                set({ isStreaming: false, streamingSessionId: null, hadStreamChunks: false, activeToolCalls: [] })
              }
              return
            }

            const { messages, hadStreamChunks } = get()

            if (streamingSessionId && hadStreamChunks) {
              const lastMsg = messages[messages.length - 1]
              if (lastMsg?.role === 'assistant') {
                const preview = lastMsg.content.slice(0, 100)
                const { notificationsEnabled, currentSessionId: activeSession } = get()
                if (shouldNotify(notificationsEnabled, streamingSessionId, activeSession)) {
                  Platform.showNotification('Agent responded', preview).catch(() => {})
                }
              }
              if (streamingSessionId !== currentSessionId) {
                set((state) => ({
                  unreadCounts: { ...state.unreadCounts, [streamingSessionId]: (state.unreadCounts[streamingSessionId] || 0) + 1 }
                }))
              }
            }

            const endedKey = endSession || ''
            set((state) => ({
              isStreaming: false,
              streamingSessionId: null,
              hadStreamChunks: false,
              activeToolCalls: [],
              agentBusy: false,
              streamingThinking: endedKey ? (() => { const { [endedKey]: _t, ...rest } = state.streamingThinking; return rest })() : state.streamingThinking
            }))
            get().stopSubagentPolling()

            const { messageQueue } = get()
            if (messageQueue.length > 0) {
              const next = messageQueue[0]
              set((state) => ({ messageQueue: state.messageQueue.slice(1) }))
              setTimeout(() => { get().sendMessage(next.content, next.attachments).catch(() => {}) }, 100)
            }

            setTimeout(() => { get().fetchSessions().catch(() => {}) }, 1500)
          })

          client.on('streamSessionKey', (payload: unknown) => {
            const { sessionKey } = payload as { runId: string; sessionKey: string }
            if (!sessionKey) return
            const { streamingSessionId, currentSessionId } = get()
            const oldKey = streamingSessionId || currentSessionId
            if (!oldKey || sessionKey === oldKey) return
            set((state) => {
              let renamed = false
              const sessions = state.sessions.reduce<typeof state.sessions>((acc, s) => {
                const sKey = s.key || s.id
                if (sKey === oldKey && !renamed) {
                  renamed = true
                  acc.push({ ...s, id: sessionKey, key: sessionKey })
                } else if (sKey !== sessionKey) {
                  acc.push(s)
                }
                return acc
              }, [])
              return {
                currentSessionId: state.currentSessionId === oldKey ? sessionKey : state.currentSessionId,
                streamingSessionId: state.streamingSessionId === oldKey ? sessionKey : state.streamingSessionId,
                sessions
              }
            })
          })

          client.on('toolCall', (payload: unknown) => {
            const tc = payload as { toolCallId: string; name: string; phase: string; result?: string; args?: Record<string, unknown>; sessionKey?: string }
            const { currentSessionId: csid } = get()
            if (csid && (!tc.sessionKey || tc.sessionKey !== csid)) return
            set((state) => {
              const idx = state.activeToolCalls.findIndex(t => t.toolCallId === tc.toolCallId)
              if (idx >= 0) {
                const updated = [...state.activeToolCalls]
                updated[idx] = { ...updated[idx], phase: tc.phase as 'start' | 'result', result: tc.result, args: tc.args || updated[idx].args }
                return { activeToolCalls: updated }
              }
              const { messages: finalizedMsgs, finalizedId } = finalizeStreamingMessage(state.messages)
              return {
                messages: finalizedMsgs,
                activeToolCalls: [...state.activeToolCalls, {
                  toolCallId: tc.toolCallId,
                  name: tc.name,
                  phase: tc.phase as 'start' | 'result',
                  result: tc.result,
                  args: tc.args,
                  afterMessageId: finalizedId || undefined,
                  startedAt: Date.now()
                }]
              }
            })
          })

          client.on('agentStatus', (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return
            const data = payload as any
            let busy = false
            if (data.status === 'busy' || data.status === 'working') busy = true
            else if (data.busy === true) busy = true
            else if (Array.isArray(data.presence)) busy = data.presence.some((p: any) => p.status === 'busy' || p.status === 'working')
            set({ agentBusy: busy })
          })

          client.on('subagentDetected', (payload: unknown) => {
            const { sessionKey } = payload as { sessionKey: string }
            if (!sessionKey) return
            set((state) => {
              if (state.activeSubagents.some(a => a.sessionKey === sessionKey)) return state
              const { messages: finalizedMsgs, finalizedId } = finalizeStreamingMessage(state.messages)
              return {
                messages: finalizedMsgs,
                activeSubagents: [...state.activeSubagents, {
                  sessionKey,
                  label: sessionKey,
                  status: 'running' as const,
                  startedAt: Date.now(),
                  afterMessageId: finalizedId || undefined
                }]
              }
            })
          })

          client.on('thinkingChunk', (payload: unknown) => {
            const { text, cumulative, sessionKey } = payload as { text: string; cumulative: boolean; sessionKey?: string }
            const { currentSessionId } = get()
            const resolvedKey = sessionKey || currentSessionId
            if (!resolvedKey) return
            const isCurrentSession = !sessionKey || !currentSessionId || sessionKey === currentSessionId
            if (!isCurrentSession) return
            set((state) => {
              const prev = state.streamingThinking[resolvedKey] || ''
              const next = cumulative ? text : prev + text
              return { streamingThinking: { ...state.streamingThinking, [resolvedKey]: next } }
            })
          })

          client.on('compaction', (payload: unknown) => {
            const { phase, sessionKey } = payload as { phase: string; willRetry: boolean; sessionKey?: string }
            const { currentSessionId } = get()
            const resolvedKey = sessionKey || currentSessionId
            if (!resolvedKey) return
            if (phase === 'start') {
              set({ compactingSession: resolvedKey })
            } else if (phase === 'end') {
              set((state) => ({
                compactingSession: state.compactingSession === resolvedKey ? null : state.compactingSession
              }))
            }
          })

          await client.connect()
          ;(globalThis as any).__prsmClient = client
          set({ client })

          // Fetch initial data
          await Promise.all([
            get().fetchSessions(),
            get().fetchAgents(),
            get().fetchSkills(),
            get().fetchCronJobs()
          ])

          // Auto-select the most recent session
          const { currentSessionId: currentId, sessions: loadedSessions } = get()
          if (!currentId && loadedSessions.length > 0) {
            const topSession = loadedSessions[0]
            set({ currentSessionId: topSession.id })
            client.setPrimarySessionKey(topSession.id)
            client.getSessionMessages(topSession.id).then((result) => {
              if (get().currentSessionId === topSession.id) {
                set({ messages: deepSanitize(result.messages) })
              }
            })
          }
        } catch {
          set({ connecting: false, connected: false })
        }
      },

      disconnect: () => {
        const { client } = get()
        client?.disconnect()
        if ((globalThis as any).__prsmClient === client) {
          (globalThis as any).__prsmClient = null
        }
        set({ client: null, connected: false, connecting: false })
      },

      sendMessage: async (content: string, attachments?: Array<{type: string, mimeType: string, content: string}>) => {
        const { client, currentSessionId, currentAgentId, isStreaming: currentlyStreaming } = get()
        if (!client || (!content.trim() && (!attachments || attachments.length === 0))) return

        if (currentlyStreaming) {
          const queueItem = {
            id: `queued-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            content,
            timestamp: new Date().toISOString(),
            attachments
          }
          set((state) => ({ messageQueue: [...state.messageQueue, queueItem] }))
          return
        }

        const selectedSessionId = currentSessionId
        const requestedSessionId = selectedSessionId || `session-${Date.now()}`
        const now = new Date().toISOString()

        if (!selectedSessionId) {
          set((state) => {
            if (state.sessions.some((s) => s.id === requestedSessionId)) {
              return { currentSessionId: requestedSessionId }
            }
            return {
              currentSessionId: requestedSessionId,
              sessions: [{
                id: requestedSessionId,
                key: requestedSessionId,
                title: state.pendingSessionLabel || 'New Chat',
                agentId: currentAgentId || undefined,
                createdAt: now,
                updatedAt: now
              }, ...state.sessions]
            }
          })
        }

        client.setPrimarySessionKey(requestedSessionId)
        set({ isStreaming: false, hadStreamChunks: false, activeToolCalls: [], streamingSessionId: requestedSessionId })
        get().startSubagentPolling()

        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
          attachments: attachments && attachments.length > 0 ? attachments : undefined
        }
        set((state) => ({ messages: [...state.messages, userMessage] }))

        try {
          const response = await client.sendMessage({
            sessionId: requestedSessionId,
            content,
            agentId: currentAgentId || undefined,
            thinking: get().thinkingEnabled,
            attachments
          })

          const serverKey = response.sessionKey?.trim() || requestedSessionId

          set((state) => {
            const replacementId = selectedSessionId || requestedSessionId
            const serverIdx = state.sessions.findIndex((s) => s.id === serverKey)
            if (serverIdx >= 0) {
              const dedupedSessions = replacementId !== serverKey
                ? state.sessions.filter((s) => s.id !== replacementId)
                : state.sessions
              return { currentSessionId: serverKey, streamingSessionId: serverKey, sessions: dedupedSessions }
            }
            const replaceIdx = state.sessions.findIndex((s) => s.id === replacementId)
            if (replaceIdx >= 0) {
              const sessionsCopy = [...state.sessions]
              sessionsCopy[replaceIdx] = { ...sessionsCopy[replaceIdx], id: serverKey, key: serverKey, updatedAt: now }
              return { currentSessionId: serverKey, streamingSessionId: serverKey, sessions: sessionsCopy }
            }
            return {
              currentSessionId: serverKey,
              streamingSessionId: serverKey,
              sessions: [{
                id: serverKey,
                key: serverKey,
                title: 'New Chat',
                agentId: currentAgentId || undefined,
                createdAt: now,
                updatedAt: now
              }, ...state.sessions]
            }
          })

          const pendingLabel = get().pendingSessionLabel
          if (pendingLabel) {
            set({ pendingSessionLabel: null })
            get().updateSessionLabel(serverKey, pendingLabel).catch(() => {})
          }

          get().fetchSessions().catch(() => {})
        } catch (err) {
          console.error('[PRSM] sendMessage failed:', err)
          set({ isStreaming: false, streamingSessionId: null })
        }
      },

      fetchSessions: async () => {
        const { client } = get()
        if (!client) return
        const serverSessions = deepSanitize(await client.listSessions())
        set((state) => {
          const seen = new Set<string>()
          const uniqueServerSessions = serverSessions.filter((s: Session) => {
            const key = s.key || s.id
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          const localOnly = state.sessions.filter(s => {
            const key = s.key || s.id
            return !seen.has(key) && key.startsWith('session-')
          })
          return { sessions: [...uniqueServerSessions, ...localOnly] }
        })
      },

      fetchAgents: async () => {
        const { client } = get()
        if (!client) return
        const agents = deepSanitize(await client.listAgents())
        set({ agents })
        if (agents.length > 0 && !get().currentAgentId) {
          set({ currentAgentId: agents[0].id })
        }
      },

      fetchSkills: async () => {
        const { client } = get()
        if (!client) return
        const skills = deepSanitize(await client.listSkills())
        set({ skills })
      },

      fetchCronJobs: async () => {
        const { client } = get()
        if (!client) return
        const cronJobs = deepSanitize(await client.listCronJobs())
        set({ cronJobs })
      }
    }),
    {
      name: 'clawcontrol-storage',
      partialize: (state) => ({
        theme: state.theme,
        bridgeUrl: state.bridgeUrl,
        bridgeToken: state.bridgeToken,
        sidebarCollapsed: state.sidebarCollapsed,
        thinkingEnabled: state.thinkingEnabled,
        fontSize: state.fontSize,
        notificationsEnabled: state.notificationsEnabled,
        sttUrl: state.sttUrl,
        sttModel: state.sttModel,
        sttApiKey: state.sttApiKey,
        updatePolicy: state.updatePolicy,
        lastUpdateCheck: state.lastUpdateCheck,
        pinnedMessages: state.pinnedMessages
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.fontSize && state.fontSize !== 100) {
          document.documentElement.style.fontSize = `${state.fontSize}%`
        }

        // One-time migration: old keys → new keys
        try {
          const raw = localStorage.getItem('clawcontrol-storage')
          if (raw) {
            const parsed = JSON.parse(raw)
            const s = parsed?.state
            if (s) {
              let changed = false
              // Migrate serverUrl → bridgeUrl
              if (s.serverUrl && !s.bridgeUrl) {
                let url = s.serverUrl as string
                // Convert ws:// → http://, wss:// → https://
                if (url.startsWith('ws://')) url = 'http://' + url.slice(5)
                else if (url.startsWith('wss://')) url = 'https://' + url.slice(6)
                s.bridgeUrl = url
                delete s.serverUrl
                changed = true
              }
              // Migrate gatewayToken → bridgeToken
              if (s.gatewayToken && !s.bridgeToken) {
                s.bridgeToken = s.gatewayToken
                delete s.gatewayToken
                changed = true
              }
              // Remove authMode
              if (s.authMode !== undefined) {
                delete s.authMode
                changed = true
              }
              if (changed) {
                localStorage.setItem('clawcontrol-storage', JSON.stringify(parsed))
                // Apply migrated values to current state
                if (state && s.bridgeUrl) (state as any).bridgeUrl = s.bridgeUrl
                if (state && s.bridgeToken) (state as any).bridgeToken = s.bridgeToken
              }
            }
          }
        } catch { /* migration failed — user can re-enter settings */ }
      }
    }
  )
)

// Vite HMR: disconnect stale connections when modules are hot-replaced.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const { client } = useStore.getState()
    if (client) client.disconnect()
  })
}

// Selectors
export const selectStreamingThinking = (state: AppState) => state.streamingThinking[state.currentSessionId || ''] || ''
export const selectIsCompacting = (state: AppState) => state.compactingSession === state.currentSessionId
