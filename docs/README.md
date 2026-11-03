# Documentation

Start with the [project README](../README.md) for what ConRAG is and how to run it. This index groups the rest by what you are trying to do.

## Understand the system

| Document | Read it to learn |
|---|---|
| [PLAN.md](PLAN.md) | The problem, objectives, scope, functional requirements, phases and risks. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, the ingest, ask and resolve pipelines, scoring, and the two judges. |
| [DESIGN.md](DESIGN.md) | Why PostgreSQL + pgvector, the relational schema, the vector model, the integrity rules, and the reason behind each design decision. |
| [er-diagram.md](er-diagram.md) | The entity-relationship diagram (Mermaid source, with PNG renderings). |

## Use and integrate

| Document | Read it to learn |
|---|---|
| [API.md](API.md) | Every HTTP endpoint, required role, request and response shape, and the error model. |
| [DEMO.md](DEMO.md) | An eight-minute guided tour of the interface. |
| [QUERIES.md](QUERIES.md) | Fifteen important SQL queries with real output and index plans. *Generated.* |
| [DATA-DICTIONARY.md](DATA-DICTIONARY.md) | Every table, column, constraint, index, trigger and function. *Generated.* |

## Trust the system

| Document | Read it to learn |
|---|---|
| [SECURITY.md](SECURITY.md) | The security controls and the known limits. To report a vulnerability, see the [security policy](../SECURITY.md). |
| [TESTING.md](TESTING.md) | The test layers, what each one proves, and how to run them. |
| [EVALUATION.md](EVALUATION.md) | ConRAG against a plain RAG on a labelled corpus, including every disagreement with the labels. *Generated.* |

## Contribute

| Document | Read it to learn |
|---|---|
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Setup, required checks, migration and documentation conventions. |
| [ROADMAP.md](ROADMAP.md) | What is left to build, in suggested order. |
| [../CHANGELOG.md](../CHANGELOG.md) | What changed in each version. |
| [requirements-map.md](requirements-map.md) | Coverage of the course brief this project was built for. |

Documents marked *Generated* are produced by `npm run docs` or `npm run eval` and must not be edited by hand; see [Documentation and generated files](../CONTRIBUTING.md#documentation-and-generated-files).
