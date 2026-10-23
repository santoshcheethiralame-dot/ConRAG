-- Important queries, each runnable as-is on any database state (no parameters).
-- Format: "-- name:", "-- shows:", then one statement. tests/queries.test.ts executes every block;
-- `npm run docs` renders them with live output into docs/QUERIES.md.

-- name: Source leaderboard
-- shows: JOIN, GROUP BY, HAVING, ORDER BY, COUNT DISTINCT, aggregate over a LEFT JOIN
SELECT s.name, s.kind, s.trust_score,
       count(DISTINCT d.id) AS documents,
       count(c.id)          AS claims
FROM sources s
LEFT JOIN documents d ON d.source_id = s.id
LEFT JOIN claims c    ON c.document_id = d.id
GROUP BY s.id
HAVING count(c.id) > 0
ORDER BY claims DESC, s.name;

-- name: Open conflicts, strongest first
-- shows: a view (v_open_conflicts) that joins eight tables
SELECT relation_id, confidence, source_a, source_b, left(text_a, 60) AS claim_a, left(text_b, 60) AS claim_b
FROM v_open_conflicts
ORDER BY confidence DESC, relation_id
LIMIT 10;

-- name: Which sources contradict others most often
-- shows: CTE, UNION ALL, JOIN, GROUP BY, percentage with window-free arithmetic
WITH involved AS (
  SELECT claim_a AS claim_id FROM claim_relations WHERE relation = 'contradicts'
  UNION ALL
  SELECT claim_b FROM claim_relations WHERE relation = 'contradicts'
)
SELECT s.name,
       count(*) AS contradicted_claims,
       round(100.0 * count(*) / NULLIF((SELECT count(*) FROM claims c2 JOIN documents d2 ON d2.id = c2.document_id WHERE d2.source_id = s.id), 0), 1) AS pct_of_source_claims
FROM involved i
JOIN claims c ON c.id = i.claim_id
JOIN documents d ON d.id = c.document_id
JOIN sources s ON s.id = d.source_id
GROUP BY s.id
ORDER BY contradicted_claims DESC;

-- name: Claims nobody contradicts
-- shows: NOT EXISTS (correlated subquery) as an anti-join
SELECT c.id, left(c.text, 80) AS claim
FROM claims c
WHERE NOT EXISTS (
  SELECT 1 FROM claim_relations r
  WHERE r.relation = 'contradicts' AND c.id IN (r.claim_a, r.claim_b)
)
ORDER BY c.id
LIMIT 10;

-- name: Sources trusted above average
-- shows: scalar subquery
SELECT name, trust_score
FROM sources
WHERE trust_score > (SELECT avg(trust_score) FROM sources)
ORDER BY trust_score DESC;

-- name: Corroborated claims
-- shows: IN with a subquery, GROUP BY, HAVING
SELECT c.id, left(c.text, 70) AS claim, count(*) AS supporting_claims
FROM claims c
JOIN claim_relations r ON c.id IN (r.claim_a, r.claim_b) AND r.relation = 'supports'
WHERE c.id IN (SELECT claim_a FROM claim_relations UNION SELECT claim_b FROM claim_relations)
GROUP BY c.id
HAVING count(*) >= 1
ORDER BY supporting_claims DESC, c.id
LIMIT 10;

-- name: Newest document per source
-- shows: window function ROW_NUMBER() OVER (PARTITION BY ...)
SELECT source, title, published_at
FROM (
  SELECT s.name AS source, d.title, d.published_at,
         row_number() OVER (PARTITION BY s.id ORDER BY d.published_at DESC NULLS LAST, d.id DESC) AS rn
  FROM documents d JOIN sources s ON s.id = d.source_id
) t
WHERE rn = 1
ORDER BY source;

-- name: Questions per user with rank
-- shows: LEFT JOIN, aggregate, RANK() window
SELECT u.email, u.role, count(q.id) AS questions,
       rank() OVER (ORDER BY count(q.id) DESC) AS activity_rank
FROM users u
LEFT JOIN queries q ON q.user_id = u.id
GROUP BY u.id
ORDER BY activity_rank, u.email;

-- name: Full-text search with ranking
-- shows: stored function search_documents (tsvector + GIN, websearch syntax, ts_headline)
SELECT title, source_name, round(rank::numeric, 3) AS rank, snippet
FROM search_documents('attendance OR "library fine"', 5);

-- name: Nearest claims to a probe claim (vector search)
-- shows: pgvector cosine distance through find_similar_claims, HNSW index
SELECT claim_id, round(similarity::numeric, 3) AS similarity, left(text, 70) AS claim
FROM find_similar_claims((SELECT embedding FROM claims ORDER BY id LIMIT 1), 5);

-- name: Contradictions inside a retrieval set
-- shows: retrieve_conflicts, the core ConRAG query (top-k, then contradiction edges inside it)
SELECT relation_id, claim_a, claim_b, confidence
FROM retrieve_conflicts((SELECT embedding FROM claims ORDER BY id LIMIT 1), 10);

-- name: Everything contradicting a claim, transitively
-- shows: recursive CTE via conflict_cluster
SELECT cc.claim_id, cc.depth, left(c.text, 60) AS claim
FROM conflict_cluster((SELECT claim_a FROM claim_relations WHERE relation = 'contradicts' ORDER BY id LIMIT 1)) cc
JOIN claims c ON c.id = cc.claim_id
ORDER BY cc.depth, cc.claim_id;

-- name: Source reliability after resolutions
-- shows: stored function source_reliability and the v_source_stats view
SELECT name, trust_score, reliability, documents, claims
FROM v_source_stats
ORDER BY reliability DESC, name;

-- name: Audit trail summary
-- shows: GROUP BY over trigger-written rows
SELECT table_name, action, count(*) AS changes, max(at)::date AS latest
FROM audit_log
GROUP BY table_name, action
ORDER BY table_name, action;

-- name: Documents per month and source
-- shows: date_trunc, GROUP BY ROLLUP-style subtotal via GROUPING SETS
SELECT to_char(date_trunc('month', d.published_at), 'YYYY-MM') AS month, s.name AS source, count(*) AS documents
FROM documents d JOIN sources s ON s.id = d.source_id
WHERE d.published_at IS NOT NULL
GROUP BY GROUPING SETS ((date_trunc('month', d.published_at), s.name), (date_trunc('month', d.published_at)))
ORDER BY month, source NULLS FIRST;
