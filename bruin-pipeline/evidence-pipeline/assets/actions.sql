/* @bruin
name: courtroom.actions
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
  - name: actions belong to this run and snapshot
    query: SELECT count(*) FROM courtroom.actions a WHERE NOT EXISTS (SELECT 1 FROM courtroom.cases c WHERE c.run_id=a.run_id AND c.snapshot_id=a.snapshot_id)
    value: 0
    blocking: true
@bruin */
SELECT * FROM read_json('__INPUT_DIR__/actions.json', format='array', columns={run_id:'VARCHAR', snapshot_id:'VARCHAR', id:'VARCHAR', seq:'INTEGER', actor:'VARCHAR', kind:'VARCHAR', target_id:'VARCHAR', reason:'VARCHAR', band_task_id:'VARCHAR', created_at:'VARCHAR', payload_json:'VARCHAR'});
