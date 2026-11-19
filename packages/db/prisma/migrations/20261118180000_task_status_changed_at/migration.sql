-- When a task's status last changed. Kept by a trigger so every code path that changes
-- the status is covered without touching it. Backfilled for completed tasks from the
-- completion date; unknown for the rest until their status next changes.
ALTER TABLE "Task" ADD COLUMN "statusChangedAt" TIMESTAMP(3);

UPDATE "Task" SET "statusChangedAt" = "lastCompletedAt" WHERE "status" = 'done' AND "lastCompletedAt" IS NOT NULL;

CREATE OR REPLACE FUNCTION task_status_changed_at() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    NEW."statusChangedAt" := (now() AT TIME ZONE 'utc');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_status_changed_at BEFORE UPDATE ON "Task" FOR EACH ROW EXECUTE FUNCTION task_status_changed_at();
