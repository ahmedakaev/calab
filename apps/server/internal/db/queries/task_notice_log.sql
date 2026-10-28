-- name: InsertTaskNotice :exec
-- One notified user of a task change (ADR-0140).
INSERT INTO task_notice_log (id, user_id, task_id, kind, actor_id, message_id, text, rule_id, re_requested, due_on, days_left)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT DO NOTHING;

-- name: ListTaskNoticeLog :many
-- A user's task notices, newest first (one index range scan of a page).
SELECT * FROM task_notice_log
WHERE user_id = sqlc.arg('user_id')
  AND (sqlc.narg('before')::uuid IS NULL OR id < sqlc.narg('before')::uuid)
ORDER BY id DESC
LIMIT sqlc.arg('lim');

-- name: PruneTaskNoticeLog :execrows
-- Rows older than the cutoff, a bounded batch per call.
DELETE FROM task_notice_log
WHERE id IN (SELECT l.id FROM task_notice_log l WHERE l.created_at < sqlc.arg('before') LIMIT 5000);
