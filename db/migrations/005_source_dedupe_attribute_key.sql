-- 005: (a) duplicate rule is per source, (b) claims get an attribute key for exact candidate lookup.

-- (a) The same text republished by a *different* source is not a duplicate: it is corroboration.
-- Only re-uploading identical text to the same source is refused.
ALTER TABLE documents DROP CONSTRAINT documents_content_hash_key;
ALTER TABLE documents ADD CONSTRAINT documents_source_hash_uq UNIQUE (source_id, content_hash);
CREATE INDEX documents_content_hash_idx ON documents (content_hash);

-- (b) attribute_key = md5 of the claim's content words after quantities are masked and negations,
-- antonyms, months and stopwords are dropped (computed by the application, see attributeKey() in
-- src/lib/judge-offline.ts). Two claims with the same key talk about the same attribute and differ
-- only in value or polarity, so they are conflict candidates regardless of embedding similarity.
-- NULL for claims ingested before this migration (npm run db:backfill fills them).
ALTER TABLE claims ADD COLUMN attribute_key CHAR(32) CHECK (attribute_key IS NULL OR attribute_key ~ '^[0-9a-f]{32}$');
CREATE INDEX claims_attribute_key_idx ON claims (attribute_key) WHERE attribute_key IS NOT NULL AND status = 'active';

-- Active claims sharing an attribute key with the given one, from other documents.
CREATE FUNCTION claims_with_attribute(p_key CHAR(32), q vector(384), k INT DEFAULT 10, exclude_doc BIGINT DEFAULT NULL)
RETURNS TABLE (claim_id BIGINT, text TEXT, document_id BIGINT, source_id BIGINT, similarity REAL)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.text, c.document_id, d.source_id, (1 - (c.embedding <=> q))::REAL
  FROM claims c
  JOIN documents d ON d.id = c.document_id
  WHERE c.attribute_key = p_key
    AND c.status = 'active'
    AND (exclude_doc IS NULL OR c.document_id <> exclude_doc)
  ORDER BY c.embedding <=> q
  LIMIT k;
$$;
