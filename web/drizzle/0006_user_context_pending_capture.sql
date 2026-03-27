-- pending_self_capture_* columns are added in src/db/repairSqlite.ts (runs before migrate)
-- so we do not ALTER here (would duplicate repair and fail).
SELECT 1;
