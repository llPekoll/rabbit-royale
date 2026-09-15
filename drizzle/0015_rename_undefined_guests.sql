-- Rename the guests born "undefined…", once.
--
-- `randomRabbitName` used to index its adjective list with a SIGNED hash, so
-- half of all names came out as "undefinedTail0", "undefinedBuck15". The
-- generator is fixed (src/lib/auth/names.ts, the `>>> 0`); this repairs the
-- rows it wrote before that. A player's name is the first thing they see and
-- the thing the RAID slab and the season board now print about them, and
-- "undefined" is the one word a game must never call somebody.
--
-- The adjective is drawn from the same list the generator uses, at random per
-- row, and the noun and number are kept — "undefinedTail0" becomes, say,
-- "SlyTail0". Only rows that still carry the prefix are touched, so a player
-- who renamed themselves keeps their name, and re-running this is a no-op.
UPDATE "players"
SET "name" = (ARRAY[
  'Cursed', 'Golden', 'Feral', 'Silent', 'Lucky', 'Grim', 'Velvet', 'Rusty',
  'Hollow', 'Sly', 'Iron', 'Ashen', 'Wild', 'Pale', 'Swift', 'Bitter'
])[1 + floor(random() * 16)::int] || substr("name", length('undefined') + 1)
WHERE "name" LIKE 'undefined%';
