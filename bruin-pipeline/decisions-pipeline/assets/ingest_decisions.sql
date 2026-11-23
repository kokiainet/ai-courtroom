/* @bruin
name: courtroom.decisions
type: duckdb.sql
materialization:
    type: table
    strategy: create+replace
@bruin */

-- The courtroom app exports its decision ledger as JSON (decisions.json).
-- This asset materializes every agent decision into DuckDB through Bruin.
select
    d.step as step,
    d.agent as agent,
    d.kind as kind,
    d.decision as decision,
    d.why as why,
    d.pros_score as pros_score,
    d.def_score as def_score,
    raw.verdict as verdict,
    raw.seed as seed,
    raw.margin as margin
from read_json_auto('bruin-pipeline/data/decisions.json') as raw,
     unnest(raw.decisions) as t(d)
