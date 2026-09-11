# WE/1 (pronounced "We One")

WE/1 is a mobile-first social experience for Decentraland's Friendzone Buildathon. Two strangers mutually consent to create a digital creature that belongs to their relationship, then grow it through an alternating call-and-response ritual.

## Why it is different

Most social games reward an individual account. WE/1 makes the relationship itself the unit of progression. The shared Mote has a deterministic identity derived from both players and evolves only through cooperation.

## Play loop

1. Enter the scene and choose another present explorer.
2. The other player accepts or declines the invitation.
3. A shared Mote appears between the pair.
4. One player sends a pulse; the other has 3.2 seconds to answer.
5. Roles reverse for eight rounds and the Mote evolves with successful connections.
6. Solo visitors can use Practice to understand the mechanic, but only two real players create a bond.

The Multiplayer Server measures the whole response window on one authoritative clock. Clients send intentions only, so clock differences and forged scores cannot change the result.

## Mobile-first decisions

- One large contextual action at a time.
- Native central touch action mapped to send/answer.
- Large tap targets, short copy, no hover-only interaction.
- Safe-area-aware React ECS layout.
- Low-poly primitive Mote with no external downloads.
- The joystick stays available so meeting people remains part of play.

## Run locally

Requirements: Node.js 20+ and the Decentraland Creator Hub/Desktop Explorer.

```bash
npm install
npm run build
npm run start
```

For a phone on the same Wi-Fi network:

```bash
npm run start -- --mobile
```

Open two clients/accounts in the same preview realm to test invitations and the Shared Heartbeat. The local Multiplayer Server may take about 15 seconds to become ready. Practice mode works with one client while it starts.

## Current MVP

- Live presence and player list
- Server-validated consent invitations with cancellation
- Pair-specific Mote appearance
- Server-authoritative eight-round Shared Heartbeat
- Response timeout and role reversal
- Three visible evolution stages
- Persistent pair-owned level, lifetime pulses, sessions, and daily streak
- Checkpoint storage with automatic retry after transient save failure
- Server heartbeat and mobile-friendly reconnect state
- Mobile native action and touch UI
- Solo judge-friendly practice mode

## Architecture

`src/shared` registers the binary network protocol and synchronized heartbeat component before the ECS engine seals. The client in `src/game.ts` handles input and presentation; `src/server/server.ts` validates invitations, owns the session state machine, measures response timing, calculates progression, and stores each relationship under a canonical pair key. No scheduled host or moderator is required.
