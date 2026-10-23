# Important queries

Every query below lives in [db/queries.sql](../db/queries.sql), is executed by the test suite (`tests/queries.test.ts`), and is rendered here with its real output against the demo data (`npm run docs`).

The application's own DML (INSERT / UPDATE / DELETE) is in the route handlers and libraries; the table at the end maps each to its file.

## 1. Source leaderboard

*Demonstrates:* JOIN, GROUP BY, HAVING, ORDER BY, COUNT DISTINCT, aggregate over a LEFT JOIN

```sql
SELECT s.name, s.kind, s.trust_score,
       count(DISTINCT d.id) AS documents,
       count(c.id)          AS claims
FROM sources s
LEFT JOIN documents d ON d.source_id = s.id
LEFT JOIN claims c    ON c.document_id = d.id
GROUP BY s.id
HAVING count(c.id) > 0
ORDER BY claims DESC, s.name;
```

| name | kind | trust_score | documents | claims |
|---|---|---|---|---|
| University Circular | official | 0.90 | 7 | 30 |
| Student Wiki | wiki | 0.35 | 4 | 20 |
| Department Notice Board | internal | 0.60 | 4 | 16 |
| Campus News Blog | news | 0.50 | 2 | 11 |
| Examination Cell Notice | official | 0.85 | 2 | 9 |

## 2. Open conflicts, strongest first

*Demonstrates:* a view (v_open_conflicts) that joins eight tables

```sql
SELECT relation_id, confidence, source_a, source_b, left(text_a, 60) AS claim_a, left(text_b, 60) AS claim_b
FROM v_open_conflicts
ORDER BY confidence DESC, relation_id
LIMIT 10;
```

| relation_id | confidence | source_a | source_b | claim_a | claim_b |
|---|---|---|---|---|---|
| 1 | 0.90 | University Circular | Department Notice Board | Attendance shortage of up to 10 percent may be condoned by t | Attendance shortage of up to 5 percent may be condoned with |
| 8 | 0.90 | University Circular | Campus News Blog | The library is open from 8 am to 8 pm on weekdays. | The library is open from 8 am to 10 pm on weekdays. |
| 9 | 0.90 | University Circular | Campus News Blog | The library fine is Rs 2 per day for each overdue book. | The library fine is Rs 5 per day for each overdue book. |
| 12 | 0.90 | University Circular | Student Wiki | The girls hostel gate closes at 10 pm every night. | The girls hostel gate closes at 9 pm every night. |
| 13 | 0.90 | University Circular | Student Wiki | Visitors are allowed in the hostel on Sundays from 4 pm to 6 | Visitors are allowed in the hostel on Sundays from 10 am to |
| 15 | 0.90 | University Circular | Department Notice Board | The semester fee payment deadline is 15 July. | The semester fee payment deadline is 30 July. |
| 16 | 0.90 | University Circular | Campus News Blog | The revaluation fee is Rs 600 per paper. | The revaluation fee is Rs 400 per paper. |
| 17 | 0.90 | University Circular | Campus News Blog | The ID card replacement fee is Rs 200. | The ID card replacement fee is Rs 300. |

*(2 more rows)*

## 3. Which sources contradict others most often

*Demonstrates:* CTE, UNION ALL, JOIN, GROUP BY, percentage with window-free arithmetic

```sql
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
```

| name | contradicted_claims | pct_of_source_claims |
|---|---|---|
| University Circular | 16 | 53.3 |
| Student Wiki | 9 | 45.0 |
| Department Notice Board | 6 | 37.5 |
| Campus News Blog | 5 | 45.5 |
| Examination Cell Notice | 4 | 44.4 |

## 4. Claims nobody contradicts

*Demonstrates:* NOT EXISTS (correlated subquery) as an anti-join

```sql
SELECT c.id, left(c.text, 80) AS claim
FROM claims c
WHERE NOT EXISTS (
  SELECT 1 FROM claim_relations r
  WHERE r.relation = 'contradicts' AND c.id IN (r.claim_a, r.claim_b)
)
ORDER BY c.id
LIMIT 10;
```

| id | claim |
|---|---|
| 3 | Students with attendance below 65 percent are detained and must repeat the cours |
| 4 | Attendance is computed separately for theory and laboratory components. |
| 5 | The department reminds all students about attendance norms. |
| 8 | Attendance sheets are displayed on the notice board every month. |
| 9 | Welcome to the unofficial exam FAQ maintained by senior students. |
| 12 | Hall tickets are issued two days before the first paper. |
| 13 | The ID card must be carried to every examination. |
| 15 | Students found with a mobile phone are barred from the paper and reported to the |

*(2 more rows)*

## 5. Sources trusted above average

*Demonstrates:* scalar subquery

```sql
SELECT name, trust_score
FROM sources
WHERE trust_score > (SELECT avg(trust_score) FROM sources)
ORDER BY trust_score DESC;
```

| name | trust_score |
|---|---|
| University Circular | 0.90 |
| Examination Cell Notice | 0.85 |

## 6. Corroborated claims

*Demonstrates:* IN with a subquery, GROUP BY, HAVING

```sql
SELECT c.id, left(c.text, 70) AS claim, count(*) AS supporting_claims
FROM claims c
JOIN claim_relations r ON c.id IN (r.claim_a, r.claim_b) AND r.relation = 'supports'
WHERE c.id IN (SELECT claim_a FROM claim_relations UNION SELECT claim_b FROM claim_relations)
GROUP BY c.id
HAVING count(*) >= 1
ORDER BY supporting_claims DESC, c.id
LIMIT 10;
```

| id | claim | supporting_claims |
|---|---|---|
| 1 | All students must maintain a minimum attendance of 75 percent in each | 1 |
| 10 | The minimum attendance needed for the end-semester examination is 75 p | 1 |
| 12 | Hall tickets are issued two days before the first paper. | 1 |
| 13 | The ID card must be carried to every examination. | 1 |
| 16 | Hall tickets are issued two days before the first paper. | 1 |
| 17 | Students must carry the college ID card to every examination. | 1 |
| 30 | The boys hostel gate closes at 11 pm every night. | 1 |
| 32 | Cooking is not permitted inside the hostel rooms. | 1 |

*(2 more rows)*

## 7. Newest document per source

*Demonstrates:* window function ROW_NUMBER() OVER (PARTITION BY ...)

```sql
SELECT source, title, published_at
FROM (
  SELECT s.name AS source, d.title, d.published_at,
         row_number() OVER (PARTITION BY s.id ORDER BY d.published_at DESC NULLS LAST, d.id DESC) AS rn
  FROM documents d JOIN sources s ON s.id = d.source_id
) t
WHERE rn = 1
ORDER BY source;
```

| source | title | published_at |
|---|---|---|
| Campus News Blog | Library Extends Its Hours | Thu Mar 20 2025 00:00:00 GMT+0530 (India Standard Time) |
| Department Notice Board | Placement Eligibility | Wed Aug 20 2025 00:00:00 GMT+0530 (India Standard Time) |
| Examination Cell Notice | Examination Conduct Rules | Sun Nov 02 2025 00:00:00 GMT+0530 (India Standard Time) |
| Student Wiki | Hostel Guide | Tue Sep 10 2024 00:00:00 GMT+0530 (India Standard Time) |
| University Circular | Scholarship Update | Mon Sep 01 2025 00:00:00 GMT+0530 (India Standard Time) |

## 8. Questions per user with rank

*Demonstrates:* LEFT JOIN, aggregate, RANK() window

```sql
SELECT u.email, u.role, count(q.id) AS questions,
       rank() OVER (ORDER BY count(q.id) DESC) AS activity_rank
FROM users u
LEFT JOIN queries q ON q.user_id = u.id
GROUP BY u.id
ORDER BY activity_rank, u.email;
```

| email | role | questions | activity_rank |
|---|---|---|---|
| admin@conrag.test | admin | 0 | 1 |
| analyst@conrag.test | analyst | 0 | 1 |
| viewer@conrag.test | viewer | 0 | 1 |

## 9. Full-text search with ranking

*Demonstrates:* stored function search_documents (tsvector + GIN, websearch syntax, ts_headline)

```sql
SELECT title, source_name, round(rank::numeric, 3) AS rank, snippet
FROM search_documents('attendance OR "library fine"', 5);
```

| title | source_name | rank | snippet |
|---|---|---|---|
| Library Rules | University Circular | 0.049 | books at a time for a period of 14 days. The <b>library</b> <b>fine</b> is Rs 2 per day for each overdue book. The <b>library</b> is open from |
| Library Extends Its Hours | Campus News Blog | 0.049 | season. The <b>library</b> is open from 8 am to 10 pm on weekdays. The <b>library</b> <b>fine</b> is Rs 5 per day for each overdue book. Faculty members may borrow |
| Attendance Regulations 2025 | University Circular | 0.030 | students must maintain a minimum <b>attendance</b> of 75 percent in each course to be eligible for the end-semester examination. <b>Attendance</b> shortage of up to 10 percent may be condoned |
| Department Attendance Reminder | Department Notice Board | 0.030 | department reminds all students about <b>attendance</b> norms. The minimum <b>attendance</b> required to appear for the end-semester examination is 85 percent. <b>Attendance</b> shortage of up to 5 percent |
| Exam FAQ | Student Wiki | 0.020 | Welcome to the unofficial exam FAQ maintained by senior students. The minimum <b>attendance</b> needed for the end-semester examination is 75 percent. Mobile phones are allowed inside the examination hall |

## 10. Nearest claims to a probe claim (vector search)

*Demonstrates:* pgvector cosine distance through find_similar_claims, HNSW index

```sql
SELECT claim_id, round(similarity::numeric, 3) AS similarity, left(text, 70) AS claim
FROM find_similar_claims((SELECT embedding FROM claims ORDER BY id LIMIT 1), 5);
```

| claim_id | similarity | claim |
|---|---|---|
| 1 | 1.000 | All students must maintain a minimum attendance of 75 percent in each |
| 10 | 0.891 | The minimum attendance needed for the end-semester examination is 75 p |
| 6 | 0.847 | The minimum attendance required to appear for the end-semester examina |
| 56 | 0.787 | A student needs at least 40 percent in the end-semester examination to |
| 61 | 0.787 | A student needs at least 40 percent in the end-semester examination to |

## 11. Contradictions inside a retrieval set

*Demonstrates:* retrieve_conflicts, the core ConRAG query (top-k, then contradiction edges inside it)

```sql
SELECT relation_id, claim_a, claim_b, confidence
FROM retrieve_conflicts((SELECT embedding FROM claims ORDER BY id LIMIT 1), 10);
```

| relation_id | claim_a | claim_b | confidence |
|---|---|---|---|
| 2 | 1 | 6 | 0.86 |
| 3 | 6 | 10 | 0.86 |
| 19 | 1 | 56 | 0.80 |
| 22 | 55 | 60 | 0.90 |
| 23 | 1 | 61 | 0.80 |

## 12. Everything contradicting a claim, transitively

*Demonstrates:* recursive CTE via conflict_cluster

```sql
SELECT cc.claim_id, cc.depth, left(c.text, 60) AS claim
FROM conflict_cluster((SELECT claim_a FROM claim_relations WHERE relation = 'contradicts' ORDER BY id LIMIT 1)) cc
JOIN claims c ON c.id = cc.claim_id
ORDER BY cc.depth, cc.claim_id;
```

| claim_id | depth | claim |
|---|---|---|
| 2 | 0 | Attendance shortage of up to 10 percent may be condoned by t |
| 7 | 1 | Attendance shortage of up to 5 percent may be condoned with |

## 13. Source reliability after resolutions

*Demonstrates:* stored function source_reliability and the v_source_stats view

```sql
SELECT name, trust_score, reliability, documents, claims
FROM v_source_stats
ORDER BY reliability DESC, name;
```

| name | trust_score | reliability | documents | claims |
|---|---|---|---|---|
| University Circular | 0.90 | 0.90 | 7 | 30 |
| Examination Cell Notice | 0.85 | 0.85 | 2 | 9 |
| Department Notice Board | 0.60 | 0.60 | 4 | 16 |
| Campus News Blog | 0.50 | 0.50 | 2 | 11 |
| Student Wiki | 0.35 | 0.35 | 4 | 20 |

## 14. Audit trail summary

*Demonstrates:* GROUP BY over trigger-written rows

```sql
SELECT table_name, action, count(*) AS changes, max(at)::date AS latest
FROM audit_log
GROUP BY table_name, action
ORDER BY table_name, action;
```

| table_name | action | changes | latest |
|---|---|---|---|
| claim_relations | INSERT | 28 | Sat Oct 24 2026 00:00:00 GMT+0530 (India Standard Time) |
| sources | INSERT | 5 | Sat Oct 24 2026 00:00:00 GMT+0530 (India Standard Time) |

## 15. Documents per month and source

*Demonstrates:* date_trunc, GROUP BY ROLLUP-style subtotal via GROUPING SETS

```sql
SELECT to_char(date_trunc('month', d.published_at), 'YYYY-MM') AS month, s.name AS source, count(*) AS documents
FROM documents d JOIN sources s ON s.id = d.source_id
WHERE d.published_at IS NOT NULL
GROUP BY GROUPING SETS ((date_trunc('month', d.published_at), s.name), (date_trunc('month', d.published_at)))
ORDER BY month, source NULLS FIRST;
```

| month | source | documents |
|---|---|---|
| 2022-03 |  | 1 |
| 2022-03 | Student Wiki | 1 |
| 2023-02 |  | 1 |
| 2023-02 | Student Wiki | 1 |
| 2023-06 |  | 1 |
| 2023-06 | Student Wiki | 1 |
| 2024-04 |  | 1 |
| 2024-04 | Campus News Blog | 1 |

*(25 more rows)*

## Index usage

The planner is steered away from sequential scans (the demo tables are tiny) to show that the indexes are usable for these query shapes.

**Vector nearest-neighbour (HNSW, cosine)**

```
Limit  (cost=37.41..38.17 rows=5 width=16)
  InitPlan 1
    ->  Limit  (cost=0.15..0.26 rows=1 width=40)
          ->  Index Scan using claims_pkey on claims claims_1  (cost=0.15..111.99 rows=1056 width=40)
  ->  Index Scan using claims_embedding_hnsw on claims  (cost=37.15..197.12 rows=1056 width=16)
        Order By: (embedding <=> (InitPlan 1).col1)
```

**Full-text match (GIN on tsvector)**

```
Bitmap Heap Scan on documents  (cost=17.06..21.07 rows=1 width=8)
  Recheck Cond: (tsv @@ '''attend'''::tsquery)
  ->  Bitmap Index Scan on documents_tsv_gin  (cost=0.00..17.06 rows=1 width=0)
        Index Cond: (tsv @@ '''attend'''::tsquery)
```

**Open contradictions (partial index)**

```
Bitmap Heap Scan on claim_relations  (cost=4.16..11.27 rows=3 width=8)
  Recheck Cond: (relation = 'contradicts'::relation_type)
  ->  Bitmap Index Scan on claim_relations_contra_idx  (cost=0.00..4.16 rows=3 width=0)
```

## Where the application issues DML

| Operation | Statement | Where |
|---|---|---|
| INSERT | documents, chunks, claims, claim_relations in one transaction | src/lib/ingest.ts (withTx) |
| INSERT | queries and query_evidence in one transaction | src/lib/ask.ts |
| INSERT | users (register), sources, conflict_resolutions | src/app/api/auth/register, sources, conflicts/[id]/resolve |
| UPDATE | claim_relations: dismiss a false alarm | src/app/api/conflicts/[id]/dismiss/route.ts |
| UPDATE | sources (trust, kind, name); users (role) | src/app/api/sources/[id], users/[id] |
| UPDATE | claims.status via triggers (supersede / reactivate) | db/migrations/003, 004 |
| DELETE | conflict_resolutions (undo), documents, sources, users | src/app/api/conflicts/[id]/resolve, documents/[id], sources/[id], users/[id] |
| SELECT | joins, aggregates, window functions, subqueries | src/lib/queries.ts, src/lib/ask.ts, db/queries.sql |
