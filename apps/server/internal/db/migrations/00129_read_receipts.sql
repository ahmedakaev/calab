-- Read receipts (ADR-0140, board #91): who saw a message on screen, and when.
--
-- read_states.seen_message_id  the furthest message of the room that was on the person's
--                              screen (PUT /api/rooms/{id}/read with seen); NULL — never since
--                              the release. No index: the frequent upsert of the marker stays HOT.
-- read_spans                   one row per run of the seen marker: (after_id, upto_id] were seen
--                              between first_at and last_at. A move within 5 minutes of the
--                              previous one extends its row (ADR-0140 §3). Bots write nothing.
-- feature_epochs               when a feature started: messages before 'read_receipts' have no
--                              ticks and no readers (no retroactive counting).
--
-- Safe on a populated database: a nullable column without a default is a catalog change (no
-- rewrite, no scan); the new tables are empty.

-- +goose Up
SET LOCAL lock_timeout = '10s';
ALTER TABLE read_states ADD COLUMN IF NOT EXISTS seen_message_id uuid;

CREATE TABLE read_spans (
    room_id  uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    upto_id  uuid NOT NULL,
    user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    after_id uuid,
    first_at timestamptz NOT NULL DEFAULT now(),
    last_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, upto_id, user_id)
);

CREATE TABLE feature_epochs (
    name       text PRIMARY KEY,
    started_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO feature_epochs (name) VALUES ('read_receipts') ON CONFLICT DO NOTHING;

-- +goose Down
SET LOCAL lock_timeout = '10s';
DROP TABLE feature_epochs;
DROP TABLE read_spans;
ALTER TABLE read_states DROP COLUMN IF EXISTS seen_message_id;
