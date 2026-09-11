import {
  engine,
  InputAction,
  inputSystem,
  PlayerIdentityData,
  PointerEventType
} from '@dcl/sdk/ecs'
import { MessageBus } from '@dcl/sdk/message-bus'
import { getPlayer } from '@dcl/sdk/src/players'
import { appState, PlayerSummary, RESPONSE_WINDOW_MS, TOTAL_ROUNDS } from './state'
import { createBondMote, destroyBondMote, pulseMote, setMoteStage } from './mote'

type InviteMessage = {
  fromId: string
  fromName: string
  toId: string
  nonce: string
}

type InviteAnswerMessage = {
  accepted: boolean
  fromId: string
  fromName: string
  toId: string
  nonce: string
  sessionId: string
}

type StartMessage = {
  sessionId: string
  fromId: string
  toId: string
  firstPlayerId: string
}

type PulseMessage = {
  sessionId: string
  round: number
  fromId: string
  toId: string
}

type ResponseMessage = {
  sessionId: string
  round: number
  fromId: string
  toId: string
  success: boolean
  delayMs: number
}

const bus = new MessageBus()
let rosterTimer = 0

function id() {
  return appState.localPlayer?.userId ?? ''
}

function nameFor(userId: string) {
  const profile = getPlayer({ userId })
  return profile?.name || `${userId.slice(0, 6)}...${userId.slice(-4)}`
}

function makeSessionId(first: string, second: string, nonce: string) {
  return `${[first.toLowerCase(), second.toLowerCase()].sort().join('-')}-${nonce}`
}

function formBond(partner: PlayerSummary, sessionId: string) {
  appState.partner = partner
  appState.sessionId = sessionId
  appState.phase = 'bonded'
  appState.score = 0
  appState.round = 0
  appState.moteStage = 0
  appState.incomingInvite = undefined
  appState.outgoingTo = undefined
  appState.practice = false
  appState.status = `${partner.name} accepted. Your shared Mote is awake.`
  createBondMote(id(), partner.userId)
}

export function setupGame() {
  bus.on('we1:invite', (message: InviteMessage) => {
    if (!id() || message.toId !== id() || appState.partner) return
    appState.incomingInvite = {
      fromId: message.fromId,
      fromName: message.fromName,
      nonce: message.nonce
    }
    appState.phase = 'invited'
    appState.status = `${message.fromName} wants to create something neither of you can own alone.`
  })

  bus.on('we1:invite-answer', (message: InviteAnswerMessage) => {
    if (message.toId !== id()) return
    if (!message.accepted) {
      appState.outgoingTo = undefined
      appState.phase = 'finding'
      appState.status = `${message.fromName} passed for now. Choose someone else.`
      return
    }

    formBond(
      { userId: message.fromId, name: message.fromName, isGuest: false },
      message.sessionId
    )
  })

  bus.on('we1:start', (message: StartMessage) => {
    if (message.toId !== id() || message.sessionId !== appState.sessionId) return
    beginRounds(message.firstPlayerId)
  })

  bus.on('we1:pulse', (message: PulseMessage) => {
    if (
      message.toId !== id() ||
      message.sessionId !== appState.sessionId ||
      message.round !== appState.round ||
      message.fromId !== appState.expectedPlayerId
    ) return

    appState.pulseReady = true
    appState.pulseReceivedAt = Date.now()
    appState.waitingForResponse = false
    appState.status = 'Their pulse reached you. Answer before it fades.'
    pulseMote()
  })

  bus.on('we1:response', (message: ResponseMessage) => {
    if (
      message.toId !== id() ||
      message.sessionId !== appState.sessionId ||
      message.round !== appState.round
    ) return
    applyRoundResult(message.success, message.delayMs)
  })
}

export function invitePlayer(player: PlayerSummary) {
  const local = appState.localPlayer
  if (!local || player.userId === local.userId) return
  const nonce = `${Date.now()}`
  appState.outgoingTo = player
  appState.status = `Invitation sent to ${player.name}. Waiting for consent...`
  bus.emit('we1:invite', {
    fromId: local.userId,
    fromName: local.name,
    toId: player.userId,
    nonce
  } satisfies InviteMessage)
}

export function acceptInvite() {
  const local = appState.localPlayer
  const invite = appState.incomingInvite
  if (!local || !invite) return

  const sessionId = makeSessionId(local.userId, invite.fromId, invite.nonce)
  formBond(
    { userId: invite.fromId, name: invite.fromName, isGuest: false },
    sessionId
  )
  bus.emit('we1:invite-answer', {
    accepted: true,
    fromId: local.userId,
    fromName: local.name,
    toId: invite.fromId,
    nonce: invite.nonce,
    sessionId
  } satisfies InviteAnswerMessage)
}

export function declineInvite() {
  const local = appState.localPlayer
  const invite = appState.incomingInvite
  if (!local || !invite) return
  bus.emit('we1:invite-answer', {
    accepted: false,
    fromId: local.userId,
    fromName: local.name,
    toId: invite.fromId,
    nonce: invite.nonce,
    sessionId: ''
  } satisfies InviteAnswerMessage)
  appState.incomingInvite = undefined
  appState.phase = 'finding'
  appState.status = 'No pressure. Find the right person when you are ready.'
}

export function startBondGame() {
  const local = appState.localPlayer
  const partner = appState.partner
  if (!local || !partner) return
  const firstPlayerId = [local.userId, partner.userId].sort()[0]
  beginRounds(firstPlayerId)
  bus.emit('we1:start', {
    sessionId: appState.sessionId,
    fromId: local.userId,
    toId: partner.userId,
    firstPlayerId
  } satisfies StartMessage)
}

function beginRounds(firstPlayerId: string) {
  appState.phase = 'playing'
  appState.round = 1
  appState.score = 0
  appState.expectedPlayerId = firstPlayerId
  appState.pulseReady = false
  appState.waitingForResponse = false
  appState.status = firstPlayerId === id() ? 'Your turn. Send the first pulse.' : 'Stay ready. Your partner begins.'
}

export function tapHeartbeat() {
  if (appState.practice) {
    tapPractice()
    return
  }
  if (appState.phase !== 'playing' || !appState.partner) return

  if (appState.pulseReady) {
    respondToPulse()
    return
  }
  if (appState.expectedPlayerId !== id() || appState.waitingForResponse) return

  appState.waitingForResponse = true
  appState.status = 'Pulse sent. Hold the connection open.'
  pulseMote()
  bus.emit('we1:pulse', {
    sessionId: appState.sessionId,
    round: appState.round,
    fromId: id(),
    toId: appState.partner.userId
  } satisfies PulseMessage)
}

function respondToPulse(forceMiss = false) {
  if (!appState.partner || !appState.pulseReady) return
  const delayMs = Date.now() - appState.pulseReceivedAt
  const success = !forceMiss && delayMs <= RESPONSE_WINDOW_MS
  appState.pulseReady = false
  pulseMote()
  bus.emit('we1:response', {
    sessionId: appState.sessionId,
    round: appState.round,
    fromId: id(),
    toId: appState.partner.userId,
    success,
    delayMs
  } satisfies ResponseMessage)
  applyRoundResult(success, delayMs)
}

function applyRoundResult(success: boolean, delayMs: number) {
  if (success) appState.score += 1
  appState.moteStage = Math.min(3, Math.floor(appState.score / 2))
  setMoteStage(appState.moteStage)

  if (appState.round >= TOTAL_ROUNDS) {
    appState.phase = 'complete'
    appState.status = appState.score >= 6
      ? `Bond formed: ${appState.score}/${TOTAL_ROUNDS}. This Mote now carries both of your rhythm.`
      : `Bond found its first rhythm: ${appState.score}/${TOTAL_ROUNDS}. Try again and help it grow.`
    return
  }

  const previousSender = appState.expectedPlayerId
  appState.expectedPlayerId = previousSender === id()
    ? appState.partner?.userId ?? ''
    : id()
  appState.round += 1
  appState.waitingForResponse = false
  appState.pulseReady = false
  appState.status = success
    ? `Connected in ${(delayMs / 1000).toFixed(2)}s. Roles reversed.`
    : 'The pulse faded. Roles reversed; reconnect on the next one.'
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
  appState.status = 'Choose someone in the scene and make a WE/1 bond.'
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
    if (!identity.address || identity.address === localId || seen[identity.address]) continue
    seen[identity.address] = true
    const profile = getPlayer({ userId: identity.address })
    players.push({
      userId: identity.address,
      name: profile?.name || nameFor(identity.address),
      isGuest: identity.isGuest
    })
  }
  appState.players = players.slice(0, 6)

  if (!appState.localPlayer) appState.status = 'Loading your Decentraland identity...'
  else if (appState.phase === 'finding' && players.length === 0 && !appState.outgoingTo) {
    appState.status = 'You are first here. Invite a friend, or try the rhythm in Practice.'
  } else if (appState.phase === 'finding' && !appState.outgoingTo) {
    appState.status = `${players.length} ${players.length === 1 ? 'person is' : 'people are'} ready to connect.`
  }
}

export function updateGameSystem(dt: number) {
  rosterTimer += dt
  if (rosterTimer >= 1) {
    rosterTimer = 0
    refreshRoster()
  }

  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
    tapHeartbeat()
  }

  if (appState.pulseReady && Date.now() - appState.pulseReceivedAt > RESPONSE_WINDOW_MS) {
    respondToPulse(true)
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
