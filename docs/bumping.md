# Rabbits pushing rabbits

Design note for the bumper-car mechanic: what happens when two rabbits meet on
one tile. Written before the code so the cases are agreed rather than
discovered, and so the DEFAULT is a decision rather than whatever fell out of
the first implementation.

Status: **built**. `src/lib/game/push.ts` holds the rules,
`test/push.test.ts` pins them, and the server hands `resolveMove` the roster
that turns pushing on. The defaults below were chosen deliberately; the research
behind them is summarised under each rule.

This mechanic was previously parked in `IDEAS.md` under "do not re-litigate
without the GDD", citing a GDD §9 that does not exist — `gdd.md` has no
numbered sections. The rejection was lifted by an explicit design decision that
specified every case below.

## What the game does today

Nothing. `resolveMove` never looks at where the other rabbits are, so two
players can stand on the same tile and walk through each other. Pushing is new
behaviour, not a change to existing behaviour — which is a good thing, because
it means there is no habit to break.

Two facts about the server shape the options below, and both were checked
rather than assumed:

- **Moves are resolved one at a time, on arrival.** `MULTIPLAYER.TICK_MS` is
  declared but there is no tick loop: `socket.on('move')` calls `resolveMove`
  immediately. So two moves are never *simultaneous* in the code — they are
  simply very close together, and the server sees one first.
- **`MIN_MOVE_INTERVAL_MS` is 90ms.** A player cannot move faster than about
  eleven times a second, which bounds how fast a chain of pushes can happen.

The first fact is the important one: **a true head-on tie does not exist
server-side.** Whoever's packet arrives first moves first. Any "we both moved
at once" rule would have to be manufactured on purpose, by buffering moves into
a tick — which is a real option, but a much larger change than pushing itself.

## The cases

Every situation two rabbits can be in, and what could happen. `A` is the rabbit
that moves; `B` is the one already standing there.

### 1. A steps onto B's tile — the basic push

The one everything else is a variation of.

| Option | What happens | Notes |
|---|---|---|
| **Push one tile** | B is shoved one tile further along A's direction; A takes B's old tile | The bumper-car reading. Costs B a tile of position, no more |
| Push two tiles | B is shoved two tiles | What was asked for on head-on collisions. Harsher: B can be thrown across a cliff edge they never approached |
| Block | Neither moves; A's move is rejected | Safest, but "bumper cars" is explicitly not this |
| Swap | A and B trade places | Cute, readable, and removes all pushing-into-hazard risk |

### 2. B has nowhere to go

The push lands B in the sea, in a cliff face, in a tree, or off the board.

| Option | What happens |
|---|---|
| **Push fails, A is blocked** | Nothing moves. B is "braced" against the wall |
| Push sideways | B slides to the nearest legal tile instead |
| B falls | B takes the hazard — drowning, a drop, energy loss |

A decision is needed here or the mechanic is undefined at every island edge,
which is exactly where players fight over the last carrots.

### 3. B would be pushed onto a bomb

The case that decides whether this mechanic is fun or toxic. An undug tile can
hide a bomb, and neither player knows.

| Option | What happens |
|---|---|
| **Push does not dig** | B lands on the tile without revealing it. No blast, no cost. The tile stays undug |
| Push digs | B digs whatever they land on, blast included — A can kill B on purpose |
| Push is refused onto undug tiles | Pushing only ever moves someone across revealed ground |

### 4. Both rabbits move into each other

A moves to B's tile while B moves to A's. Server-side this is two separate
moves, milliseconds apart, so:

| Option | What happens |
|---|---|
| **First-come** | A's move resolves; B is pushed; B's own move is then evaluated from its new tile |
| Buffer into a tick | Hold moves for one tick, detect the mutual case, push both back | Requires the tick loop that does not exist |
| Both bounce 2 tiles | The asked-for behaviour, and only possible with the tick loop above |

### 5. A pushes B into C

Three rabbits in a line.

| Option | What happens |
|---|---|
| **Chain** | Everyone in the line shifts one, if the last one has somewhere to go |
| Block | The push fails; a queue of rabbits is a wall |

### 6. B is stunned, dead, or mid-animation

A bomb leaves a rabbit stunned. Pushing a stunned rabbit is the cheapest
griefing there is: they cannot move, cannot retaliate, and are being shoved
around a minefield.

| Option | What happens |
|---|---|
| **Stunned rabbits cannot be pushed** | They are an immovable obstacle until the stun ends |
| Stunned rabbits are pushed normally | Maximum chaos, minimum agency |

### 7. Two players push the same rabbit at once

Resolved by arrival order, like everything else. Worth stating so it is not a
surprise: B can be pushed twice in quick succession, and `MIN_MOVE_INTERVAL_MS`
only bounds each *pusher*, not how many pushers there are.

## Open question: does the pusher pay?

Nothing above costs A anything. If pushing is free, it is strictly better than
not pushing whenever it gains a tile, and every contested carrot becomes a
shoving match. Options: costs energy, has a cooldown, or is free and the game
leans into it.

## The rules

Each rule says what it is and, where the reasoning is not obvious, why.

### 1. A push moves one tile

Not two. *Into the Breach* — the deepest grid-push game made — pushes exactly
one tile from every source, and its whole tactical depth runs on that. Closer
to home, `knockbackTarget()` already throws a bombed rabbit one tile: a two-tile
push would mean **another player displaces you harder than a bomb does**, an
inversion that reads as wrong before anyone can say why.

Implemented by reusing `knockbackTarget()` with the pusher's direction, so
pushes inherit its terrain filtering for free.

### 2. A push onto an undug tile DIGS IT, and a bomb detonates

The deliberate exception to every safety rule elsewhere in this document, and
the one place this game chooses danger over comfort. Shoving someone into the
unknown part of the board is a real attack with a real outcome.

The cost is understood and accepted: neither player knows what is under the
tile, so a kill by push is not a skill expression — the pusher spends no risk
to impose a random cost. The design takes that trade on purpose. Everything
else in these rules exists to keep it from compounding.

A dug-by-push tile is revealed to everyone, like any other dig. The energy for
the dig is NOT charged to the victim: they did not choose to dig.

### 3. A stunned rabbit cannot be pushed, and blocks pushes

A bomb leaves a rabbit stunned. Pushing it then would stack a second removal of
control on top of one already running, which is the pattern the crowd-control
literature is unanimous about: frustration comes from the DURATION of zero
agency, not from the displacement. The canonical comparison is League of
Legends' old point-and-click Sion stun (hated: no way to see it coming) against
Annie's visibly-charged one (accepted: same effect, telegraphed).

So a stunned rabbit is terrain. It cannot be shoved, and a chain that reaches
it stops dead. It is protected exactly while it cannot protect itself.

### 4. Head-on: both blocked, nobody moves

Two rabbits stepping into each other bounce and stay put. Not a mutual
two-tile knockback: punishing two players for a coincidence of timing is the
archetype of a loss that feels unearned, and no shipped game was found that
does it. *Diplomacy* has bounced-to-zero for seventy years, and explicitly
forbids the swap, which is the other tempting answer.

**Caveat that matters:** the server resolves moves on arrival, not on a tick,
so a true simultaneous head-on does not exist — one packet is always first.
Until a tick loop exists, this rule is approximated with a short tolerance
window: a mutual push arriving within `HEAD_ON_WINDOW_MS` of the first is
treated as a bounce and both are refused. Without that window, the player with
the better ping silently wins every contested tile, which is invisible and
therefore reads as the game cheating.

### 5. Pushes chain

A pushes B, B pushes C, and so on down the line. Everyone shifts one tile if
the last rabbit has somewhere legal to go; if the end of the chain is blocked —
by terrain, by the board edge, or by a stunned rabbit — the whole chain fails
and nobody moves.

Chosen for the spectacle, knowingly against the predictability argument: a
chain is harder to foresee, and with rule 2 in force a rabbit at the end of a
line can be blown up by someone who never touched them. That is the bumper-car
game this is meant to be.

### 6. Pushing is free, because it already costs something

No energy price, no cooldown. The cost is structural and already in the game: A
ends up on B's old tile, and **stepping onto an undug tile digs it**, which
costs energy. So a push can deny a tile for nothing, but converting that denial
into a carrot costs the pusher a dig like it always did.

Worth watching in playtest rather than pre-solving: if shoving turns out to be
free value anyway, the cheap fix is a per-VICTIM cooldown (~500ms), not a
per-pusher one. `MIN_MOVE_INTERVAL_MS` already bounds how fast one player can
push; what it does not bound is three players pushing the same rabbit.

### 7. The victim always sees who pushed them

A push with an anonymous source is a griefing event; a push with a name on it
is the opening move of a rivalry. This is already the GDD's stated philosophy
for sabotage — "the victim sees who did it, revenge is the point" — and it is
the single strongest mitigation available for everything rule 2 makes possible.

`pushedBy` rides along on the event and the client surfaces it.


## Where it lives

| File | What it holds |
|---|---|
| `src/lib/game/push.ts` | the rules, as pure arithmetic — no server, no clock |
| `src/lib/game/run.ts` | `resolveMove` applies a plan and charges the blast |
| `server/index.ts` | hands over the roster, broadcasts `rabbit_pushed` |
| `test/push.test.ts` | every rule above, including rule 2 detonating |

`planPush` returns what WOULD happen and mutates nothing, which is what lets a
chain be refused whole rather than discovered half-applied.

## Known limits

- **The move ring does not darken over a rabbit it cannot push.** A stunned
  target or a blocked chain refuses server-side and bounces back as a
  rejection. The head-on case is unknowable in advance by definition, so the
  ring promises "you may try to step here" rather than "this will succeed".
  See the note at the top of `reachable.ts`.
- **The head-on window is an approximation.** With no tick loop, two opposing
  moves are never truly simultaneous; `HEAD_ON_WINDOW_MS` catches a mutual rush
  without one. A real tick would let this be exact.
- **Rule 6 is unverified.** The claim that pushing is self-limiting because
  converting a denial into a carrot costs a dig has not met players yet. If it
  turns out to be free value, the fix is a per-VICTIM cooldown, not a per-pusher
  one: `MIN_MOVE_INTERVAL_MS` already bounds one pusher, not three.
