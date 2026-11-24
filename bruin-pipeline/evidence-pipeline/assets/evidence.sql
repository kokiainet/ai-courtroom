/* @bruin
name: courtroom.evidence
type: duckdb.sql
materialization:
  type: table
  strategy: create+replace
depends:
  - courtroom.cases
columns:
  - name: id
    type: string
    checks:
      - name: not_null
      - name: unique
custom_checks:
  - name: evidence belongs to this run and snapshot
    query: SELECT count(*) FROM courtroom.evidence e WHERE NOT EXISTS (SELECT 1 FROM courtroom.cases c WHERE c.run_id=e.run_id AND c.snapshot_id=e.snapshot_id)
    value: 0
    blocking: true
  - name: quoted passage exists in supplied source
    query: SELECT count(*) FROM courtroom.evidence WHERE trim(quote)='' OR strpos(regexp_replace(source_text, '\s+', ' ', 'g'), regexp_replace(quote, '\s+', ' ', 'g'))=0
    value: 0
    blocking: true
  - name: web background never establishes fictional case facts
    query: SELECT count(*) FROM courtroom.evidence WHERE source_type NOT IN ('case_exhibit','web_source') OR (source_type='web_source' AND (scope<>'background' OR proves_case_fact OR NOT regexp_matches(source_url, '^https?://') OR fetch_status<>'succeeded')) OR (source_type='case_exhibit' AND NOT verified_case_exhibit)
    value: 0
    blocking: true
@bruin */
SELECT * FROM read_json('__INPUT_DIR__/evidence.json', format='array', columns={run_id:'VARCHAR', snapshot_id:'VARCHAR', id:'VARCHAR', title:'VARCHAR', source_type:'VARCHAR', source_url:'VARCHAR', source_text:'VARCHAR', quote:'VARCHAR', submitted_by:'VARCHAR', scope:'VARCHAR', proves_case_fact:'BOOLEAN', verified_case_exhibit:'BOOLEAN', content_hash:'VARCHAR', fetched_at:'VARCHAR', fetch_status:'VARCHAR', tool_receipt_id:'VARCHAR'});
