import { engine, Entity, PlayerIdentityData } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { room } from '../shared/messages'
import { ServerStatus } from '../shared/schemas'

type PendingInvite = {
  fromId: string
  fromName: string
  toId: string
  createdAt: number
}

type BondRecord = {
  version: 1
  players: [string, string]
  names: [string, string]
  createdAt: number
  lastPlayedAt: number
  totalSessions: number
  totalPulses: number
  streak: number
  level: number
}

type SessionPhase = 'bonded' | 'playing' | 'awaiting-response' | 'resolving' | 'complete'

type BondSession = {
  id: string
  players: [string, string]
  names: [string, string]
  record: BondRecord
  phase: SessionPhase
  round: number
  score: number
  expectedPlayerId: string
  pulseSentAt: number
}

const RESPONSE_WINDOW_MS = 3200
const INVITE_EXPIRY_MS = 120000
const HEARTBEAT_INTERVAL_MS = 2000
const DAY_MS = 86400000
const SERVER_STATUS_SYNC_ID = 1001

const invites = new Map<string, PendingInvite>()
const sessions = new Map<string, BondSession>()
const dirtyBonds = new Map<string, BondRecord>()
let statusEntity: Entity | undefined
let lastHeartbeatAt = 0
let lastStorageRetryAt = 0
let storageRetryInFlight = false
let nonceCounter = 0

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function cleanName(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 32) : 'Explorer'
}

function pairKey(first: string, second: string) {
  return `we1:bond:${[normalize(first), normalize(second)].sort().join(':')}`
}

function isPlayerPresent(address: string) {
  const target = normalize(address)
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (normalize(identity.address) === target) return true
  }
  return false
}

function activeSessionFor(address: string) {
  const target = normalize(address)
  for (const session of sessions.values()) {
    if (session.phase !== 'complete' && session.players.includes(target)) return session
  }
  return undefined
}

function hasPendingInvite(address: string) {
  const target = normalize(address)
  for (const invite of invites.values()) {
    if (invite.fromId === target || invite.toId === target) return true
  }
  return false
}

function removeOtherInvites(first: string, second: string) {
  for (const [nonce, invite] of invites) {
    if (
      invite.fromId === first || invite.toId === first ||
      invite.fromId === second || invite.toId === second
    ) invites.delete(nonce)
  }
}

function sendNotice(to: string, code: string, message: string) {
  void room.send('serverNotice', { code, message }, { to: [to] })
}

function makeDefaultBond(players: [string, string], names: [string, string]): BondRecord {
  return {
    version: 1,
    players,
    names,
    createdAt: Date.now(),
    lastPlayedAt: 0,
    totalSessions: 0,
    totalPulses: 0,
    streak: 0,
    level: 1
  }
}

async function loadBond(players: [string, string], names: [string, string]) {
  try {
    const stored = await Storage.get<BondRecord>(pairKey(players[0], players[1]))
    if (!stored || stored.version !== 1) return makeDefaultBond(players, names)
    return {
      ...stored,
      players,
      names
    }
  } catch (error) {
    console.error('[SERVER] Failed to load bond', error)
    return undefined
  }
}

function sendBondReady(session: BondSession) {
  const [first, second] = session.players
  const [firstName, secondName] = session.names
  const common = {
    sessionId: session.id,
    level: session.record.level,
    totalSessions: session.record.totalSessions,
    totalPulses: session.record.totalPulses,
    streak: session.record.streak
  }
  void room.send('bondReady', {
    ...common,
    partnerId: second,
    partnerName: secondName
  }, { to: [first] })
  void room.send('bondReady', {
    ...common,
    partnerId: first,
    partnerName: firstName
  }, { to: [second] })
}

async function acceptInvite(nonce: string, invite: PendingInvite, acceptingName: string) {
  const players: [string, string] = [invite.fromId, invite.toId]
  const names: [string, string] = [invite.fromName, cleanName(acceptingName)]
  const record = await loadBond(players, names)
  if (!record) {
    sendNotice(invite.fromId, 'STORAGE_UNAVAILABLE', 'Bond storage is temporarily unavailable. Please try again.')
    sendNotice(invite.toId, 'STORAGE_UNAVAILABLE', 'Bond storage is temporarily unavailable. Please try again.')
    invites.delete(nonce)
    return
  }
  const sessionId = `we1-${Date.now()}-${nonceCounter++}`
  const session: BondSession = {
    id: sessionId,
    players,
    names,
    record,
    phase: 'bonded',
    round: 0,
    score: 0,
    expectedPlayerId: '',
    pulseSentAt: 0
  }
  sessions.set(sessionId, session)
  removeOtherInvites(invite.fromId, invite.toId)
  sendBondReady(session)
  console.log(`[SERVER] Bond ready ${sessionId}`)
}

function findSession(sessionId: string, sender: string) {
  const session = sessions.get(sessionId)
  if (!session || !session.players.includes(normalize(sender))) return undefined
  return session
}

function sendSessionStarted(session: BondSession) {
  void room.send('sessionStarted', {
    sessionId: session.id,
    firstPlayerId: session.expectedPlayerId,
    round: session.round,
    score: session.score
  }, { to: session.players })
}

function computeStreak(record: BondRecord, now: number) {
  if (record.lastPlayedAt <= 0) return 1
  const today = Math.floor(now / DAY_MS)
  const previousDay = Math.floor(record.lastPlayedAt / DAY_MS)
  if (previousDay === today) return Math.max(1, record.streak)
  if (previousDay === today - 1) return Math.max(1, record.streak + 1)
  return 1
}

async function persistCompletedBond(session: BondSession) {
  const now = Date.now()
  const record: BondRecord = {
    ...session.record,
    names: session.names,
    lastPlayedAt: now,
    totalSessions: session.record.totalSessions + 1,
    totalPulses: session.record.totalPulses + session.score,
    streak: computeStreak(session.record, now),
    level: Math.min(99, 1 + Math.floor((session.record.totalPulses + session.score) / 12))
  }
  session.record = record
  const key = pairKey(session.players[0], session.players[1])
  try {
    const saved = await Storage.set(key, record)
    if (saved) dirtyBonds.delete(key)
    else dirtyBonds.set(key, record)
    return saved
  } catch (error) {
    console.error('[SERVER] Failed to persist bond', error)
    dirtyBonds.set(key, record)
    return false
  }
}

async function retryDirtyBonds() {
  if (storageRetryInFlight || dirtyBonds.size === 0) return
  storageRetryInFlight = true
  try {
    for (const [key, record] of dirtyBonds) {
      try {
        if (await Storage.set(key, record)) dirtyBonds.delete(key)
      } catch (error) {
        console.error(`[SERVER] Storage retry failed for ${key}`, error)
      }
    }
  } finally {
    storageRetryInFlight = false
  }
}

async function resolveRound(session: BondSession, success: boolean, delayMs: number) {
  if (session.phase !== 'awaiting-response') return
  session.phase = 'resolving'
  if (success) session.score += 1

  const resolvedRound = session.round
  const complete = resolvedRound >= 8
  let saved = true

  if (complete) {
    session.phase = 'complete'
    saved = await persistCompletedBond(session)
  } else {
    session.expectedPlayerId = session.expectedPlayerId === session.players[0]
      ? session.players[1]
      : session.players[0]
    session.round += 1
    session.phase = 'playing'
  }

  void room.send('roundResolved', {
    sessionId: session.id,
    round: resolvedRound,
    success,
    delayMs: Math.max(0, Math.min(9999, Math.floor(delayMs))),
    score: session.score,
    nextRound: session.round,
    nextPlayerId: complete ? '' : session.expectedPlayerId,
    complete,
    level: session.record.level,
    totalSessions: session.record.totalSessions,
    totalPulses: session.record.totalPulses,
    streak: session.record.streak,
    saved
  }, { to: session.players })
}

function registerHandlers() {
  room.onMessage('inviteRequest', (data, context) => {
    if (!context) return
    const fromId = normalize(context.from)
    const toId = normalize(data.toId)
    if (!toId || toId === fromId) {
      sendNotice(fromId, 'INVALID_TARGET', 'Choose another explorer.')
      return
    }
    if (!isPlayerPresent(toId)) {
      sendNotice(fromId, 'PLAYER_LEFT', 'That explorer is no longer in the scene.')
      return
    }
    if (activeSessionFor(fromId) || activeSessionFor(toId) || hasPendingInvite(fromId) || hasPendingInvite(toId)) {
      sendNotice(fromId, 'PLAYER_BUSY', 'One of you is already considering another bond.')
      return
    }

    const nonce = `${Date.now()}-${nonceCounter++}`
    const invite: PendingInvite = {
      fromId,
      fromName: cleanName(data.fromName),
      toId,
      createdAt: Date.now()
    }
    invites.set(nonce, invite)
    void room.send('inviteReceived', {
      fromId,
      fromName: invite.fromName,
      nonce
    }, { to: [toId] })
    void room.send('inviteSent', { toId, toName: toId, nonce }, { to: [fromId] })
  })

  room.onMessage('cancelInvite', (data, context) => {
    if (!context) return
    const invite = invites.get(data.nonce)
    if (invite?.fromId === normalize(context.from)) {
      invites.delete(data.nonce)
      void room.send('inviteCancelled', { fromId: invite.fromId }, { to: [invite.toId] })
    }
  })

  room.onMessage('inviteDecision', (data, context) => {
    if (!context) return
    const sender = normalize(context.from)
    const invite = invites.get(data.nonce)
    if (
      !invite ||
      invite.toId !== sender ||
      invite.fromId !== normalize(data.fromId) ||
      Date.now() - invite.createdAt > INVITE_EXPIRY_MS
    ) {
      sendNotice(sender, 'INVITE_EXPIRED', 'That invitation has expired. Ask for a new one.')
      return
    }

    if (!data.accepted) {
      invites.delete(data.nonce)
      void room.send('inviteDeclined', {
        byId: sender,
        byName: cleanName(data.toName)
      }, { to: [invite.fromId] })
      return
    }
    if (!isPlayerPresent(invite.fromId) || activeSessionFor(sender) || activeSessionFor(invite.fromId)) {
      invites.delete(data.nonce)
      sendNotice(sender, 'PLAYER_LEFT', 'That explorer is no longer available.')
      sendNotice(invite.fromId, 'PLAYER_BUSY', 'The invitation could not be completed.')
      return
    }
    invites.delete(data.nonce)
    void acceptInvite(data.nonce, invite, data.toName)
  })

  room.onMessage('startRequest', (data, context) => {
    if (!context) return
    const sender = normalize(context.from)
    const session = findSession(data.sessionId, sender)
    if (!session || session.phase !== 'bonded') return
    session.phase = 'playing'
    session.round = 1
    session.score = 0
    session.expectedPlayerId = [...session.players].sort()[0]
    sendSessionStarted(session)
  })

  room.onMessage('pulseRequest', (data, context) => {
    if (!context) return
    const sender = normalize(context.from)
    const session = findSession(data.sessionId, sender)
    if (
      !session ||
      session.phase !== 'playing' ||
      session.round !== data.round ||
      session.expectedPlayerId !== sender
    ) return

    session.phase = 'awaiting-response'
    session.pulseSentAt = Date.now()
    const receiver = session.players[0] === sender ? session.players[1] : session.players[0]
    void room.send('pulseArrived', {
      sessionId: session.id,
      round: session.round,
      fromId: sender
    }, { to: [receiver] })
  })

  room.onMessage('responseRequest', (data, context) => {
    if (!context) return
    const sender = normalize(context.from)
    const session = findSession(data.sessionId, sender)
    if (!session || session.phase !== 'awaiting-response' || session.round !== data.round) return
    const receiver = session.players[0] === session.expectedPlayerId ? session.players[1] : session.players[0]
    if (sender !== receiver) return
    const delayMs = Date.now() - session.pulseSentAt
    void resolveRound(session, delayMs <= RESPONSE_WINDOW_MS, delayMs)
  })
}

function serverSystem() {
  if (!statusEntity) return
  const now = Date.now()
  if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatAt = now
    const status = ServerStatus.getMutableOrNull(statusEntity)
    if (status) status.heartbeatAt = now
  }

  for (const session of sessions.values()) {
    if (
      session.phase !== 'complete' &&
      (!isPlayerPresent(session.players[0]) || !isPlayerPresent(session.players[1]))
    ) {
      const presentPlayer = isPlayerPresent(session.players[0]) ? session.players[0] : session.players[1]
      sendNotice(presentPlayer, 'PARTNER_LEFT', 'Your partner left the scene. The Mote is waiting for your next reunion.')
      sessions.delete(session.id)
      continue
    }
    if (
      session.phase === 'awaiting-response' &&
      now - session.pulseSentAt > RESPONSE_WINDOW_MS
    ) {
      void resolveRound(session, false, now - session.pulseSentAt)
    }
  }

  for (const [nonce, invite] of invites) {
    if (now - invite.createdAt > INVITE_EXPIRY_MS) invites.delete(nonce)
  }

  if (now - lastStorageRetryAt >= 30000) {
    lastStorageRetryAt = now
    void retryDirtyBonds()
  }
}

export function initServer() {
  console.log('[SERVER] Initializing WE/1 Multiplayer Server')
  statusEntity = engine.addEntity()
  const now = Date.now()
  ServerStatus.create(statusEntity, { heartbeatAt: now })
  syncEntity(statusEntity, [ServerStatus.componentId], SERVER_STATUS_SYNC_ID)
  lastHeartbeatAt = now
  registerHandlers()
  engine.addSystem(serverSystem)
}
