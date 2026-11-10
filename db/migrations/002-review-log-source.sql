-- 002: where a review came from. 'app' (the flashcard study screen, and every row before this) or 'ouc' (a dictation or
-- test with Claude, recorded by the OUC connector's record_reviews, phucbm/ouc-mcp). Plan 002 step 5.
ALTER TABLE flashcard_review_log ADD COLUMN source TEXT NOT NULL DEFAULT 'app';
