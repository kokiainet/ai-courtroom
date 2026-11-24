/* @bruin
name: courtroom.verdicts
type: duckdb.sql
tags:
  - post_verdict
materialization:
  type: table
  strategy: create+replace
depends:
  - courtroom.verdict_packet
custom_checks:
  - name: verdict states reasons and evidence references
    query: SELECT count(*) FROM courtroom.verdicts WHERE trim(outcome)='' OR trim(reasons)='' OR coalesce(array_length(cited_evidence_ids),0)=0
    value: 0
    blocking: true
  - name: verdict uses the current approved snapshot
    query: SELECT count(*) FROM courtroom.verdicts v WHERE NOT EXISTS (SELECT 1 FROM courtroom.verdict_packet p WHERE p.run_id=v.run_id AND p.snapshot_id=v.snapshot_id)
    value: 0
    blocking: true
  - name: verdict cites only submitted claims
    query: SELECT count(*) FROM courtroom.verdicts v, unnest(v.cited_claim_ids) AS t(claim_id) WHERE NOT EXISTS (SELECT 1 FROM courtroom.claims cl WHERE cl.id=t.claim_id AND cl.run_id=v.run_id AND cl.snapshot_id=v.snapshot_id AND cl.status='submitted')
    value: 0
    blocking: true
  - name: verdict cites only current evidence
    query: SELECT count(*) FROM courtroom.verdicts v, unnest(v.cited_evidence_ids) AS t(evidence_id) WHERE NOT EXISTS (SELECT 1 FROM courtroom.evidence e WHERE e.id=t.evidence_id AND e.run_id=v.run_id AND e.snapshot_id=v.snapshot_id)
    value: 0
    blocking: true
@bruin */
SELECT * FROM read_json('__INPUT_DIR__/verdicts.json', format='array', columns={run_id:'VARCHAR', snapshot_id:'VARCHAR', id:'VARCHAR', outcome:'VARCHAR', reasons:'VARCHAR', cited_claim_ids:'VARCHAR[]', cited_evidence_ids:'VARCHAR[]', bruin_receipt_id:'VARCHAR', created_at:'VARCHAR'});
