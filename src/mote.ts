import { engine, Entity, Material, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

type MoteRig = {
  root: Entity
  body: Entity
  orbiters: Entity[]
  stage: number
  pulse: number
}

let rig: MoteRig | undefined
let elapsed = 0

const PALETTES = [
  [Color4.create(0.24, 0.94, 0.82, 1), Color4.create(0.98, 0.38, 0.65, 1)],
  [Color4.create(0.52, 0.42, 1, 1), Color4.create(1, 0.72, 0.22, 1)],
  [Color4.create(0.22, 0.72, 1, 1), Color4.create(0.66, 1, 0.42, 1)]
]

function hash(value: string): number {
  let result = 2166136261
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }
  return Math.abs(result)
}

export function createBondMote(firstId: string, secondId: string) {
  if (rig) destroyBondMote()

  const seed = [firstId.toLowerCase(), secondId.toLowerCase()].sort().join(':')
  const palette = PALETTES[hash(seed) % PALETTES.length]
  const root = engine.addEntity()
  Transform.create(root, { position: Vector3.create(8, 2.4, 8) })

  const body = engine.addEntity()
  Transform.create(body, {
    parent: root,
    scale: Vector3.create(0.85, 0.85, 0.85)
  })
  MeshRenderer.setSphere(body)
  Material.setPbrMaterial(body, {
    albedoColor: palette[0],
    emissiveColor: palette[0],
    emissiveIntensity: 1.8,
    metallic: 0.15,
    roughness: 0.25
  })

  const orbiters: Entity[] = []
  for (let i = 0; i < 4; i++) {
    const orbiter = engine.addEntity()
    Transform.create(orbiter, {
      parent: root,
      scale: Vector3.create(0.16, 0.16, 0.16)
    })
    MeshRenderer.setSphere(orbiter)
    Material.setPbrMaterial(orbiter, {
      albedoColor: i % 2 === 0 ? palette[1] : palette[0],
      emissiveColor: i % 2 === 0 ? palette[1] : palette[0],
      emissiveIntensity: 2
    })
    orbiters.push(orbiter)
  }

  rig = { root, body, orbiters, stage: 0, pulse: 0 }
}

export function destroyBondMote() {
  if (!rig) return
  for (const entity of rig.orbiters) engine.removeEntity(entity)
  engine.removeEntity(rig.body)
  engine.removeEntity(rig.root)
  rig = undefined
}

export function pulseMote() {
  if (rig) rig.pulse = 1
}

export function setMoteStage(stage: number) {
  if (rig) rig.stage = Math.max(0, Math.min(3, stage))
}

export function animateMoteSystem(dt: number) {
  if (!rig) return
  elapsed += dt
  rig.pulse = Math.max(0, rig.pulse - dt * 2.7)

  const rootTransform = Transform.getMutable(rig.root)
  rootTransform.position.y = 2.4 + Math.sin(elapsed * 1.7) * 0.16
  rootTransform.rotation = Quaternion.fromEulerDegrees(0, elapsed * 20, 0)

  const bodyScale = 0.85 + rig.stage * 0.09 + rig.pulse * 0.3
  Transform.getMutable(rig.body).scale = Vector3.create(bodyScale, bodyScale, bodyScale)

  const radius = 1.05 + rig.stage * 0.18
  for (let i = 0; i < rig.orbiters.length; i++) {
    const angle = elapsed * (0.8 + rig.stage * 0.12) + (Math.PI * 2 * i) / rig.orbiters.length
    const orbit = Transform.getMutable(rig.orbiters[i])
    orbit.position = Vector3.create(
      Math.cos(angle) * radius,
      Math.sin(angle * 2) * 0.24,
      Math.sin(angle) * radius
    )
    const orbScale = 0.16 + rig.stage * 0.035 + rig.pulse * 0.08
    orbit.scale = Vector3.create(orbScale, orbScale, orbScale)
  }
}
