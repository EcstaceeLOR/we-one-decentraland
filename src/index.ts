import { engine, InputAction, TouchScreenControls } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import './shared/messages'
import './shared/schemas'

export async function main() {
  if (isServer()) {
    const { initServer } = await import('./server/server')
    initServer()
    return
  }

  const [{ setupGame, updateGameSystem }, { animateMoteSystem }, { setupUi }] = await Promise.all([
    import('./game'),
    import('./mote'),
    import('./ui')
  ])
  // The native mobile HUD becomes a deliberate part of the game: the large
  // central action button sends or answers a heartbeat, while the joystick
  // remains available for exploring and meeting other players.
  TouchScreenControls.setMainAction(InputAction.IA_PRIMARY)
  TouchScreenControls.hide([
    InputAction.IA_SECONDARY,
    InputAction.IA_ACTION_3,
    InputAction.IA_ACTION_4,
    InputAction.IA_ACTION_5,
    InputAction.IA_ACTION_6
  ])

  setupGame()
  setupUi()
  engine.addSystem(updateGameSystem)
  engine.addSystem(animateMoteSystem)
}
