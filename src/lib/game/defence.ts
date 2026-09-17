/**
 * What the DEFENDER is told about a raid on their burrow.
 *
 * The raider's view (`raidView` in api/raid) hides the ground they have not
 * walked and never carries a trap. The defender's needs neither courtesy: it
 * is their own homestead, they placed the traps, and what they are watching
 * for is where the intruder stands. So this is the run, plainly — plus who is
 * doing it, because a burrow's defence is aimed at somebody.
 *
 * Pure shaping, shared by the poll (`GET /api/raid/incoming`) and the strike
 * (`POST /api/raid/strike`) so the two answers can never disagree.
 */
export interface DefenderRaidView {
  raidId: string;
  attacker: { id: string; name: string; avatar: string | null };
  /** Where the raider stands. */
  tile: number;
  energy: number;
  /** Every tile they have stood on, in order — their route so far. */
  walked: number[];
  trapsSprung: number;
  finished: boolean;
  succeeded: boolean;
  /** Ended by the defender's own lightning. */
  struck: boolean;
  carrotsLooted: number;
  startedAt: string;
}

export interface RaidRunRow {
  id: string;
  tile: number;
  energy: number;
  visited: number[];
  trapsSprung: number;
  succeeded: boolean;
  carrotsLooted: number;
  startedAt: Date;
  endedAt: Date | null;
  struckAt: Date | null;
}

export function defenderRaidView(
  run: RaidRunRow,
  attacker: { id: string; name: string; avatar: string | null },
): DefenderRaidView {
  return {
    raidId: run.id,
    attacker: { id: attacker.id, name: attacker.name, avatar: attacker.avatar },
    tile: run.tile,
    energy: run.energy,
    walked: run.visited,
    trapsSprung: run.trapsSprung,
    finished: run.endedAt !== null,
    succeeded: run.succeeded,
    struck: run.struckAt !== null,
    carrotsLooted: run.carrotsLooted,
    startedAt: run.startedAt.toISOString(),
  };
}
