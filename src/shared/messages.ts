import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// Message schemas are registered at module load, before the ECS engine seals.
// Every client action is an intention; only the server publishes outcomes.
export const Messages = {
  inviteRequest: Schemas.Map({
    toId: Schemas.String,
    fromName: Schemas.String
  }),
  inviteReceived: Schemas.Map({
    fromId: Schemas.String,
    fromName: Schemas.String,
    nonce: Schemas.String
  }),
  inviteSent: Schemas.Map({
    toId: Schemas.String,
    toName: Schemas.String,
    nonce: Schemas.String
  }),
  cancelInvite: Schemas.Map({ nonce: Schemas.String }),
  inviteCancelled: Schemas.Map({ fromId: Schemas.String }),
  inviteDecision: Schemas.Map({
    fromId: Schemas.String,
    nonce: Schemas.String,
    accepted: Schemas.Boolean,
    toName: Schemas.String
  }),
  inviteDeclined: Schemas.Map({
    byId: Schemas.String,
    byName: Schemas.String
  }),
  bondReady: Schemas.Map({
    sessionId: Schemas.String,
    partnerId: Schemas.String,
    partnerName: Schemas.String,
    level: Schemas.Int,
    totalSessions: Schemas.Int,
    totalPulses: Schemas.Int,
    streak: Schemas.Int
  }),
  startRequest: Schemas.Map({ sessionId: Schemas.String }),
  sessionStarted: Schemas.Map({
    sessionId: Schemas.String,
    firstPlayerId: Schemas.String,
    round: Schemas.Int,
    score: Schemas.Int
  }),
  pulseRequest: Schemas.Map({
    sessionId: Schemas.String,
    round: Schemas.Int
  }),
  pulseArrived: Schemas.Map({
    sessionId: Schemas.String,
    round: Schemas.Int,
    fromId: Schemas.String
  }),
  responseRequest: Schemas.Map({
    sessionId: Schemas.String,
    round: Schemas.Int
  }),
  roundResolved: Schemas.Map({
    sessionId: Schemas.String,
    round: Schemas.Int,
    success: Schemas.Boolean,
    delayMs: Schemas.Int,
    score: Schemas.Int,
    nextRound: Schemas.Int,
    nextPlayerId: Schemas.String,
    complete: Schemas.Boolean,
    level: Schemas.Int,
    totalSessions: Schemas.Int,
    totalPulses: Schemas.Int,
    streak: Schemas.Int,
    saved: Schemas.Boolean
  }),
  serverNotice: Schemas.Map({
    code: Schemas.String,
    message: Schemas.String
  })
}

export const room = registerMessages(Messages)
