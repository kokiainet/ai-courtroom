/* @bruin
name: courtroom.cases
type: duckdb.sql
materialization:
  type: table
  strategy: create+replace
columns:
  - name: run_id
    type: string
    checks:
      - name: not_null
      - name: unique
  - name: snapshot_id
    type: string
    checks:
      - name: not_null
@bruin */
SELECT * FROM read_json('__INPUT_DIR__/cases.json', format='array', columns={run_id:'VARCHAR', snapshot_id:'VARCHAR', case_id:'VARCHAR', title:'VARCHAR', question:'VARCHAR', variant:'VARCHAR', mode:'VARCHAR', notice:'VARCHAR'});
