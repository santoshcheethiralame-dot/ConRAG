-- DROP everything ConRAG creates, in dependency order. Used by `npm run db:reset`.
-- Safe on a partially migrated database.
DROP VIEW     IF EXISTS v_source_stats, v_open_conflicts;
DROP FUNCTION IF EXISTS conflict_cluster(BIGINT), search_documents(TEXT, INT),
                        retrieve_conflicts(vector, INT), find_similar_claims(vector, INT, BIGINT),
                        source_reliability(BIGINT);
DROP TABLE    IF EXISTS query_evidence, queries, conflict_resolutions, claim_relations,
                        claims, chunks, documents, sources, users, audit_log, schema_migrations CASCADE;
DROP FUNCTION IF EXISTS protect_last_admin(), resolution_check(), resolution_apply(),
                        resolution_undo(), relation_guard(), audit_row();
DROP TYPE     IF EXISTS claim_status, evidence_role, relation_type, source_kind, user_role;
