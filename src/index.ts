import { engine, InputAction, TouchScreenControls } from '@dcl/sdk/ecs'
import { setupGame, updateGameSystem } from './game'
import { animateMoteSystem } from './mote'
import { setupUi } from './ui'

export function main() {
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
