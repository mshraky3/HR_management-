# Tests

Integration tests run the real app against a **local scratch Postgres** (never production):

1. Start Postgres and restore a production dump into a UTF8 database (see the memory note
   `verify-fresh-db-needs-local-postgres`, or `HR-/..` session notes).
2. `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54329/hrscratch npm test`

Tests create their own rows (ids >= 900000) and remove them afterwards. The helpers refuse any
non-localhost database host.
