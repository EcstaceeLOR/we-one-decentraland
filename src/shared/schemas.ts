import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

export const ServerStatus = engine.defineComponent('we1::ServerStatus', {
  heartbeatAt: Schemas.Int64
})

if (isServer()) {
  ServerStatus.validateBeforeChange((value) => {
    return value.senderAddress === AUTH_SERVER_PEER_ID
  })
}
