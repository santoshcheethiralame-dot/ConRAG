-- 002: ALTER demo. Claims can be superseded once an admin resolves a conflict.
CREATE TYPE claim_status AS ENUM ('active', 'superseded');

ALTER TABLE claims
  ADD COLUMN status claim_status NOT NULL DEFAULT 'active',
  ADD COLUMN superseded_at TIMESTAMPTZ,
  ADD CONSTRAINT claims_superseded_ck
    CHECK ((status = 'superseded') = (superseded_at IS NOT NULL));

CREATE INDEX claims_active_idx ON claims (id) WHERE status = 'active';
