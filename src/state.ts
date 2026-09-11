export type GamePhase = 'finding' | 'invited' | 'bonded' | 'playing' | 'complete'

export type PlayerSummary = {
  userId: string
  name: string
  isGuest: boolean
}

export type IncomingInvite = {
  fromId: string
  fromName: string
  nonce: string
}

export const TOTAL_ROUNDS = 8
export const RESPONSE_WINDOW_MS = 3200

export const appState: {
  phase: GamePhase
  localPlayer?: PlayerSummary
  players: PlayerSummary[]
  incomingInvite?: IncomingInvite
  outgoingTo?: PlayerSummary
  outgoingNonce: string
  cancelledInviteToId: string
  partner?: PlayerSummary
  sessionId: string
  round: number
  score: number
  expectedPlayerId: string
  pulseReady: boolean
  pulseReceivedAt: number
  waitingForResponse: boolean
  practice: boolean
  practiceResolveAt: number
  moteStage: number
  serverAlive: boolean
  serverEverSeen: boolean
  bondLevel: number
  totalSessions: number
  totalPulses: number
  streak: number
  saved: boolean
  status: string
} = {
  phase: 'finding',
  players: [],
  outgoingNonce: '',
  cancelledInviteToId: '',
  sessionId: '',
  round: 0,
  score: 0,
  expectedPlayerId: '',
  pulseReady: false,
  pulseReceivedAt: 0,
  waitingForResponse: false,
  practice: false,
  practiceResolveAt: 0,
  moteStage: 0,
  serverAlive: false,
  serverEverSeen: false,
  bondLevel: 1,
  totalSessions: 0,
  totalPulses: 0,
  streak: 0,
  saved: true,
  status: 'Waking the shared-world server...'
}
