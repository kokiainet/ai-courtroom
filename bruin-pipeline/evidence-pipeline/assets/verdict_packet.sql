/* @bruin
name: courtroom.verdict_packet
type: duckdb.sql
materialization:
  type: table
  strategy: create+replace
depends:
  - courtroom.cases
  - courtroom.evidence
  - courtroom.claims
  - courtroom.actions
custom_checks:
  - name: one current case packet exists
    query: SELECT count(*) FROM courtroom.verdict_packet
    value: 1
    blocking: true
@bruin */
SELECT c.run_id, c.snapshot_id, c.title, c.question, c.variant, c.mode,
  (SELECT count(*) FROM courtroom.evidence) AS evidence_count,
  (SELECT count(*) FROM courtroom.claims) AS claim_count,
  (SELECT count(*) FROM courtroom.actions) AS action_count,
  current_timestamp AS validated_at
FROM courtroom.cases c;
