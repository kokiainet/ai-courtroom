/* @bruin
name: courtroom.claims
type: duckdb.sql
materialization:
  type: table
  strategy: create+replace
depends:
  - courtroom.cases
  - courtroom.evidence
columns:
  - name: id
    type: string
    checks:
      - name: not_null
      - name: unique
custom_checks:
  - name: claims belong to this run and snapshot
    query: SELECT count(*) FROM courtroom.claims cl WHERE NOT EXISTS (SELECT 1 FROM courtroom.cases c WHERE c.run_id=cl.run_id AND c.snapshot_id=cl.snapshot_id)
    value: 0
    blocking: true
  - name: factual claims cite evidence
    query: SELECT count(*) FROM courtroom.claims WHERE kind='factual' AND status='submitted' AND coalesce(array_length(evidence_ids),0)=0
    value: 0
    blocking: true
  - name: no missing or cross-run citations
    query: SELECT count(*) FROM courtroom.claims cl, unnest(cl.evidence_ids) AS t(evidence_id) WHERE cl.status='submitted' AND NOT EXISTS (SELECT 1 FROM courtroom.evidence e WHERE e.id=t.evidence_id AND e.run_id=cl.run_id AND e.snapshot_id=cl.snapshot_id)
    value: 0
    blocking: true
  - name: case facts cite a stipulated case exhibit
    query: SELECT count(*) FROM courtroom.claims cl WHERE cl.status='submitted' AND cl.scope='case_fact' AND NOT EXISTS (SELECT 1 FROM courtroom.evidence e WHERE e.id IN (SELECT unnest(cl.evidence_ids)) AND e.run_id=cl.run_id AND e.snapshot_id=cl.snapshot_id AND e.source_type='case_exhibit' AND e.verified_case_exhibit)
    value: 0
    blocking: true
@bruin */
SELECT * FROM read_json('__INPUT_DIR__/claims.json', format='array', columns={run_id:'VARCHAR', snapshot_id:'VARCHAR', id:'VARCHAR', actor:'VARCHAR', round:'INTEGER', text:'VARCHAR', kind:'VARCHAR', scope:'VARCHAR', evidence_ids:'VARCHAR[]', status:'VARCHAR'});
