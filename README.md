# AI Courtroom — Who Owns What an AI Learns From You?

**Multiplayer AI Hackathon · Track 1: Agent Animated Film**

A platform is accused of extracting an expert's paid Skill. Change the evidence and watch four agents respond. **People, figures and exhibits are fictional.** Public references supply background, not proof of fictional events.

## Architecture

Ada prosecutes, Victor defends, Maya testifies, and Judge Rao rules. Live makes **seven real model calls** in a scheduled order, plus repair if needed. Roles receive goals, history and current evidence. Model-generated arguments and rulings replace the original `engine.js` score formula.

**Bruin gates judgment:** versioned inputs enter SQL/DuckDB; reference, quote and snapshot checks run; database read-back unlocks the judge. Verdict citations are checked again. This validates data integrity, not legal correctness. Failures stop the hearing, without scripted fallback or synthetic PASS receipts.

## Run

Python 3.9+; no Python packages or Node build step:

```sh
python3 server.py --port 8766
```

Open [localhost:8766](http://localhost:8766) and [local setup](http://localhost:8766/setup.html).

- Recorded samples require no model credentials.
- Live uses **Codex CLI**, with an existing login and CLI default model. Select it and test access. DeepSeek is an alternative; use its preset and supply your key.
- Live also requires [Bruin CLI](https://getbruin.com/docs/bruin/getting-started/introduction/installation) on `PATH` or at `.tools/bruin`. Local binaries are not committed.

Keys stay in gitignored `.local/settings.json`, with owner-only permissions. Neither `.local/` nor `runtime/` is served as static content; saved keys are never returned.

## Modes

| Mode | Behavior |
|---|---|
| **Live trial** | New model calls and Bruin execution, with actual receipts. |
| **Recorded runs** | Saved-session playback, retaining its original mode and recording label; no fresh inference. |
| **Rehearsal** | Explicitly scripted visual preview, without model or sponsor calls. |

Real samples [connected.json](recordings/connected.json), [baseline.json](recordings/baseline.json) and [authorization.json](recordings/authorization.json) preserve decisions/receipts, remove machine paths, and declare `recorded_fixture: true`. The connected recording supplies the presentation footage. New artifacts remain gitignored under `runtime/`.

The optional [full 3D courtroom](http://localhost:8766/assets/holo.html) uses vendored Three.js 0.180.0: ivory walls, warm wood and gold, multiple virtual camera angles, and cyan evidence projections. It replays the connected recording without new inference. Native recording of this view targets 30 fps through `captureStream(30)` and MediaRecorder; that capture is video-only.

**Completed film:** `ai-courtroom-midwide.mp4`, 164.566667 seconds, 1280×720 H.264 at 30 fps with AAC audio. It uses the original 2D dialogue throughout, except for a brief matching-time warm 3D courtroom wide view at 92.0–93.5 seconds. The opening stays 2D; dialogue returns to 2D at 93.5 seconds. Original audio stays continuous, with no opening/closing cards or added duration. The full 3D view remains optional in the app, and earlier local film versions are preserved. [Watch the submitted film on YouTube](https://youtu.be/i_SPwyqDuGM) (unlisted). Submitted to the Multiplayer AI Hackathon, Agent Animated Film track.

## Integration status

| Tool | Current status |
|---|---|
| **Bruin** | Real evidence pipeline, snapshot read-back and verdict gate verified locally. |
| **BAND** | Six real directed handoffs completed in the integrated hearing: registered identities, private project room, recipient read-back and processing acknowledgment. |
| **Telem** | Real search/fetch supplied two fetched public sources to that hearing, with source/request receipts. |
| **AdaL** | AdaL CLI 1.11.15 with DeepSeek BYOAK completed the real hybrid edit/export. The 3D-to-2D transition and dialogue views were reviewed locally. |

Without optional service configuration, roles use local coordination and skip web research. Recordings retain their original integration state. No prize eligibility or award is guaranteed.

## Validation

Integrated run `3535013d442b` completed seven model steps, six verified BAND handoffs, two fetched Telem sources and successful Bruin finalization; its ruling was **LIABLE**.

Final seven-call Codex hearings passed Bruin finalization: **Original filing → LIABLE** for extraction beyond the original authorization, without proving base-model use or sales causation or awarding damages; **A signed license → NOT LIABLE**, considering 2.5 million authorized versus 2.1 million actual calls. These are observed results, not fixed outcomes.

Inspect **Data checks** and **Export** JSON. **Test a broken citation** injects `EX-MISSING`, demonstrates blocking, repairs to `EX-ACCESS`, and verifies a new snapshot. This is an explicit test, not an organic hallucination.

Pipeline-only checks:

```sh
python3 evidence_store.py --variant baseline --run-id check-baseline
python3 evidence_store.py --variant authorization --run-id check-authorization
python3 evidence_store.py --bad-citation --run-id check-missing-citation
python3 integrity_demo.py
```

Expected: valid inputs pass; missing references block; repair produces a distinct passed snapshot. Missing CLI/driver access reports unavailable.
