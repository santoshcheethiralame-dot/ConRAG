-- 003: stored functions, triggers, views.

-- Nearest active claims to a query vector (cosine distance, HNSW-backed).
CREATE FUNCTION find_similar_claims(q vector(384), k INT, exclude_doc BIGINT DEFAULT NULL)
RETURNS TABLE (claim_id BIGINT, text TEXT, document_id BIGINT, source_id BIGINT,
               trust_score NUMERIC, similarity REAL)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.text, c.document_id, d.source_id, s.trust_score,
         (1 - (c.embedding <=> q))::REAL
  FROM claims c
  JOIN documents d ON d.id = c.document_id
  JOIN sources   s ON s.id = d.source_id
  WHERE c.status = 'active'
    AND (exclude_doc IS NULL OR c.document_id <> exclude_doc)
  ORDER BY c.embedding <=> q
  LIMIT k;
$$;

-- Core ConRAG query: contradiction pairs that sit inside the top-k retrieval set.
CREATE FUNCTION retrieve_conflicts(q vector(384), k INT)
RETURNS TABLE (relation_id BIGINT, claim_a BIGINT, claim_b BIGINT, confidence NUMERIC, rationale TEXT)
LANGUAGE sql STABLE AS $$
  WITH top AS (SELECT claim_id FROM find_similar_claims(q, k))
  SELECT r.id, r.claim_a, r.claim_b, r.confidence, r.rationale
  FROM claim_relations r
  JOIN top ta ON ta.claim_id = r.claim_a
  JOIN top tb ON tb.claim_id = r.claim_b
  WHERE r.relation = 'contradicts';
$$;

-- Declared trust, discounted by how often the source's claims lost a resolved conflict.
CREATE FUNCTION source_reliability(p_source BIGINT) RETURNS NUMERIC
LANGUAGE plpgsql STABLE AS $$
DECLARE
  base   NUMERIC;
  total  INT;
  losses INT;
BEGIN
  SELECT trust_score INTO base FROM sources WHERE id = p_source;
  IF base IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO total
  FROM claims c JOIN documents d ON d.id = c.document_id
  WHERE d.source_id = p_source;

  SELECT count(*) INTO losses
  FROM conflict_resolutions cr
  JOIN claim_relations r ON r.id = cr.relation_id
  JOIN claims loser ON loser.id = CASE WHEN r.claim_a = cr.winner_claim_id THEN r.claim_b ELSE r.claim_a END
  JOIN documents d ON d.id = loser.document_id
  WHERE d.source_id = p_source;

  IF total = 0 THEN RETURN base; END IF;
  RETURN round(base * (1 - 0.5 * losses::NUMERIC / total), 2);
END $$;

-- Trigger: a relation must link claims from different documents.
CREATE FUNCTION relation_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT document_id FROM claims WHERE id = NEW.claim_a)
   = (SELECT document_id FROM claims WHERE id = NEW.claim_b) THEN
    RAISE EXCEPTION 'claims % and % come from the same document', NEW.claim_a, NEW.claim_b
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_relation_guard BEFORE INSERT OR UPDATE ON claim_relations
  FOR EACH ROW EXECUTE FUNCTION relation_guard();

-- Trigger: resolution winner must be one side of a contradiction; loser is superseded.
CREATE FUNCTION resolution_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
  RETURN NEW;
END $$;
CREATE TRIGGER trg_resolution_check BEFORE INSERT OR UPDATE ON conflict_resolutions
  FOR EACH ROW EXECUTE FUNCTION resolution_check();

CREATE FUNCTION resolution_apply() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE claims SET status = 'superseded', superseded_at = now()
  WHERE id = (SELECT CASE WHEN claim_a = NEW.winner_claim_id THEN claim_b ELSE claim_a END
              FROM claim_relations WHERE id = NEW.relation_id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_resolution_apply AFTER INSERT ON conflict_resolutions
  FOR EACH ROW EXECUTE FUNCTION resolution_apply();

-- Trigger: generic audit trail.
CREATE FUNCTION audit_row() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  old_j JSONB := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  new_j JSONB := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
BEGIN
  INSERT INTO audit_log (table_name, row_id, action, old_data, new_data)
  VALUES (TG_TABLE_NAME, (coalesce(new_j, old_j) ->> 'id')::BIGINT, TG_OP, old_j, new_j);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_audit_relations   AFTER INSERT OR UPDATE OR DELETE ON claim_relations
  FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER trg_audit_resolutions AFTER INSERT OR UPDATE OR DELETE ON conflict_resolutions
  FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER trg_audit_sources     AFTER INSERT OR UPDATE OR DELETE ON sources
  FOR EACH ROW EXECUTE FUNCTION audit_row();

-- Views.
CREATE VIEW v_open_conflicts AS
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
  AND NOT EXISTS (SELECT 1 FROM conflict_resolutions cr WHERE cr.relation_id = r.id);

CREATE VIEW v_source_stats AS
SELECT s.id AS source_id, s.name, s.kind, s.trust_score,
       count(DISTINCT d.id)  AS documents,
       count(DISTINCT c.id)  AS claims,
       source_reliability(s.id) AS reliability
FROM sources s
LEFT JOIN documents d ON d.source_id = s.id
LEFT JOIN claims    c ON c.document_id = d.id
GROUP BY s.id;
