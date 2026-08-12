-- A device that has ever hit the check-in duplication race (see
-- docs/architecture.md §3-2, "체크인 중복 생성") could still have more than
-- one active row for the same (habit_id, date). The UNIQUE index below would
-- fail to create against such data, so first soft-delete every active
-- duplicate except the earliest-created one per (habit_id, date) — the same
-- self-healing policy `toggle()` already applies at runtime, just run once
-- here as a migration. Marked pending so the cleanup itself propagates on
-- the next sync.
UPDATE check_ins
SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    version = version + 1,
    sync_status = 'pending'
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY habit_id, date ORDER BY created_at ASC, id ASC) AS rn
    FROM check_ins
    WHERE deleted_at IS NULL
  )
  WHERE rn > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX `check_ins_habit_date_unique_idx` ON `check_ins` (`habit_id`,`date`) WHERE "check_ins"."deleted_at" is null;