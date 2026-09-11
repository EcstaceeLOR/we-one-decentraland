# WE/1 (pronounced "We One")

WE/1 is a mobile-first social experience for Decentraland's Friendzone Buildathon. Two strangers mutually consent to create a digital creature that belongs to their relationship, then grow it through an alternating call-and-response ritual.

## Why it is different

Most social games reward an individual account. WE/1 makes the relationship itself the unit of progression. The shared Mote has a deterministic identity derived from both players and evolves only through cooperation.

## Play loop

1. Enter the scene and choose another present explorer.
2. The other player accepts or declines the invitation.
3. A shared Mote appears between the pair.
4. One player sends a pulse; the other has 1.8 seconds to answer.
5. Roles reverse for eight rounds and the Mote evolves with successful connections.
6. Solo visitors can use Practice to understand the mechanic, but only two real players create a bond.

The call-and-response protocol measures time only on the receiving device, so it does not require synchronized clocks and remains tolerant of ordinary mobile latency.

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

Open two clients/accounts in the same preview realm to test invitations and the Shared Heartbeat. Practice mode works with one client.

## Current MVP

- Peer-to-peer presence and player list
- Consent-based invitations
- Pair-specific Mote appearance
- Eight-round Shared Heartbeat
- Response timeout and role reversal
- Three visible evolution stages
- Mobile native action and touch UI
- Solo judge-friendly practice mode

## Next checkpoint

Persistent bond growth will be added behind authenticated `signedFetch` storage once the deployment identity/World is available. The current gameplay deliberately uses serverless scene networking and requires no scheduled host or moderator.
