import {
  engine,
  InputAction,
  inputSystem,
  PlayerIdentityData,
  PointerEventType
} from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getPlayer } from '@dcl/sdk/src/players'
import { room } from './shared/messages'
import { ServerStatus } from './shared/schemas'
import { appState, PlayerSummary, TOTAL_ROUNDS } from './state'
import { createBondMote, destroyBondMote, pulseMote, setMoteStage } from './mote'

const SERVER_FRESHNESS_MS = 6500
let rosterTimer = 0
let lastHeartbeatValue = ''
let lastHeartbeatSeenAt = 0

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function samePlayer(first: string, second: string) {
  return normalize(first) === normalize(second)
}

function id() {
  return appState.localPlayer?.userId ?? ''
}

function nameFor(userId: string) {
  const profile = getPlayer({ userId })
  return profile?.name || `${userId.slice(0, 6)}...${userId.slice(-4)}`
}

function markServerMessage() {
  lastHeartbeatSeenAt = Date.now()
  appState.serverAlive = true
  appState.serverEverSeen = true
}

function requireServer() {
  if (appState.serverAlive && room.isReady()) return true
  appState.status = appState.serverEverSeen
    ? 'Connection paused. Rejoining the shared-world server...'
    : 'The shared-world server is waking up. This can take about 15 seconds.'
  return false
}

function formBond(
  partner: PlayerSummary,
  sessionId: string,
  progress: { level: number; totalSessions: number; totalPulses: number; streak: number }
) {
  appState.partner = partner
  appState.sessionId = sessionId
  appState.phase = 'bonded'
  appState.score = 0
  appState.round = 0
  appState.moteStage = Math.min(3, Math.floor(progress.totalPulses / 12))
  appState.incomingInvite = undefined
  appState.outgoingTo = undefined
  appState.outgoingNonce = ''
  appState.cancelledInviteToId = ''
  appState.practice = false
  appState.bondLevel = progress.level
  appState.totalSessions = progress.totalSessions
  appState.totalPulses = progress.totalPulses
  appState.streak = progress.streak
  appState.saved = true
  appState.status = progress.totalSessions > 0
    ? `${partner.name} rejoined your level ${progress.level} Mote.`
    : `${partner.name} accepted. Your shared Mote is awake.`
  createBondMote(id(), partner.userId)
  setMoteStage(appState.moteStage)
}

function applyServerRound(data: {
  success: boolean
  delayMs: number
  score: number
  nextRound: number
  nextPlayerId: string
  complete: boolean
  level: number
  totalSessions: number
  totalPulses: number
  streak: number
  saved: boolean
}) {
  appState.score = data.score
  appState.moteStage = Math.min(3, Math.floor(data.score / 2))
  appState.waitingForResponse = false
  appState.pulseReady = false
  appState.bondLevel = data.level
  appState.totalSessions = data.totalSessions
  appState.totalPulses = data.totalPulses
  appState.streak = data.streak
  appState.saved = data.saved
  setMoteStage(appState.moteStage)

  if (data.complete) {
    appState.phase = 'complete'
    appState.status = data.saved
      ? `Bond saved: ${data.score}/${TOTAL_ROUNDS}. Return together to grow it.`
      : `Bond complete: ${data.score}/${TOTAL_ROUNDS}. Save is retrying in the background.`
    return
  }

  appState.round = data.nextRound
  appState.expectedPlayerId = data.nextPlayerId
  appState.status = data.success
    ? `Connected in ${(data.delayMs / 1000).toFixed(2)}s. Roles reversed.`
    : 'The pulse faded. Roles reversed; reconnect on the next one.'
}

export function setupGame() {
  room.onMessage('inviteReceived', (data) => {
    markServerMessage()
    if (!id() || appState.partner) return
    appState.incomingInvite = data
    appState.phase = 'invited'
    appState.status = `${data.fromName} wants to create something neither of you can own alone.`
  })

  room.onMessage('inviteSent', (data) => {
    markServerMessage()
    if (appState.cancelledInviteToId && samePlayer(appState.cancelledInviteToId, data.toId)) {
      appState.cancelledInviteToId = ''
      void room.send('cancelInvite', { nonce: data.nonce })
      return
    }
    if (!appState.outgoingTo || !samePlayer(appState.outgoingTo.userId, data.toId)) return
    appState.outgoingNonce = data.nonce
  })

  room.onMessage('inviteCancelled', (data) => {
    markServerMessage()
    if (!appState.incomingInvite || !samePlayer(appState.incomingInvite.fromId, data.fromId)) return
    appState.incomingInvite = undefined
    appState.phase = 'finding'
    appState.status = 'That invitation was cancelled. No action is needed.'
  })

  room.onMessage('inviteDeclined', (data) => {
    markServerMessage()
    appState.outgoingTo = undefined
    appState.outgoingNonce = ''
    appState.phase = 'finding'
    appState.status = `${data.byName} passed for now. Choose someone else.`
  })

  room.onMessage('bondReady', (data) => {
    markServerMessage()
    formBond(
      { userId: data.partnerId, name: data.partnerName, isGuest: false },
      data.sessionId,
      data
    )
  })

  room.onMessage('sessionStarted', (data) => {
    markServerMessage()
    if (data.sessionId !== appState.sessionId) return
    appState.phase = 'playing'
    appState.round = data.round
    appState.score = data.score
    appState.expectedPlayerId = data.firstPlayerId
    appState.pulseReady = false
    appState.waitingForResponse = false
    appState.status = samePlayer(data.firstPlayerId, id())
      ? 'Your turn. Send the first pulse.'
      : 'Stay ready. Your partner begins.'
  })

  room.onMessage('pulseArrived', (data) => {
    markServerMessage()
    if (data.sessionId !== appState.sessionId || data.round !== appState.round) return
    appState.pulseReady = true
    appState.pulseReceivedAt = Date.now()
    appState.waitingForResponse = false
    appState.status = 'Their pulse reached you. Answer before it fades.'
    pulseMote()
  })

  room.onMessage('roundResolved', (data) => {
    markServerMessage()
    if (data.sessionId !== appState.sessionId || data.round !== appState.round) return
    applyServerRound(data)
  })

  room.onMessage('serverNotice', (data) => {
    markServerMessage()
    if (data.code === 'PARTNER_LEFT') {
      resetExperience()
      appState.status = data.message
      return
    }
    if (data.code === 'PLAYER_LEFT' || data.code === 'INVITE_EXPIRED' || data.code === 'PLAYER_BUSY') {
      appState.outgoingTo = undefined
      appState.outgoingNonce = ''
      if (!appState.partner) appState.phase = 'finding'
    }
    appState.status = data.message
  })
}

export function invitePlayer(player: PlayerSummary) {
  const local = appState.localPlayer
  if (!local || samePlayer(player.userId, local.userId) || !requireServer()) return
  appState.outgoingTo = player
  appState.outgoingNonce = ''
  appState.cancelledInviteToId = ''
  appState.status = `Invitation sent to ${player.name}. Waiting for consent...`
  void room.send('inviteRequest', { toId: player.userId, fromName: local.name })
}

export function cancelInvite() {
  if (appState.outgoingNonce && room.isReady()) {
    void room.send('cancelInvite', { nonce: appState.outgoingNonce })
  } else if (appState.outgoingTo) {
    appState.cancelledInviteToId = appState.outgoingTo.userId
  }
  appState.outgoingTo = undefined
  appState.outgoingNonce = ''
  appState.status = 'Invitation cancelled. Choose someone when it feels right.'
}

export function acceptInvite() {
  const local = appState.localPlayer
  const invite = appState.incomingInvite
  if (!local || !invite || !requireServer()) return
  void room.send('inviteDecision', {
    fromId: invite.fromId,
    nonce: invite.nonce,
    accepted: true,
    toName: local.name
  })
  appState.status = 'Creating your shared Mote...'
}

export function declineInvite() {
  const local = appState.localPlayer
  const invite = appState.incomingInvite
  if (!local || !invite) return
  if (requireServer()) {
    void room.send('inviteDecision', {
      fromId: invite.fromId,
      nonce: invite.nonce,
      accepted: false,
      toName: local.name
    })
  }
  appState.incomingInvite = undefined
  appState.phase = 'finding'
  appState.status = 'No pressure. Find the right person when you are ready.'
}

export function startBondGame() {
  if (appState.phase !== 'bonded' || !appState.sessionId || !requireServer()) return
  appState.status = 'Asking the shared-world server to begin...'
  void room.send('startRequest', { sessionId: appState.sessionId })
}

export function tapHeartbeat() {
  if (appState.practice) {
    tapPractice()
    return
  }
  if (appState.phase !== 'playing' || !appState.partner || !requireServer()) return

  if (appState.pulseReady) {
    appState.pulseReady = false
    appState.waitingForResponse = true
    appState.status = 'Answer sent. The shared Mote is listening...'
    pulseMote()
    void room.send('responseRequest', {
      sessionId: appState.sessionId,
      round: appState.round
    })
    return
  }

  if (!samePlayer(appState.expectedPlayerId, id()) || appState.waitingForResponse) return
  appState.waitingForResponse = true
  appState.status = 'Pulse sent. Hold the connection open.'
  pulseMote()
  void room.send('pulseRequest', {
    sessionId: appState.sessionId,
    round: appState.round
  })
}

export function startPractice() {
  const local = appState.localPlayer
  if (!local) return
  appState.partner = { userId: 'practice', name: 'Echo Twin', isGuest: true }
  appState.sessionId = `practice-${Date.now()}`
  appState.practice = true
  appState.phase = 'playing'
  appState.round = 1
  appState.score = 0
  appState.expectedPlayerId = local.userId
  appState.waitingForResponse = false
  appState.status = 'Practice the gesture. Real bonds only form with another person.'
  createBondMote(local.userId, 'practice')
}

function tapPractice() {
  if (appState.phase !== 'playing' || appState.practiceResolveAt > 0) return
  appState.practiceResolveAt = Date.now() + 600
  appState.waitingForResponse = true
  appState.status = 'Pulse sent. Your Echo Twin is answering...'
  pulseMote()
}

export function resetExperience() {
  destroyBondMote()
  appState.phase = 'finding'
  appState.incomingInvite = undefined
  appState.outgoingTo = undefined
  appState.outgoingNonce = ''
  appState.cancelledInviteToId = ''
  appState.partner = undefined
  appState.sessionId = ''
  appState.round = 0
  appState.score = 0
  appState.expectedPlayerId = ''
  appState.pulseReady = false
  appState.waitingForResponse = false
  appState.practice = false
  appState.practiceResolveAt = 0
  appState.moteStage = 0
  appState.bondLevel = 1
  appState.totalSessions = 0
  appState.totalPulses = 0
  appState.streak = 0
  appState.saved = true
  appState.status = appState.serverAlive
    ? 'Choose someone in the scene and make a WE/1 bond.'
    : 'Waking the shared-world server...'
}

function refreshRoster() {
  const localProfile = getPlayer()
  if (localProfile) {
    appState.localPlayer = {
      userId: localProfile.userId,
      name: localProfile.name || 'Explorer',
      isGuest: localProfile.isGuest
    }
  }

  const localId = id()
  const seen: Record<string, boolean> = {}
  const players: PlayerSummary[] = []
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const address = identity.address
    const key = normalize(address)
    if (!address || samePlayer(address, localId) || seen[key]) continue
    seen[key] = true
    const profile = getPlayer({ userId: address })
    players.push({
      userId: address,
      name: profile?.name || nameFor(address),
      isGuest: identity.isGuest
    })
  }
  appState.players = players.slice(0, 6)

  if (!appState.localPlayer) appState.status = 'Loading your Decentraland identity...'
  else if (!appState.serverAlive && !appState.practice) {
    appState.status = appState.serverEverSeen
      ? 'Connection paused. Rejoining the shared-world server...'
      : 'The shared-world server is waking up. Practice is available while you wait.'
  } else if (appState.phase === 'finding' && players.length === 0 && !appState.outgoingTo) {
    appState.status = 'You are first here. Invite a friend, or try the rhythm in Practice.'
  } else if (appState.phase === 'finding' && !appState.outgoingTo) {
    appState.status = `${players.length} ${players.length === 1 ? 'person is' : 'people are'} ready to connect.`
  }
}

function refreshServerHealth() {
  for (const [, status] of engine.getEntitiesWith(ServerStatus)) {
    const heartbeat = String(status.heartbeatAt)
    if (heartbeat !== lastHeartbeatValue) {
      lastHeartbeatValue = heartbeat
      lastHeartbeatSeenAt = Date.now()
      appState.serverEverSeen = true
    }
  }
  appState.serverAlive = room.isReady() && isStateSyncronized() &&
    lastHeartbeatSeenAt > 0 && Date.now() - lastHeartbeatSeenAt <= SERVER_FRESHNESS_MS
}

export function updateGameSystem(dt: number) {
  refreshServerHealth()
  rosterTimer += dt
  if (rosterTimer >= 1) {
    rosterTimer = 0
    refreshRoster()
  }

  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
    tapHeartbeat()
  }

  if (appState.practice && appState.practiceResolveAt > 0 && Date.now() >= appState.practiceResolveAt) {
    appState.practiceResolveAt = 0
    appState.waitingForResponse = false
    appState.score += 1
    appState.moteStage = Math.min(3, Math.floor(appState.score / 2))
    setMoteStage(appState.moteStage)
    pulseMote()
    if (appState.round >= TOTAL_ROUNDS) {
      appState.phase = 'complete'
      appState.status = 'Practice complete. Find another explorer to create a real shared Mote.'
    } else {
      appState.round += 1
      appState.status = 'Echo received. Send the next pulse when you are ready.'
    }
  }
}
