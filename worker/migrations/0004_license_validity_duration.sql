-- Activation-Relative Validity: licenses can be issued with a fixed Duration
-- (in seconds) that starts counting at first activation, instead of an
-- absolute expires_at cutoff. See docs/adr/0006-activation-relative-validity-materializes-expires-at.md.

-- license_batches: strict mutual exclusion with expires_at at creation time.
-- Bounds: 1 day (86400) to 100 years (3_153_600_000) seconds.
ALTER TABLE license_batches ADD COLUMN validity_duration_seconds INTEGER
  CONSTRAINT chk_license_batches_validity_duration CHECK (
    validity_duration_seconds IS NULL
    OR (
      validity_duration_seconds BETWEEN 86400 AND 3153600000
      AND expires_at IS NULL
    )
  );

-- licenses: mutual exclusion holds *before* activation only. After first
-- activation the Worker materializes expires_at = activated_at + duration
-- and writes it back, so both columns being non-null is legal once activated_at
-- is set.
ALTER TABLE licenses ADD COLUMN validity_duration_seconds INTEGER
  CONSTRAINT chk_licenses_validity_duration CHECK (
    (validity_duration_seconds IS NULL OR validity_duration_seconds BETWEEN 86400 AND 3153600000)
    AND (
      validity_duration_seconds IS NULL
      OR expires_at IS NULL
      OR activated_at IS NOT NULL
    )
  );
