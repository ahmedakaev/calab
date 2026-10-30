-- Canvas items get an emoji in place of their icon (as boards): one emoji or ''. The listing view
-- carries it as its last column (CREATE OR REPLACE VIEW may only append).

-- +goose Up
ALTER TABLE canvas_items ADD COLUMN emoji text NOT NULL DEFAULT '';

CREATE OR REPLACE VIEW canvas_item_heads AS
    SELECT id, workspace_id, parent_id, kind, name, position, owner_id, restricted, preview, doc_size, next_seq,
           updated_by, created_at, updated_at, trashed_at, trashed_by, trashed_root, emoji
    FROM canvas_items;

-- +goose Down
DROP VIEW canvas_item_heads;
CREATE VIEW canvas_item_heads AS
    SELECT id, workspace_id, parent_id, kind, name, position, owner_id, restricted, preview, doc_size, next_seq,
           updated_by, created_at, updated_at, trashed_at, trashed_by, trashed_root
    FROM canvas_items;
ALTER TABLE canvas_items DROP COLUMN emoji;
