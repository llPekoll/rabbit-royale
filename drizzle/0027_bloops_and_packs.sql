-- BLOOPS AND PACKS (2026-10-02). The shop's two packs (SHOP_PACKS: Shiro's
-- Stash, Kuro's Tantrum) are named on receipts and payment rows, so they join
-- item_kind — never an `inventory` row, the bag gets what is inside. Then the
-- three starting bloops (BLOOP.STARTING) handed once to every burrow that
-- existed before them — new accounts get theirs from lib/auth/starting-kit.ts.
-- Capped at the bag's ceiling (SHOP.MAX_HELD, 20) like the bolts in 0026.
ALTER TYPE "public"."item_kind" ADD VALUE 'shiro_stash';--> statement-breakpoint
ALTER TYPE "public"."item_kind" ADD VALUE 'kuro_tantrum';--> statement-breakpoint
INSERT INTO "inventory" ("player_id", "kind", "qty")
SELECT "id", 'bloop', 3 FROM "players"
ON CONFLICT ("player_id", "kind") DO UPDATE SET "qty" = LEAST("inventory"."qty" + 3, 20);
