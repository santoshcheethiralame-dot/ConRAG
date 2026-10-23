-- 004: integrity guards, resolution undo, document search, conflict clusters.

-- The last admin can neither be demoted nor deleted.
CREATE FUNCTION protect_last_admin() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'admin'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'admin')
     AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin' AND id <> OLD.id) THEN
    RAISE EXCEPTION 'cannot remove the last admin' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_protect_last_admin BEFORE UPDATE OF role OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION protect_last_admin();

-- Both sides of a resolved conflict must still be active (a claim already
-- superseded elsewhere cannot be argued about again).
CREATE OR REPLACE FUNCTION resolution_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r claim_relations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM claim_relations WHERE id = NEW.relation_id;
  IF r.relation <> 'contradicts' THEN
    RAISE EXCEPTION 'relation % is not a contradiction', NEW.relation_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.winner_claim_id NOT IN (r.claim_a, r.claim_b) THEN
    RAISE EXCEPTION 'winner % is not part of relation %', NEW.winner_claim_id, NEW.relation_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (
       SELECT 1 FROM claims WHERE id IN (r.claim_a, r.claim_b) AND status <> 'active') THEN
    RAISE EXCEPTION 'relation % involves an already superseded claim', NEW.relation_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Undoing a resolution reactivates the loser, unless it also lost another conflict.
CREATE FUNCTION resolution_undo() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE loser BIGINT;
BEGIN
  SELECT CASE WHEN claim_a = OLD.winner_claim_id THEN claim_b ELSE claim_a END
    INTO loser FROM claim_relations WHERE id = OLD.relation_id;
  IF loser IS NULL THEN RETURN NULL; END IF;  -- relation already gone (cascade)
  IF NOT EXISTS (
       SELECT 1
       FROM conflict_resolutions cr
       JOIN claim_relations r ON r.id = cr.relation_id
       WHERE cr.id <> OLD.id
         AND loser IN (r.claim_a, r.claim_b)
         AND cr.winner_claim_id <> loser) THEN
    UPDATE claims SET status = 'active', superseded_at = NULL WHERE id = loser;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_resolution_undo AFTER DELETE ON conflict_resolutions
  FOR EACH ROW EXECUTE FUNCTION resolution_undo();

-- Open conflicts only concern claims that are still active.
CREATE OR REPLACE VIEW v_open_conflicts AS
SELECT r.id AS relation_id, r.confidence, r.rationale,
       ca.id AS claim_a, ca.text AS text_a, sa.name AS source_a, sa.trust_score AS trust_a, da.published_at AS date_a,
       cb.id AS claim_b, cb.text AS text_b, sb.name AS source_b, sb.trust_score AS trust_b, db.published_at AS date_b
FROM claim_relations r
JOIN claims ca    ON ca.id = r.claim_a
JOIN claims cb    ON cb.id = r.claim_b
JOIN documents da ON da.id = ca.document_id
JOIN documents db ON db.id = cb.document_id
JOIN sources sa   ON sa.id = da.source_id
JOIN sources sb   ON sb.id = db.source_id
WHERE r.relation = 'contradicts'
  AND ca.status = 'active' AND cb.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM conflict_resolutions cr WHERE cr.relation_id = r.id);

-- Full-text search with ranking and a highlighted snippet (GIN-backed).
CREATE FUNCTION search_documents(q TEXT, lim INT DEFAULT 20)
RETURNS TABLE (document_id BIGINT, title TEXT, source_name TEXT, rank REAL, snippet TEXT)
LANGUAGE sql STABLE AS $$
  SELECT d.id, d.title, s.name, ts_rank(d.tsv, tq)::REAL,
         ts_headline('english', d.body, tq, 'MaxFragments=1, MaxWords=30, MinWords=12')
  FROM documents d
  JOIN sources s ON s.id = d.source_id,
       websearch_to_tsquery('english', q) AS tq
  WHERE d.tsv @@ tq
  ORDER BY 4 DESC, d.id
  LIMIT lim;
$$;

-- Every claim transitively connected to p_claim by contradiction edges
-- (recursive CTE; depth-capped so cycles terminate).
CREATE FUNCTION conflict_cluster(p_claim BIGINT) RETURNS TABLE (claim_id BIGINT, depth INT)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE walk (claim_id, depth) AS (
    SELECT p_claim, 0
    UNION
    SELECT CASE WHEN r.claim_a = w.claim_id THEN r.claim_b ELSE r.claim_a END, w.depth + 1
    FROM walk w
    JOIN claim_relations r
      ON r.relation = 'contradicts' AND (r.claim_a = w.claim_id OR r.claim_b = w.claim_id)
    WHERE w.depth < 5
  )
  SELECT w.claim_id, min(w.depth)::INT FROM walk w GROUP BY w.claim_id ORDER BY 2, 1;
$$;
