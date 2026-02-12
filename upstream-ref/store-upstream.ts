import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { OpenClawClient, Message, Session, Agent, Skill, CronJob, AgentFile, CreateAgentParams, buildIdentityContent } from '../lib/openclaw'
import type { ClawHubSkill, ClawHubSort } from '../lib/clawhub'
import { listClawHubSkills, searchClawHub, getClawHubSkill, getClawHubSkillVersion, getClawHubSkillConvex } from '../lib/clawhub'
import * as Platform from '../lib/platform'

export interface ToolCall {
  toolCallId: string
  name: string
  phase: 'start' | 'result'
  result?: string
  startedAt: number
  afterMessageId?: string
}

export interface SubagentInfo {
  sessionKey: string
  label: string
  status: 'running' | 'completed'
  detectedAt: number
  afterMessageId?: string
}

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
  collapsedSessionGroups: string[]
  toggleSessionGroup: (label: string) => void
  rightPanelOpen: boolean
  setRightPanelOpen: (open: boolean) => void
  rightPanelTab: 'skills' | 'crons'
  setRightPanelTab: (tab: 'skills' | 'crons') => void

  // Main View State
  mainView: 'chat' | 'skill-detail' | 'cron-detail' | 'agent-detail' | 'create-agent' | 'clawhub-skill-detail' | 'server-settings' | 'pixel-dashboard'
  setMainView: (view: 'chat' | 'skill-detail' | 'cron-detail' | 'agent-detail' | 'create-agent' | 'clawhub-skill-detail') => void
  selectedSkill: Skill | null
  selectedCronJob: CronJob | null
  selectedAgentDetail: AgentDetail | null
  selectSkill: (skill: Skill) => Promise<void>
  selectCronJob: (cronJob: CronJob) => Promise<void>
  selectAgentForDetail: (agent: Agent) => Promise<void>
  openServerSettings: () => void
  openDashboard: () => void
  closeDetailView: () => void
  toggleSkillEnabled: (skillId: string, enabled: boolean) => Promise<void>
  saveAgentFile: (agentId: string, fileName: string, content: string) => Promise<boolean>
  refreshAgentFiles: (agentId: string) => Promise<void>

  // Chat
  messages: Message[]
  addMessage: (message: Message) => void
  clearMessages: () => void
  streamingSessions: Record<string, boolean>
  sessionHadChunks: Record<string, boolean>
  sessionToolCalls: Record<string, ToolCall[]>
  thinkingEnabled: boolean
  setThinkingEnabled: (enabled: boolean) => void

  // Notifications & Unread
  notificationsEnabled: boolean
  setNotificationsEnabled: (enabled: boolean) => Promise<void>
  unreadCounts: Record<string, number>
  clearUnread: (sessionId: string) => void
  streamingSessionId: string | null

  // Sessions
  sessions: Session[]
  currentSessionId: string | null
  setCurrentSession: (sessionId: string) => void
  createNewSession: () => Promise<void>
  deleteSession: (sessionId: string) => void
  updateSessionLabel: (sessionId: string, label: string) => Promise<void>
  spawnSubagentSession: (agentId: string, prompt?: string) => Promise<void>

  // Agents
  agents: Agent[]
  currentAgentId: string | null
  setCurrentAgent: (agentId: string) => void
  showCreateAgent: () => void
  createAgent: (params: CreateAgentParams) => Promise<{ success: boolean; error?: string }>
  deleteAgent: (agentId: string) => Promise<{ success: boolean; error?: string }>

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

  // Subagents
  activeSubagents: SubagentInfo[]
  startSubagentPolling: () => void
  stopSubagentPolling: () => void
  openSubagentPopout: (sessionKey: string) => void

  // Actions
  initializeApp: () => Promise<void>
  connect: () => Promise<void>
  disconnect: () => void
  sendMessage: (content: string) => Promise<void>
  abortChat: () => Promise<void>
  fetchSessions: () => Promise<void>
  fetchAgents: () => Promise<void>
  fetchSkills: () => Promise<void>
  fetchCronJobs: () => Promise<void>
}

// Module-level polling state (not persisted)
let _subagentPollTimer: ReturnType<typeof setInterval> | null = null
let _baselineSessionKeys: Set<string> | null = null

// Monotonic counter for detecting stale async message loads after session switches.
let _sessionLoadVersion = 0

// Cache of ClawHub skill stats from list results (slug -> { downloads, stars })
const _clawHubStatsCache = new Map<string, { downloads: number; stars: number }>()

/**
 * If the last message is a streaming placeholder (id starts with "streaming-"),
 * finalize it with a stable ID so that subsequent tool calls / subagents can
 * reference it via `afterMessageId`, and new stream chunks will create a fresh
 * streaming message instead of appending to the finalized one.
 */
function finalizeStreamingMessage(messages: Message[]): { messages: Message[]; finalizedId: string | null } {
  if (messages.length === 0) return { messages, finalizedId: null }
  const last = messages[messages.length - 1]
  if (last.role !== 'assistant' || !last.id.startsWith('streaming-')) {
    // Always return the last message's ID so subagents/tool-calls anchor inline
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
      serverUrl: '',
      setServerUrl: (url) => set({ serverUrl: url }),
      authMode: 'token',
      setAuthMode: (mode) => set({ authMode: mode }),
      gatewayToken: '',
      setGatewayToken: (token) => {
        set({ gatewayToken: token })
        Platform.saveToken(token).catch(() => {})
      },
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
      collapsedSessionGroups: [],
      toggleSessionGroup: (label) => set((state) => {
        const groups = state.collapsedSessionGroups
        return {
          collapsedSessionGroups: groups.includes(label)
            ? groups.filter(g => g !== label)
            : [...groups, label]
        }
      }),
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
      openServerSettings: () => set({ mainView: 'server-settings', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null, selectedClawHubSkill: null }),
      openDashboard: () => set({ mainView: 'pixel-dashboard', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null, selectedClawHubSkill: null }),
      closeDetailView: () => set({ mainView: 'chat', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null, selectedClawHubSkill: null }),
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
      streamingSessions: {},
      sessionHadChunks: {},
      sessionToolCalls: {},
      thinkingEnabled: false,
      setThinkingEnabled: (enabled) => set({ thinkingEnabled: enabled }),

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

      // Subagents
      activeSubagents: [],
      startSubagentPolling: () => {
        const { client, sessions } = get()
        if (!client || _subagentPollTimer) return

        // Snapshot current session keys as baseline
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

              // Detect subagents by spawned flag or parentSessionId matching current session
              const isSubagent = s.spawned === true || s.parentSessionId === currentSessionId
              if (!isSubagent) continue

              // Skip if already tracked
              const { activeSubagents } = get()
              if (activeSubagents.some(a => a.sessionKey === key)) continue

              newSubagents.push({
                sessionKey: key,
                label: s.title || key,
                status: 'running',
                detectedAt: Date.now()
              })
            }

            if (newSubagents.length > 0) {
              set((state) => {
                // Finalize current streaming message so subagent blocks render inline
                const { messages: finalizedMsgs, finalizedId } = finalizeStreamingMessage(state.messages)
                const tagged = newSubagents.map(sa => ({
                  ...sa,
                  afterMessageId: finalizedId || undefined
                }))
                return {
                  messages: finalizedMsgs,
                  activeSubagents: [...state.activeSubagents, ...tagged]
                }
              })
            }
          } catch {
            // Polling failure — ignore
          }
        }, 1000)
      },
      stopSubagentPolling: () => {
        if (_subagentPollTimer) {
          clearInterval(_subagentPollTimer)
          _subagentPollTimer = null
        }
        _baselineSessionKeys = null

        // Mark all running subagents as completed
        set((state) => ({
          activeSubagents: state.activeSubagents.map(a =>
            a.status === 'running' ? { ...a, status: 'completed' as const } : a
          )
        }))
      },
      openSubagentPopout: (sessionKey: string) => {
        const { serverUrl, gatewayToken, authMode, activeSubagents } = get()
        const subagent = activeSubagents.find(a => a.sessionKey === sessionKey)
        Platform.openSubagentPopout({
          sessionKey,
          serverUrl,
          authToken: gatewayToken,
          authMode,
          label: subagent?.label || sessionKey
        })
      },

      // Sessions
      sessions: [],
      currentSessionId: null,
      setCurrentSession: (sessionId) => {
        const { unreadCounts, client } = get()
        const { [sessionId]: _, ...restCounts } = unreadCounts
        // Clear default session key when switching (parent set preserved for concurrent streams)
        client?.setPrimarySessionKey(null)
        const loadVersion = ++_sessionLoadVersion
        set({ currentSessionId: sessionId, messages: [], activeSubagents: [], unreadCounts: restCounts })
        // Load session messages. Guard against stale loads when the user
        // rapidly switches sessions — only apply if we're still on the same
        // session and no streaming messages have been inserted.
        client?.getSessionMessages(sessionId).then((loadedMessages) => {
          if (_sessionLoadVersion !== loadVersion) return
          set((state) => {
            if (state.currentSessionId !== sessionId) return state
            // Preserve any streaming placeholder that arrived during the async load
            const streamingMsgs = state.messages.filter(m => m.id.startsWith('streaming-'))
            return { messages: streamingMsgs.length > 0 ? [...loadedMessages, ...streamingMsgs] : loadedMessages }
          })
        })
      },
      createNewSession: async () => {
        const { client, currentAgentId } = get()
        if (!client) return

        const session = await client.createSession(currentAgentId || undefined)
        const sessionId = session.key || session.id
        set((state) => ({
          sessions: [session, ...state.sessions.filter(s => (s.key || s.id) !== sessionId)],
          currentSessionId: sessionId,
          messages: [],
          activeSubagents: [],
          streamingSessionId: null
        }))
      },
      deleteSession: (sessionId) => {
        if (sessionId === 'agent:main:main') return
        const { client } = get()
        client?.deleteSession(sessionId)
        set((state) => {
          const { [sessionId]: _s, ...restStreaming } = state.streamingSessions
          const { [sessionId]: _h, ...restChunks } = state.sessionHadChunks
          const { [sessionId]: _t, ...restToolCalls } = state.sessionToolCalls
          return {
            sessions: state.sessions.filter((s) => (s.key || s.id) !== sessionId),
            currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
            streamingSessions: restStreaming,
            sessionHadChunks: restChunks,
            sessionToolCalls: restToolCalls,
          }
        })
      },
      updateSessionLabel: async (sessionId, label) => {
        const { client } = get()
        if (!client) return

        await client.updateSession(sessionId, { label })
        set((state) => ({
          sessions: state.sessions.map((s) =>
            (s.key || s.id) === sessionId ? { ...s, title: label } : s
          )
        }))
      },
      spawnSubagentSession: async (agentId, prompt) => {
        const { client } = get()
        if (!client) return

        const session = await client.spawnSession(agentId, prompt)
        const sessionId = session.key || session.id
        set((state) => ({
          sessions: [session, ...state.sessions.filter(s => (s.key || s.id) !== sessionId)],
          currentSessionId: sessionId,
          messages: []
        }))

        // Load any existing messages for the spawned session
        const messages = await client.getSessionMessages(session.key || session.id)
        if (messages.length > 0) {
          set({ messages })
        }
      },

      // Agents
      agents: [],
      currentAgentId: null,
      setCurrentAgent: (agentId) => set({ currentAgentId: agentId }),
      showCreateAgent: () => set({ mainView: 'create-agent', selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null }),
      createAgent: async (params) => {
        const { client } = get()
        if (!client) return { success: false, error: 'Not connected' }

        try {
          // 1. Patch config to add the agent (this triggers a server restart)
          const result = await client.createAgent({
            name: params.name,
            workspace: params.workspace,
            model: params.model
          })

          if (!result?.ok) {
            return { success: false, error: 'Server returned an error' }
          }

          const agentId = result.agentId
          const needsIdentity = params.name || params.emoji || params.avatar

          // 2. config.patch triggers a server restart via SIGUSR1.
          //    Wait for the client to reconnect so the server knows about
          //    the new agent before we try to write files or fetch agents.
          await new Promise<void>((resolve) => {
            let resolved = false
            const onConnected = () => {
              if (resolved) return
              resolved = true
              client.off('connected', onConnected)
              resolve()
            }
            client.on('connected', onConnected)

            // Safety timeout: if no reconnect within 15s, continue anyway
            setTimeout(() => {
              if (!resolved) {
                resolved = true
                client.off('connected', onConnected)
                console.warn('[ClawControl] createAgent: timed out waiting for reconnect')
                resolve()
              }
            }, 15000)
          })

          // 3. Now that the server has restarted with the new config,
          //    write IDENTITY.md with name/emoji/avatar
          if (needsIdentity) {
            const content = buildIdentityContent({
              name: params.name,
              emoji: params.emoji,
              avatar: params.avatar,
              agentId,
              avatarFileName: params.avatarFileName
            })
            try {
              await client.setAgentFile(agentId, 'IDENTITY.md', content)
            } catch (err) {
              console.warn('[ClawControl] Failed to write IDENTITY.md:', err)
            }

            // Write avatar image as a separate file instead of embedding in IDENTITY.md
            if (params.avatar && params.avatarFileName && params.avatar.startsWith('data:')) {
              try {
                // Strip the data URI prefix (e.g. "data:image/png;base64,") to get raw base64
                const base64Content = params.avatar.replace(/^data:[^;]+;base64,/, '')
                const avatarPath = `avatars/${agentId}/${params.avatarFileName}`
                await client.setAgentFile(agentId, avatarPath, base64Content)
              } catch (err) {
                console.warn('[ClawControl] Failed to write avatar file:', err)
              }
            }
          }

          // 4. Refresh agents list and navigate to detail view
          await get().fetchAgents()

          const newAgent = get().agents.find(a => a.id === agentId)
          if (newAgent) {
            set({ currentAgentId: agentId })
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
          if (!result?.ok) {
            return { success: false, error: 'Server returned an error' }
          }

          // Wait for reconnect after config.patch triggers server restart
          await new Promise<void>((resolve) => {
            let resolved = false
            const onConnected = () => {
              if (resolved) return
              resolved = true
              client.off('connected', onConnected)
              resolve()
            }
            client.on('connected', onConnected)

            setTimeout(() => {
              if (!resolved) {
                resolved = true
                client.off('connected', onConnected)
                console.warn('[ClawControl] deleteAgent: timed out waiting for reconnect')
                resolve()
              }
            }, 15000)
          })

          // If deleted agent was selected, switch to 'main' or first available
          const { currentAgentId, mainView, selectedAgentDetail } = get()
          if (currentAgentId === agentId) {
            set({ currentAgentId: 'main' })
          }

          // If deleted agent was in detail view, close it
          if (mainView === 'agent-detail' && selectedAgentDetail?.agent.id === agentId) {
            set({ mainView: 'chat', selectedAgentDetail: null })
          }

          // Refresh agents list
          await get().fetchAgents()

          // Fallback: if 'main' doesn't exist, pick first available
          const { agents, currentAgentId: newAgentId } = get()
          if (newAgentId === agentId || !agents.some(a => a.id === newAgentId)) {
            set({ currentAgentId: agents[0]?.id || 'main' })
          }

          return { success: true }
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to delete agent' }
        }
      },

      // Skills & Crons
      skills: [],
      cronJobs: [],

      // ClawHub
      clawHubSkills: [],
      clawHubLoading: false,
      clawHubSearchQuery: '',
      clawHubSort: 'downloads',
      selectedClawHubSkill: null,
      skillsSubTab: 'installed',
      installingHubSkill: null,
      installHubSkillError: null,
      setSkillsSubTab: (tab) => {
        set({ skillsSubTab: tab })
        if (tab === 'available' && get().clawHubSkills.length === 0 && !get().clawHubLoading) {
          get().fetchClawHubSkills()
        }
      },
      fetchClawHubSkills: async () => {
        set({ clawHubLoading: true })
        try {
          const skills = await listClawHubSkills(get().clawHubSort)
          // Cache stats for enriching search results later
          for (const s of skills) {
            _clawHubStatsCache.set(s.slug, { downloads: s.downloads, stars: s.stars })
          }
          set({ clawHubSkills: skills })
        } catch {
          // fetch failed
        }
        set({ clawHubLoading: false })
      },
      searchClawHubSkills: async (query) => {
        set({ clawHubSearchQuery: query, clawHubLoading: true })
        try {
          let skills = query.trim()
            ? await searchClawHub(query)
            : await listClawHubSkills(get().clawHubSort)
          // Enrich search results with cached stats (search endpoint doesn't return stats)
          skills = skills.map(s => {
            const cached = _clawHubStatsCache.get(s.slug)
            if (cached && s.downloads === 0 && s.stars === 0) {
              return { ...s, downloads: cached.downloads, stars: cached.stars }
            }
            // Cache stats from list results
            if (s.downloads > 0 || s.stars > 0) {
              _clawHubStatsCache.set(s.slug, { downloads: s.downloads, stars: s.stars })
            }
            return s
          })
          set({ clawHubSkills: skills })
        } catch {
          // search failed
        }
        set({ clawHubLoading: false })
      },
      setClawHubSort: (sort) => {
        set({ clawHubSort: sort })
        get().fetchClawHubSkills()
      },
      selectClawHubSkill: (skill) => {
        set({ mainView: 'clawhub-skill-detail', selectedClawHubSkill: skill, selectedSkill: null, selectedCronJob: null, selectedAgentDetail: null })
      },
      // TODO: ClawHub skill install requires a server-side RPC (e.g. skills.upload)
      // to transfer files to the remote server. agents.files.set only supports
      // workspace files (IDENTITY.md, SOUL.md, etc.), and local filesystem
      // extraction doesn't reach the server. Options: add skills.upload to
      // openclaw server, or pair a node on the server machine.
      installClawHubSkill: async (slug) => {
        set({ installingHubSkill: slug, installHubSkillError: null })

        const { client, currentAgentId } = get()
        if (!client) {
          set({ installHubSkillError: 'Not connected to server', installingHubSkill: null })
          return
        }

        try {
          // Get the agent's workspace path from the server
          const agentId = currentAgentId || 'main'
          const agentFiles = await client.getAgentFiles(agentId)
          let workspace = agentFiles?.workspace
          if (!workspace) {
            // Fallback: detect from existing skills' file paths
            const { skills } = get()
            for (const s of skills) {
              if (s.filePath) {
                const parts = s.filePath.replace(/\\/g, '/').split('/')
                const skillsIdx = parts.lastIndexOf('skills')
                if (skillsIdx > 0) {
                  workspace = parts.slice(0, skillsIdx).join('/')
                  break
                }
              }
            }
          }
          if (!workspace) {
            throw new Error('Could not determine agent workspace path')
          }
          // Download ZIP and extract to <workspace>/skills/<slug>/
          const targetDir = `${workspace.replace(/\\/g, '/')}/skills/${slug}`
          await Platform.clawhubInstall(slug, targetDir)

          // Refresh skills list from server
          await get().fetchSkills()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Install failed'
          console.error('[clawhub] Install failed:', msg)
          set({ installHubSkillError: msg })
        }

        set({ installingHubSkill: null })
      },
      fetchClawHubSkillDetail: async (slug) => {
        try {
          // Fetch REST detail and Convex data (VT scan) in parallel
          const [detail, convexData] = await Promise.all([
            getClawHubSkill(slug),
            getClawHubSkillConvex(slug)
          ])
          if (detail && get().selectedClawHubSkill?.slug === slug) {
            if (convexData?.vtAnalysis) {
              detail.vtAnalysis = convexData.vtAnalysis
            }
            set({ selectedClawHubSkill: detail })
            // Cache stats
            if (detail.downloads > 0 || detail.stars > 0) {
              _clawHubStatsCache.set(slug, { downloads: detail.downloads, stars: detail.stars })
            }
            // Fetch version details (files, changelog)
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
        } catch {
          // detail fetch failed - keep the list data
        }
      },

      // Actions
      initializeApp: async () => {
        // Get config from platform (Electron, Capacitor, or web)
        const config = await Platform.getConfig()
        if (!get().serverUrl && config.defaultUrl) {
          set({ serverUrl: config.defaultUrl })
        }
        if (config.theme) {
          set({ theme: config.theme as 'dark' | 'light' })
        }

        // Load token from secure storage
        const secureToken = await Platform.getToken()
        if (secureToken) {
          set({ gatewayToken: secureToken })
        } else {
          // Migration: if Zustand has a token from old localStorage but secure storage is empty,
          // migrate it to secure storage
          const legacyToken = get().gatewayToken
          if (legacyToken) {
            await Platform.saveToken(legacyToken).catch(() => {})
          }
        }

        // Clean up legacy gatewayToken from localStorage
        try {
          const raw = localStorage.getItem('clawcontrol-storage')
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed.state?.gatewayToken) {
              delete parsed.state.gatewayToken
              localStorage.setItem('clawcontrol-storage', JSON.stringify(parsed))
            }
          }
        } catch { /* ignore */ }

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
        const { serverUrl, gatewayToken, client: existingClient, connecting } = get()

        // Prevent concurrent connect() calls (React StrictMode fires effects twice)
        if (connecting) {
          return
        }

        // Show settings if URL is not configured
        if (!serverUrl) {
          set({ showSettings: true })
          return
        }

        // Disconnect existing client to prevent duplicate event handling
        if (existingClient) {
          existingClient.disconnect()
          set({ client: null })
        }

        // Also kill any stale client surviving across Vite HMR reloads.
        const stale = (globalThis as any).__clawdeskClient as OpenClawClient | undefined
        if (stale && stale !== existingClient) {
          try { stale.disconnect() } catch { /* already closed */ }
        }

        set({ connecting: true })

        try {
          const { authMode } = get()
          const client = new OpenClawClient(serverUrl, gatewayToken, authMode)

          // Set up event handlers
          client.on('message', (msgArg: unknown) => {
            const msgPayload = msgArg as Message & { sessionKey?: string }
            const sessionKey = msgPayload.sessionKey
            const { currentSessionId } = get()
            const resolvedKey = sessionKey || currentSessionId
            const isCurrentSession = !sessionKey || !currentSessionId || sessionKey === currentSessionId

            // For non-current sessions, just clear streaming state
            if (!isCurrentSession) {
              if (resolvedKey) {
                set((state) => ({
                  streamingSessions: { ...state.streamingSessions, [resolvedKey]: false }
                }))
              }
              return
            }

            const message: Message = {
              id: msgPayload.id,
              role: msgPayload.role,
              content: msgPayload.content,
              timestamp: msgPayload.timestamp,
              thinking: msgPayload.thinking
            }
            let replacedStreaming = false

            set((state) => {
              const streamingSessions = resolvedKey
                ? { ...state.streamingSessions, [resolvedKey]: false }
                : state.streamingSessions

              // Replace streaming placeholder with the final server message
              const lastIdx = state.messages.length - 1
              const lastMsg = lastIdx >= 0 ? state.messages[lastIdx] : null
              if (lastMsg && lastMsg.role === 'assistant' && lastMsg.id.startsWith('streaming-')) {
                replacedStreaming = true
                const updated = [...state.messages]
                updated[lastIdx] = { ...message }
                return { messages: updated, streamingSessions }
              }

              const exists = state.messages.some(m => m.id === message.id)
              if (exists) {
                return {
                  messages: state.messages.map(m => m.id === message.id ? message : m),
                  streamingSessions
                }
              }
              return {
                messages: [...state.messages, message],
                streamingSessions
              }
            })

            // Only notify for non-streamed responses (streamEnd handles streamed ones)
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

          client.on('disconnected', () => {
            set({ connected: false, streamingSessions: {}, sessionHadChunks: {}, sessionToolCalls: {} })
            get().stopSubagentPolling()
          })

          client.on('certError', (payload: unknown) => {
            const { httpsUrl } = payload as { url: string; httpsUrl: string }
            get().showCertErrorModal(httpsUrl)
          })

          client.on('streamStart', (payload: unknown) => {
            const { sessionKey } = (payload || {}) as { sessionKey?: string }
            const { currentSessionId } = get()
            const resolvedKey = sessionKey || currentSessionId
            if (resolvedKey) {
              set((state) => ({
                streamingSessions: { ...state.streamingSessions, [resolvedKey]: true },
                sessionHadChunks: { ...state.sessionHadChunks, [resolvedKey]: false },
              }))
            }
            if (!sessionKey || !currentSessionId || sessionKey === currentSessionId) {
              get().startSubagentPolling()
            }
          })

          client.on('streamChunk', (chunkArg: unknown) => {
            const chunk = (chunkArg && typeof chunkArg === 'object')
              ? chunkArg as { text?: string; sessionKey?: string }
              : { text: String(chunkArg) }
            const text = chunk.text || ''
            const sessionKey = chunk.sessionKey
            // Skip empty chunks
            if (!text) return

            const { currentSessionId } = get()
            const resolvedKey = sessionKey || currentSessionId
            const isCurrentSession = !sessionKey || !currentSessionId || sessionKey === currentSessionId

            // For non-current sessions, just track that chunks arrived
            if (!isCurrentSession) {
              if (resolvedKey) {
                set((state) => ({
                  streamingSessions: { ...state.streamingSessions, [resolvedKey]: true },
                  sessionHadChunks: { ...state.sessionHadChunks, [resolvedKey]: true },
                }))
              }
              return
            }

            set((state) => {
              const perSession = resolvedKey ? {
                streamingSessions: { ...state.streamingSessions, [resolvedKey]: true },
                sessionHadChunks: { ...state.sessionHadChunks, [resolvedKey]: true },
              } : {}

              const messages = [...state.messages]
              const lastMessage = messages[messages.length - 1]

              // Only append to an active streaming placeholder — finalized messages
              // should not be extended (a new streaming message will be created instead).
              if (lastMessage && lastMessage.role === 'assistant' && lastMessage.id.startsWith('streaming-')) {
                const updatedMessage = { ...lastMessage, content: lastMessage.content + text }
                messages[messages.length - 1] = updatedMessage
                return { messages, ...perSession }
              } else {
                // Create new assistant placeholder
                const newMessage: Message = {
                  id: `streaming-${Date.now()}`,
                  role: 'assistant',
                  content: text,
                  timestamp: new Date().toISOString()
                }
                return { messages: [...messages, newMessage], ...perSession }
              }
            })
          })

          client.on('streamEnd', (payload: unknown) => {
            const { sessionKey } = (payload || {}) as { sessionKey?: string }
            const { currentSessionId } = get()
            const resolvedKey = sessionKey || get().streamingSessionId || currentSessionId

            // Notification / unread logic — works for any session, not just the viewed one
            if (resolvedKey && get().sessionHadChunks[resolvedKey]) {
              const { messages, notificationsEnabled, currentSessionId: activeSession } = get()
              // Only read last message if this is the current session (messages are loaded)
              if (resolvedKey === activeSession) {
                const lastMsg = messages[messages.length - 1]
                if (lastMsg?.role === 'assistant') {
                  const preview = lastMsg.content.slice(0, 100)
                  if (shouldNotify(notificationsEnabled, resolvedKey, activeSession)) {
                    Platform.showNotification('Agent responded', preview).catch(() => {})
                  }
                }
              }

              if (resolvedKey !== activeSession) {
                set((state) => ({
                  unreadCounts: {
                    ...state.unreadCounts,
                    [resolvedKey]: (state.unreadCounts[resolvedKey] || 0) + 1
                  }
                }))
                // Also notify for non-current sessions
                const { notificationsEnabled: ne } = get()
                if (ne) {
                  Platform.showNotification('Agent responded', `New message in another session`).catch(() => {})
                }
              }
            }

            // Clear per-session streaming state
            if (resolvedKey) {
              set((state) => ({
                streamingSessions: { ...state.streamingSessions, [resolvedKey]: false },
                sessionHadChunks: { ...state.sessionHadChunks, [resolvedKey]: false },
                streamingSessionId: state.streamingSessionId === resolvedKey ? null : state.streamingSessionId,
              }))
            } else {
              set({ streamingSessionId: null })
            }

            // Only stop subagent polling if the current session's stream ended
            if (!sessionKey || !currentSessionId || sessionKey === currentSessionId) {
              get().stopSubagentPolling()
            }
          })

          // When the server reports the canonical session key during streaming,
          // update local state so session lookups and history retrieval use the
          // correct key.
          client.on('streamSessionKey', (payload: unknown) => {
            const { sessionKey } = payload as { runId: string; sessionKey: string }
            if (!sessionKey) return

            const { streamingSessionId, currentSessionId } = get()
            const oldKey = streamingSessionId || currentSessionId
            if (!oldKey || sessionKey === oldKey) return

            set((state) => {
              // Rename the old session to the new key and remove any existing
              // session that already has that key to prevent duplicates.
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

              // Migrate per-session streaming state from old key to new key
              const { [oldKey]: wasStreaming, ...restStreaming } = state.streamingSessions
              const { [oldKey]: hadChunks, ...restChunks } = state.sessionHadChunks
              const { [oldKey]: toolCalls, ...restToolCalls } = state.sessionToolCalls

              return {
                currentSessionId: state.currentSessionId === oldKey ? sessionKey : state.currentSessionId,
                streamingSessionId: state.streamingSessionId === oldKey ? sessionKey : state.streamingSessionId,
                sessions,
                streamingSessions: wasStreaming !== undefined ? { ...restStreaming, [sessionKey]: wasStreaming } : state.streamingSessions,
                sessionHadChunks: hadChunks !== undefined ? { ...restChunks, [sessionKey]: hadChunks } : state.sessionHadChunks,
                sessionToolCalls: toolCalls !== undefined ? { ...restToolCalls, [sessionKey]: toolCalls } : state.sessionToolCalls,
              }
            })
          })

          client.on('toolCall', (payload: unknown) => {
            const tc = payload as { toolCallId: string; name: string; phase: string; result?: string; sessionKey?: string }
            const { currentSessionId } = get()
            if (tc.sessionKey && currentSessionId && tc.sessionKey !== currentSessionId) return

            const toolSessionKey = tc.sessionKey || currentSessionId || ''
            set((state) => {
              const currentToolCalls = state.sessionToolCalls[toolSessionKey] || []
              const idx = currentToolCalls.findIndex(t => t.toolCallId === tc.toolCallId)
              if (idx >= 0) {
                const updated = [...currentToolCalls]
                updated[idx] = {
                  ...updated[idx],
                  phase: tc.phase as 'start' | 'result',
                  result: tc.result
                }
                return { sessionToolCalls: { ...state.sessionToolCalls, [toolSessionKey]: updated } }
              }

              // New tool call: finalize the current streaming message so subsequent
              // stream chunks create a new bubble, and link this tool call to it.
              const { messages: finalizedMsgs, finalizedId } = finalizeStreamingMessage(state.messages)
              return {
                messages: finalizedMsgs,
                sessionToolCalls: {
                  ...state.sessionToolCalls,
                  [toolSessionKey]: [...currentToolCalls, {
                    toolCallId: tc.toolCallId,
                    name: tc.name,
                    phase: tc.phase as 'start' | 'result',
                    result: tc.result,
                    startedAt: Date.now(),
                    afterMessageId: finalizedId || undefined
                  }]
                }
              }
            })
          })

          // Event-driven subagent detection: when the primary session filter
          // blocks an event from a different session, the client emits this.
          client.on('subagentDetected', (payload: unknown) => {
            const { sessionKey } = payload as { sessionKey: string }
            if (!sessionKey) return

            set((state) => {
              // Skip if already tracked
              if (state.activeSubagents.some(a => a.sessionKey === sessionKey)) return state

              const { messages: finalizedMsgs, finalizedId } = finalizeStreamingMessage(state.messages)
              return {
                messages: finalizedMsgs,
                activeSubagents: [...state.activeSubagents, {
                  sessionKey,
                  label: sessionKey,
                  status: 'running' as const,
                  detectedAt: Date.now(),
                  afterMessageId: finalizedId || undefined
                }]
              }
            })
          })

          await client.connect()
          ;(globalThis as any).__clawdeskClient = client
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
        if ((globalThis as any).__clawdeskClient === client) {
          (globalThis as any).__clawdeskClient = null
        }
        set({ client: null, connected: false })
      },

      sendMessage: async (content: string) => {
        const { client, currentSessionId, thinkingEnabled, currentAgentId } = get()
        if (!client || !content.trim()) return

        let sessionId = currentSessionId
        if (!sessionId) {
          const session = await client.createSession(currentAgentId || undefined)
          sessionId = session.key || session.id
          set((state) => ({
            sessions: [session, ...state.sessions.filter(s => (s.key || s.id) !== sessionId)],
            currentSessionId: sessionId,
            messages: []
          }))
        }

        // Pre-seed the primary session filter so subagent events are dropped
        client.setPrimarySessionKey(sessionId!)

        // Reset streaming state for this session
        // Keep activeSubagents so previous subagent blocks stay visible in chat
        set((state) => ({
          streamingSessions: { ...state.streamingSessions, [sessionId!]: true },
          sessionHadChunks: { ...state.sessionHadChunks, [sessionId!]: false },
          sessionToolCalls: { ...state.sessionToolCalls, [sessionId!]: [] },
          streamingSessionId: sessionId
        }))

        // Add user message immediately
        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content,
          timestamp: new Date().toISOString()
        }
        set((state) => ({ messages: [...state.messages, userMessage] }))

        // Send to server
        try {
          await client.sendMessage({
            sessionId: sessionId,
            content,
            agentId: currentAgentId || undefined,
            thinking: thinkingEnabled
          })
        } catch {
          // If send fails, stop streaming state so UI remains usable.
          if (sessionId) {
            set((state) => ({
              streamingSessions: { ...state.streamingSessions, [sessionId]: false },
              streamingSessionId: null
            }))
          }
        }
      },

      abortChat: async () => {
        const { client, currentSessionId } = get()
        if (!client || !currentSessionId) return
        if (!get().streamingSessions[currentSessionId]) return
        try {
          await client.abortChat(currentSessionId)
        } catch {
          // Abort is best-effort
        }
        set((state) => ({
          streamingSessions: { ...state.streamingSessions, [currentSessionId]: false },
          sessionHadChunks: { ...state.sessionHadChunks, [currentSessionId]: false },
          sessionToolCalls: { ...state.sessionToolCalls, [currentSessionId]: [] },
          streamingSessionId: state.streamingSessionId === currentSessionId ? null : state.streamingSessionId,
        }))
      },

      fetchSessions: async () => {
        const { client } = get()
        if (!client) return
        const serverSessions = await client.listSessions()

        set((state) => {
          // Deduplicate server sessions by key to prevent duplicate React keys
          const seen = new Set<string>()
          const uniqueServerSessions = serverSessions.filter(s => {
            const key = s.key || s.id
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })

          // Filter out spawned subagent sessions — they clutter the sidebar
          // and are tracked separately via activeSubagents / SubagentBlock.
          // Always keep the currently active session even if it's spawned.
          const nonSpawnedSessions = uniqueServerSessions.filter(s => {
            const key = s.key || s.id
            if (key === state.currentSessionId) return true
            return !s.spawned && !s.parentSessionId
          })

          // Preserve local-only sessions (created but no message sent yet)
          // that aren't in the server's response — but never duplicate a key
          // that already exists in the server results.
          const allServerKeys = new Set(uniqueServerSessions.map(s => s.key || s.id))
          const keptKeys = new Set(nonSpawnedSessions.map(s => s.key || s.id))
          const localOnly = state.sessions.filter(s => {
            const key = s.key || s.id
            return !keptKeys.has(key) && !allServerKeys.has(key) && key.startsWith('agent:')
          })
          return { sessions: [...nonSpawnedSessions, ...localOnly] }
        })
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
        sidebarCollapsed: state.sidebarCollapsed,
        collapsedSessionGroups: state.collapsedSessionGroups,
        thinkingEnabled: state.thinkingEnabled,
        notificationsEnabled: state.notificationsEnabled
      })
    }
  )
)

// Per-session selectors — derive current-session values from the per-session maps.
const _emptyToolCalls: ToolCall[] = []
export const selectIsStreaming = (state: AppState) => !!state.streamingSessions[state.currentSessionId || '']
export const selectHadStreamChunks = (state: AppState) => !!state.sessionHadChunks[state.currentSessionId || '']
export const selectActiveToolCalls = (state: AppState) => state.sessionToolCalls[state.currentSessionId || ''] || _emptyToolCalls

// Vite HMR: disconnect stale WebSocket connections when modules are hot-replaced.
// Without this, old module versions keep processing events, causing duplicate streams.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const { client } = useStore.getState()
    if (client) {
      client.disconnect()
    }
  })
}
