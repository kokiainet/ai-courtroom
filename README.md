# AI Courtroom — Who Owns What an AI Learns From You?

**Multiplayer AI Hackathon (Thanksgiving Special) · Track 1: Agent Animated Film**

A courtroom drama where the plot is decided by the agents, not by us.

A platform distilled a paid expert Skill into its base model — 2.1 million probe
calls, no consent, no payment. Four agents argue the case live:

- **Ada Voss, Prosecutor** — prove the platform took the expert's craft.
- **Victor Hale, Defense** — learning is not theft; no protected thing was copied.
- **Maya Chen, Witness** — the developer whose Skill was absorbed.
- **Judge Rao** — weighs only what was shown in the room, then rules.

## How it works

Nothing about the ending is scripted. On every turn, the acting agent reads the
shared state — the evidence on the table, the opponent's last claim, its own
memory of arguments already used and points already conceded — and picks its
move: present evidence, rebut, concede a crushing point to buy credibility, or
reframe. The judge keeps a running balance, and the verdict (Liable / Not
Liable / Settlement Ordered) is computed from what actually happened in the
room. Same setup, different endings across runs — try it a few times.

Every decision, and the reason for it, streams into the **Decision Ledger**
panel on screen: what each agent decided, and why.

## Run it

Open `index.html` in any browser (or serve the folder, e.g. `npx serve .`).
Press **Begin the trial**. A full trial takes about 1–2 minutes.

## Bruin (mandatory sponsor tool)

The decision ledger is the project's data trail, and **Bruin** is its data
platform:

1. In the app, press **Export decision ledger (JSON)** after a trial.
2. Save the file as `bruin-pipeline/data/decisions.json`.
3. Run the pipeline:

```bash
bruin run bruin-pipeline/decisions-pipeline
```

This materializes two DuckDB tables through Bruin:

- `courtroom.decisions` — every agent decision, its reason, and the running score.
- `courtroom.decision_summary` — decisions per agent and move type, with the verdict.

A sample `decisions.json` (one full trial) is committed so the pipeline runs
out of the box. Verified with Bruin v0.11.832: both assets pass.

## Files

- `index.html` — the stage: animated agents, speech, score bar, decision ledger.
- `engine.js` — the multi-agent deliberation engine (goals, memory, move
  selection, verdict computation). Pure JS, no dependencies; also runs in Node:
  `node -e "console.log(require('./engine.js').runTrial(42).verdict)"`.
- `bruin-pipeline/` — the Bruin project (`.bruin.yml` lives at the repo root).

Demo video cut in **AdaL**, per the hackathon rules.
