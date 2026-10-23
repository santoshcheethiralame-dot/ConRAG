# Demo script (about 8 minutes)

Setup (once): `npm run db:dev` in one terminal; in another `npm run db:migrate && npm run db:seed && npm run demo:load && npm run dev`. Open http://localhost:3000. Passwords are your `SEED_PASSWORD`.

The demo data is 19 synthetic campus-policy documents from five sources of different trust (University Circular 0.90, Examination Cell 0.85, Department Notice Board 0.60, Campus News Blog 0.50, Student Wiki 0.35). Conflicts are planted deliberately.

## 1. The problem (1 min)
Say: a normal RAG retrieves a chunk and answers. If two documents disagree it picks one, and the user never learns there was a conflict.

## 2. Plain RAG vs ConRAG (2 min), signed in as **viewer**
1. **Ask** → *What is the minimum attendance for the end-semester exam?* (keep "Also show what a plain RAG would answer" ticked).
2. Point at the plain-RAG answer: one number, no warning (it may be 75 or 85, depending on which chunk ranked first).
3. Point at the ConRAG answer: *the sources disagree*, both claims with source, date and trust, the side the evidence favours and why (reliability, recency, corroboration), and the third source that corroborates the official figure ("also stated by Student Wiki").
4. Ask *Is Wi-Fi available in the hostels?* → no conflict badge, no noise.
5. Ask *How many experiments must first-year students complete?* → the look-alike "final-year" claim is correctly **not** flagged (scope guard).

## 3. How it knows (1 min)
**Documents** → open *Laboratory Rules*: every sentence became a claim, each with its relations to claims in other documents (`contradicts`, `supports`, with confidence and rationale). Use the search box: `hostel laundry`, `"library fine"`, `attendance -department` (full-text, GIN index).

## 4. Closing the loop (2 min), sign out, sign in as **admin**
1. **Conflicts** → filter by source *Student Wiki*, confidence ≥ 70 %.
2. Open the library fine conflict (Rs 2 vs Rs 5). Add a note, **Keep left claim**.
3. **Ask** *What is the library fine per day?* → the Rs 5 claim is gone from ConRAG's answer; plain RAG still shows it.
4. **Sources** → the blog's *reliability* dropped below its declared trust, calculated by a stored function from resolved conflicts.
5. **Audit** → trigger-written rows for the relation and the resolution. Back on **Conflicts → Resolved**, **Undo resolution** and ask again: the conflict returns.
6. Dismiss a false alarm with **Not a conflict** (for example the lab-attendance exception).

## 5. Ingest live (1 min), as **analyst**
**Ingest** → source *Campus News Blog*, date today, text: `The revaluation fee is Rs 700 per paper.` plus a couple of other sentences. The result card shows claims found and contradictions detected; the new conflict appears on the dashboard.

## 6. Under the hood (1 min)
Show [ER diagram](er-diagram.png), then in `psql` or the query pack ([QUERIES.md](QUERIES.md)): `retrieve_conflicts` (top-k, then contradiction edges inside it), the HNSW plan, and the trigger that supersedes the loser. Mention: PostgreSQL + pgvector is one store for relations, vectors and full-text so one transaction and one join cover everything.

## 7. Results (30 s)
[EVALUATION.md](EVALUATION.md): disclosure 16/16 vs 0/16, better-supported answer 16/16 vs 8/16, precision 0.85 / recall 1.00 with the rule-based judge, and what the language-model judge is for.

## If something goes wrong
- *No conflicts anywhere:* `npm run demo:load` was not run, or the embedding model could not download (it needs internet once).
- *Slow first question:* the embedding model loads on first use (a few seconds).
- *Port 5433 busy:* another `db:dev` is running.
