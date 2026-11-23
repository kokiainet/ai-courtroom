/* @bruin
name: courtroom.decision_summary
type: duckdb.sql
materialization:
    type: table
    strategy: create+replace
depends:
    - courtroom.decisions
@bruin */

select
    agent,
    kind,
    count(*) as decisions,
    any_value(verdict) as verdict
from courtroom.decisions
group by agent, kind
order by agent, kind
