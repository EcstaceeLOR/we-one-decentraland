import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import {
  acceptInvite,
  declineInvite,
  invitePlayer,
  resetExperience,
  startBondGame,
  startPractice,
  tapHeartbeat
} from './game'
import { appState, PlayerSummary, TOTAL_ROUNDS } from './state'

const COLORS = {
  ink: Color4.create(0.96, 0.97, 1, 1),
  muted: Color4.create(0.72, 0.76, 0.86, 1),
  panel: Color4.create(0.055, 0.045, 0.11, 0.94),
  card: Color4.create(0.12, 0.10, 0.23, 0.96),
  cyan: Color4.create(0.24, 0.94, 0.82, 1),
  pink: Color4.create(0.98, 0.38, 0.65, 1),
  track: Color4.create(0.22, 0.19, 0.34, 1)
}

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(WeOneUi, {
    virtualWidth: 1920,
    virtualHeight: 1080,
    screenInset: 'device'
  })
}

const Text = (value: string, height = 46, fontSize = 25, color = COLORS.ink) => (
  <Label
    value={value}
    fontSize={fontSize}
    color={color}
    textAlign='middle-left'
    uiTransform={{ width: '100%', height }}
  />
)

const PlayerButton = (player: PlayerSummary) => (
  <Button
    key={player.userId}
    value={`Connect with ${player.name}`}
    variant='secondary'
    fontSize={23}
    uiTransform={{ width: '100%', height: 64, margin: '6px 0' }}
    onMouseDown={() => invitePlayer(player)}
  />
)

const Progress = () => {
  const percent = `${Math.max(0, Math.min(100, (appState.score / TOTAL_ROUNDS) * 100))}%` as `${number}%`
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: 22, margin: '12px 0' }}
      uiBackground={{ color: COLORS.track }}
    >
      <UiEntity
        uiTransform={{ width: percent, height: '100%' }}
        uiBackground={{ color: COLORS.cyan }}
      />
    </UiEntity>
  )
}

const FindingPanel = () => (
  <UiEntity uiTransform={{ width: '100%', height: 420, flexDirection: 'column' }}>
    {Text('Choose a person, not a username to collect.', 62, 28)}
    {Text('Your Mote will belong to the relationship between you.', 64, 21, COLORS.muted)}
    <UiEntity
      uiTransform={{ width: '100%', height: 210, flexDirection: 'column', overflow: 'scroll', margin: '8px 0' }}
    >
      {appState.players.length > 0
        ? appState.players.map(PlayerButton)
        : Text('No other explorer is visible yet.', 64, 22, COLORS.muted)}
    </UiEntity>
    <Button
      value='Practice the pulse'
      variant='secondary'
      fontSize={23}
      disabled={!appState.localPlayer}
      uiTransform={{ width: '100%', height: 64, margin: '8px 0' }}
      onMouseDown={startPractice}
    />
  </UiEntity>
)

const InvitePanel = () => (
  <UiEntity uiTransform={{ width: '100%', height: 330, flexDirection: 'column' }}>
    {Text(`${appState.incomingInvite?.fromName ?? 'Someone'} sent a WE/1 invitation.`, 70, 28)}
    {Text('Accepting creates a shared creature and starts a cooperative ritual.', 84, 21, COLORS.muted)}
    <Button
      value='Accept and create our Mote'
      variant='primary'
      fontSize={24}
      uiTransform={{ width: '100%', height: 72, margin: '8px 0' }}
      onMouseDown={acceptInvite}
    />
    <Button
      value='Not now'
      variant='secondary'
      fontSize={22}
      uiTransform={{ width: '100%', height: 58, margin: '4px 0' }}
      onMouseDown={declineInvite}
    />
  </UiEntity>
)

const BondedPanel = () => (
  <UiEntity uiTransform={{ width: '100%', height: 320, flexDirection: 'column' }}>
    {Text(`You + ${appState.partner?.name ?? 'your partner'}`, 64, 30, COLORS.cyan)}
    {Text('Eight alternating pulses. Listen, answer, switch roles.', 72, 22, COLORS.muted)}
    {Text('No countdown sync. No perfect network required. Just attention.', 70, 21, COLORS.muted)}
    <Button
      value='Begin Shared Heartbeat'
      variant='primary'
      fontSize={25}
      uiTransform={{ width: '100%', height: 78, margin: '14px 0' }}
      onMouseDown={startBondGame}
    />
  </UiEntity>
)

function actionLabel() {
  if (appState.practice) return appState.waitingForResponse ? 'Echo returning...' : 'SEND PULSE'
  if (appState.pulseReady) return 'ANSWER NOW'
  if (appState.expectedPlayerId === appState.localPlayer?.userId) {
    return appState.waitingForResponse ? 'Waiting for partner...' : 'SEND PULSE'
  }
  return 'Listen for their pulse'
}

function actionDisabled() {
  if (appState.practice) return appState.waitingForResponse
  return !appState.pulseReady && (
    appState.expectedPlayerId !== appState.localPlayer?.userId || appState.waitingForResponse
  )
}

const PlayingPanel = () => (
  <UiEntity uiTransform={{ width: '100%', height: 350, flexDirection: 'column' }}>
    <UiEntity uiTransform={{ width: '100%', height: 58, flexDirection: 'row', justifyContent: 'space-between' }}>
      <Label
        value={`ROUND ${appState.round}/${TOTAL_ROUNDS}`}
        fontSize={25}
        color={COLORS.pink}
        textAlign='middle-left'
        uiTransform={{ width: '50%', height: 58 }}
      />
      <Label
        value={`SYNC ${appState.score}`}
        fontSize={25}
        color={COLORS.cyan}
        textAlign='middle-right'
        uiTransform={{ width: '50%', height: 58 }}
      />
    </UiEntity>
    {Progress()}
    {Text(appState.pulseReady ? 'A pulse is fading. Tap now.' : 'One sends. One answers. Then roles reverse.', 74, 23)}
    <Button
      value={actionLabel()}
      variant='primary'
      fontSize={30}
      disabled={actionDisabled()}
      uiTransform={{ width: '100%', height: 98, margin: '18px 0' }}
      onMouseDown={tapHeartbeat}
    />
    {Text('Mobile: this also works with the large native action button.', 48, 18, COLORS.muted)}
  </UiEntity>
)

const CompletePanel = () => (
  <UiEntity uiTransform={{ width: '100%', height: 320, flexDirection: 'column' }}>
    {Text(appState.practice ? 'Practice complete' : 'Your bond changed the Mote', 70, 30, COLORS.cyan)}
    {Text(`${appState.score}/${TOTAL_ROUNDS} pulses connected`, 64, 25)}
    {Text(appState.practice ? 'Now create one that belongs to two real people.' : 'Return together to deepen its form.', 72, 22, COLORS.muted)}
    <Button
      value='Meet someone new'
      variant='primary'
      fontSize={24}
      uiTransform={{ width: '100%', height: 72, margin: '14px 0' }}
      onMouseDown={resetExperience}
    />
  </UiEntity>
)

const CurrentPanel = () => {
  if (appState.phase === 'invited') return <InvitePanel />
  if (appState.phase === 'bonded') return <BondedPanel />
  if (appState.phase === 'playing') return <PlayingPanel />
  if (appState.phase === 'complete') return <CompletePanel />
  return <FindingPanel />
}

const WeOneUi = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
    <UiEntity
      uiTransform={{
        width: 560,
        height: 650,
        positionType: 'absolute',
        position: { top: 34, right: 34 },
        padding: 20,
        flexDirection: 'column'
      }}
      uiBackground={{ color: COLORS.panel }}
    >
      <UiEntity uiTransform={{ width: '100%', height: 70, flexDirection: 'row', alignItems: 'center' }}>
        <Label
          value='WE/1'
          fontSize={48}
          color={COLORS.cyan}
          textAlign='middle-left'
          uiTransform={{ width: 150, height: 70 }}
        />
        <Label
          value='WE ONE'
          fontSize={19}
          color={COLORS.pink}
          textAlign='middle-left'
          uiTransform={{ width: 250, height: 70 }}
        />
      </UiEntity>
      <UiEntity
        uiTransform={{ width: '100%', height: 430, padding: '8px 0', flexDirection: 'column' }}
        uiBackground={{ color: COLORS.card }}
      >
        <UiEntity uiTransform={{ width: '100%', height: '100%', padding: 18, flexDirection: 'column' }}>
          <CurrentPanel />
        </UiEntity>
      </UiEntity>
      <Label
        value={appState.status}
        fontSize={18}
        color={COLORS.muted}
        textAlign='middle-left'
        uiTransform={{ width: '100%', height: 60, margin: '8px 0' }}
      />
    </UiEntity>
  </UiEntity>
)
