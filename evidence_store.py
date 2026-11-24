"""Versioned, local Bruin evidence gate. Python 3.9+, no Python dependencies.

Only a successful real Bruin run AND a database snapshot read-back can unlock a
judge. Python diagnostics never stand in for a Bruin PASS. All mutable data,
DuckDB files, receipts and process logs live under runtime/runs/<run_id>.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
from datetime import datetime, timezone
import uuid


def _now():
    return datetime.now(timezone.utc).isoformat()


def _text(value):
    return "" if value is None else str(value)


def _space(value):
    return " ".join(_text(value).split())


def _json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _ids(value):
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    result = []
    for item in value:
        if isinstance(item, dict):
            item = item.get("evidence_id", item.get("claim_id", item.get("id", "")))
        if item is not None and _text(item):
            result.append(_text(item))
    return result


class EvidenceStore:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.runtime = self.root / "runtime" / "runs"
        self.templates = self.root / "bruin-pipeline" / "evidence-pipeline"
        self._lock = threading.RLock()

    def load_case(self, variant="baseline"):
        if variant not in ("baseline", "authorization"):
            raise ValueError("variant must be baseline or authorization")
        data = json.loads((self.root / "case_data.json").read_text(encoding="utf-8"))
        exhibits = copy.deepcopy(data["exhibits"])
        if variant == "authorization":
            exhibits.append(copy.deepcopy(data["authorization_exhibit"]))
        return {
            "case_title": data["title"], "title": data["title"],
            "question": data["question"], "mode": data["mode"],
            "notice": data["notice"], "variant": variant,
            "roles": copy.deepcopy(data["roles"]), "exhibits": exhibits,
            "references": copy.deepcopy(data.get("references", [])),
        }

    def _directory(self, run_id):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,95}", _text(run_id)):
            raise ValueError("run_id must contain 1–96 letters, numbers, underscores or hyphens")
        return self.runtime / run_id

    def _binary(self):
        local = self.root / ".tools" / "bruin"
        if local.is_file() and os.access(str(local), os.X_OK):
            return str(local)
        return shutil.which("bruin")

    def _env(self):
        env = os.environ.copy()
        env["BRUIN_HOME"] = str(self.root / ".tools" / "bruin-home")
        env["TELEMETRY_OPTOUT"] = "true"
        return env

    def _command(self, command, directory, timeout=90):
        try:
            result = subprocess.run(command, cwd=str(directory), env=self._env(),
                                    capture_output=True, text=True, timeout=timeout)
            return {"command": command, "exit_code": result.returncode,
                    "stdout": result.stdout, "stderr": result.stderr}
        except (OSError, subprocess.TimeoutExpired) as exc:
            return {"command": command, "exit_code": None, "stdout": "",
                    "stderr": _text(exc), "unavailable": True}

    def _query(self, binary, directory, config, sql):
        result = self._command([binary, "query", "--config-file", str(config),
                                "--connection", "courtroom-evidence", "--query", sql,
                                "--output", "json"], directory, timeout=30)
        if result["exit_code"] != 0:
            return [], result
        try:
            data = json.loads(result["stdout"])
            names = [c["name"] for c in data["columns"]]
            return [dict(zip(names, row)) for row in data["rows"]], result
        except (ValueError, KeyError, TypeError) as exc:
            result["exit_code"] = None
            result["stderr"] += "\nInvalid Bruin query JSON: " + _text(exc)
            return [], result

    def _normalize(self, run_id, snapshot_id, case, evidence, claims, actions):
        known = {e["id"]: e for e in case["exhibits"]}
        normalized_evidence = []
        for index, original in enumerate(evidence or []):
            row = copy.deepcopy(original)
            evidence_id = _text(row.get("id", row.get("evidence_id", "E-" + str(index + 1))))
            source_type = _text(row.get("source_type", "web_source"))
            if source_type == "web_reference":
                source_type = "web_source"
            source_text = _text(row.get("source_text", row.get("content", row.get("text", ""))))
            source_url = _text(row.get("source_url", row.get("url", "")))
            exhibit = known.get(evidence_id)
            verified = bool(exhibit and source_type == "case_exhibit"
                            and _space(source_text) == _space(exhibit["source_text"])
                            and source_url == exhibit["source_url"])
            receipts = row.get("receipts", [])
            receipt = receipts[-1] if isinstance(receipts, list) and receipts and isinstance(receipts[-1], dict) else row.get("receipt", {})
            receipt = receipt if isinstance(receipt, dict) else {}
            fetch_status = _text(row.get("fetch_status", row.get("status", "succeeded" if source_text else "failed")))
            if source_type == "web_source" and row.get("fetched") is False:
                fetch_status = "not_fetched"
            normalized_evidence.append({
                "run_id": _text(row.get("run_id", run_id)),
                "snapshot_id": _text(row.get("snapshot_id", snapshot_id)),
                "id": evidence_id, "title": _text(row.get("title", evidence_id)),
                "source_type": source_type, "source_url": source_url,
                "source_text": source_text, "quote": _text(row.get("quote", "")),
                "submitted_by": _text(row.get("submitted_by", row.get("actor", "system"))),
                "scope": _text(row.get("scope", "case_fact" if source_type == "case_exhibit" else "background")),
                "proves_case_fact": bool(row.get("proves_case_fact", source_type == "case_exhibit")),
                "verified_case_exhibit": verified,
                "content_hash": hashlib.sha256(source_text.encode("utf-8")).hexdigest(),
                "fetched_at": _text(row.get("fetched_at", _now())),
                "fetch_status": fetch_status,
                "tool_receipt_id": _text(row.get("tool_receipt_id", row.get("interaction_id", receipt.get("request_id") or receipt.get("response_sha256", "")))),
            })
        normalized_claims = []
        for index, row in enumerate(claims or []):
            normalized_claims.append({
                "run_id": _text(row.get("run_id", run_id)),
                "snapshot_id": _text(row.get("snapshot_id", snapshot_id)),
                "id": _text(row.get("id", row.get("claim_id", "C-" + str(index + 1)))),
                "actor": _text(row.get("actor", row.get("agent", row.get("role", "system")))),
                "round": int(row.get("round", 1)),
                "text": _text(row.get("text", row.get("claim", ""))),
                "kind": _text(row.get("kind", "factual")),
                "scope": _text(row.get("scope", "case_fact")),
                "evidence_ids": _ids(row.get("evidence_ids", row.get("citations", []))),
                "status": _text(row.get("status", "submitted")),
            })
        normalized_actions = []
        for index, row in enumerate(actions or []):
            normalized_actions.append({
                "run_id": _text(row.get("run_id", run_id)),
                "snapshot_id": _text(row.get("snapshot_id", snapshot_id)),
                "id": _text(row.get("id", row.get("action_id", "A-" + str(index + 1)))),
                "seq": int(row.get("seq", index + 1)),
                "actor": _text(row.get("actor", row.get("agent", row.get("role", "system")))),
                "kind": _text(row.get("kind", row.get("action", "statement"))),
                "target_id": _text(row.get("target_id", "")),
                "reason": _text(row.get("reason", row.get("why", ""))),
                "band_task_id": _text(row.get("band_task_id", row.get("task_id", ""))),
                "created_at": _text(row.get("created_at", _now())),
                "payload_json": _json(row),
            })
        return normalized_evidence, normalized_claims, normalized_actions

    def _diagnostics(self, run_id, snapshot_id, evidence, claims, actions):
        issues = []
        for label, rows in (("evidence", evidence), ("claims", claims), ("actions", actions)):
            seen = set()
            for row in rows:
                if not row["id"] or row["id"] in seen:
                    issues.append(label + " contains a missing or duplicate id: " + row["id"])
                seen.add(row["id"])
                if row["run_id"] != run_id or row["snapshot_id"] != snapshot_id:
                    issues.append(label + " " + row["id"] + " belongs to another run or snapshot")
        by_id = {e["id"]: e for e in evidence}
        for row in evidence:
            if not _space(row["quote"]) or _space(row["quote"]) not in _space(row["source_text"]):
                issues.append("Quote not found in source for " + row["id"])
            if row["source_type"] == "case_exhibit" and not row["verified_case_exhibit"]:
                issues.append("Unknown or modified fictional case exhibit: " + row["id"])
            if row["source_type"] == "web_source" and (row["scope"] != "background" or row["proves_case_fact"]):
                issues.append("Web background cannot establish fictional case facts: " + row["id"])
            if row["source_type"] == "web_source" and (not re.match(r"^https?://", row["source_url"]) or row["fetch_status"] != "succeeded"):
                issues.append("Web source has no successful HTTP source record: " + row["id"])
            if row["source_type"] not in ("case_exhibit", "web_source"):
                issues.append("Unknown evidence source_type: " + row["id"])
        roles = {"prosecutor", "defense", "witness", "judge"}
        for claim in claims:
            if claim["actor"] not in roles or claim["kind"] not in ("factual", "inference") or claim["status"] not in ("submitted", "withdrawn"):
                issues.append("Claim has an invalid actor, kind or status: " + claim["id"])
            if not claim["text"].strip():
                issues.append("Claim is blank: " + claim["id"])
            if claim["status"] == "withdrawn":
                continue
            if claim["kind"] == "factual" and not claim["evidence_ids"]:
                issues.append("Factual claim lacks a citation: " + claim["id"])
            missing = [eid for eid in claim["evidence_ids"] if eid not in by_id]
            if missing:
                issues.append("Missing evidence for " + claim["id"] + ": " + ", ".join(missing))
            if claim["scope"] == "case_fact" and not any(by_id.get(eid, {}).get("verified_case_exhibit") for eid in claim["evidence_ids"]):
                issues.append("Case fact has no stipulated exhibit: " + claim["id"])
        return list(dict.fromkeys(issues))

    def prepare(self, run_id, variant="baseline", evidence=None, claims=None, actions=None):
        with self._lock:
            return self._prepare(run_id, variant, evidence, claims, actions)

    def _prepare(self, run_id, variant, evidence, claims, actions):
        directory = self._directory(run_id)
        directory.mkdir(parents=True, exist_ok=True)
        case = self.load_case(variant)
        snapshot_id = "snap-" + uuid.uuid4().hex[:16]
        snapshot_dir = directory / "snapshots" / snapshot_id
        snapshot_dir.mkdir(parents=True)
        if evidence is None:
            evidence = case["exhibits"]
        evidence, claims, actions = self._normalize(run_id, snapshot_id, case, evidence, claims, actions)
        issues = self._diagnostics(run_id, snapshot_id, evidence, claims, actions)
        case_row = {"run_id": run_id, "snapshot_id": snapshot_id, "case_id": "skillvault-fictional",
                    "title": case["title"], "question": case["question"], "variant": variant,
                    "mode": "fictional", "notice": case["notice"]}
        for name, rows in (("cases", [case_row]), ("evidence", evidence), ("claims", claims),
                           ("actions", actions), ("verdicts", [])):
            _write(snapshot_dir / (name + ".json"), rows)
        packet = {"run_id": run_id, "snapshot_id": snapshot_id, "variant": variant,
                  "status": "unavailable", "judge_allowed": False,
                  "case": case_row, "case_title": case["title"], "question": case["question"],
                  "evidence": evidence, "claims": claims, "actions": actions,
                  "issues": issues, "checks": [],
                  "limits": "Checks verify provenance records, citation existence and quote containment, not factual truth or legal correctness.",
                  "bruin": {"status": "unavailable", "engine": "bruin", "receipt_id": None}}
        # Revoke the previous permission before starting a new snapshot. A failed
        # run must never leave a previous successful packet usable as current.
        _write(directory / "latest.json", {"snapshot_id": snapshot_id, "status": "running"})
        binary = self._binary()
        if not binary:
            packet["issues"].append("Bruin CLI is unavailable. Python diagnostics do not authorize judgment.")
            return self._persist(directory, snapshot_dir, packet)
        config = directory / ".bruin.yml"
        config.write_text("default_environment: default\nenvironments:\n  default:\n    connections:\n      duckdb:\n        - name: courtroom-evidence\n          path: " + json.dumps(str(directory / "evidence_gate.duckdb")) + "\n", encoding="utf-8")
        pipeline = snapshot_dir / "pipeline"
        shutil.copytree(str(self.templates), str(pipeline))
        safe_dir = str(snapshot_dir).replace("'", "''")
        for sql in (pipeline / "assets").glob("*.sql"):
            sql.write_text(sql.read_text(encoding="utf-8").replace("__INPUT_DIR__", safe_dir), encoding="utf-8")
        receipt_id = "bruin-" + uuid.uuid4().hex[:16]
        run = self._command([binary, "run", "--config-file", str(config), "--no-color",
                             "--workers", "1", "--timeout", "75", "--exclude-tag", "post_verdict",
                             str(pipeline)], directory, timeout=85)
        _write(snapshot_dir / "bruin-run.json", run)
        packet["bruin"] = {"status": "blocked", "engine": "bruin", "receipt_id": receipt_id,
                           "exit_code": run["exit_code"], "snapshot_id": snapshot_id,
                           "database": str(directory / "evidence_gate.duckdb"),
                           "log_path": str(snapshot_dir / "bruin-run.json"),
                           "command": run["command"], "completed_at": _now()}
        if run["exit_code"] == 0:
            sql = " UNION ALL ".join("SELECT '" + label + "' AS kind, to_json(t) AS payload FROM courtroom." + table + " t"
                                     for label, table in (("case", "cases"), ("evidence", "evidence"), ("claims", "claims"),
                                                          ("actions", "actions"), ("packet", "verdict_packet")))
            rows, query = self._query(binary, directory, config, sql)
            _write(snapshot_dir / "bruin-readback.json", query)
            actual = {"case": [], "evidence": [], "claims": [], "actions": [], "packet": []}
            for row in rows:
                actual[row["kind"]].append(json.loads(row["payload"]))
            valid_snapshot = (query["exit_code"] == 0 and len(actual["packet"]) == 1
                              and actual["packet"][0]["run_id"] == run_id
                              and actual["packet"][0]["snapshot_id"] == snapshot_id)
            if valid_snapshot:
                packet["case"] = actual["case"][0]
                for name in ("evidence", "claims", "actions"):
                    packet[name] = actual[name]
                packet["database_packet"] = actual["packet"][0]
                packet["status"] = "passed" if not issues else "blocked"
                packet["bruin"]["status"] = "passed"
                packet["judge_allowed"] = not issues
            else:
                packet["status"] = "blocked"
                packet["issues"].append("Bruin read-back did not match the requested run and snapshot; judgment remains locked.")
        else:
            output = run["stdout"] + run["stderr"]
            unavailable = run.get("unavailable") or "initializing connection manager" in output or "failed to ensure ADBC" in output
            packet["status"] = "unavailable" if unavailable else "blocked"
            packet["bruin"]["status"] = packet["status"]
            if not issues:
                packet["issues"].append("Bruin pipeline did not pass; inspect the saved process log.")
            packet["bruin"]["error"] = output[-3000:]
        packet["checks"] = [
            {"name": "Python contract diagnostics", "engine": "python", "status": "passed" if not issues else "blocked", "issues": issues},
            {"name": "Real Bruin blocking quality checks", "engine": "bruin", "status": packet["bruin"]["status"]},
            {"name": "Database snapshot matches current request", "engine": "bruin", "status": "passed" if packet.get("database_packet") else "blocked"},
        ]
        return self._persist(directory, snapshot_dir, packet)

    def _persist(self, directory, snapshot_dir, packet):
        packet["issues"] = list(dict.fromkeys(packet["issues"]))
        _write(snapshot_dir / "packet.json", packet)
        _write(directory / "packet.json", packet)
        _write(directory / "latest.json", {"snapshot_id": packet["snapshot_id"], "status": packet["status"],
                                           "judge_allowed": packet["judge_allowed"], "bruin": packet["bruin"]})
        return packet

    def finalise(self, run_id, verdict):
        with self._lock:
            return self._finalise(run_id, verdict)

    def _finalise(self, run_id, verdict):
        directory = self._directory(run_id)
        try:
            packet = json.loads((directory / "packet.json").read_text(encoding="utf-8"))
            latest = json.loads((directory / "latest.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {"run_id": run_id, "status": "blocked", "issues": ["No approved evidence packet exists."]}
        if isinstance(verdict, str):
            verdict = {"outcome": verdict}
        snapshot_id = verdict.get("snapshot_id", packet["snapshot_id"])
        if (not packet.get("judge_allowed") or packet["status"] != "passed" or latest["status"] != "passed"
                or snapshot_id != packet["snapshot_id"] or snapshot_id != latest["snapshot_id"]
                or packet["bruin"].get("receipt_id") != latest.get("bruin", {}).get("receipt_id")):
            return {"run_id": run_id, "snapshot_id": snapshot_id, "status": "blocked",
                    "issues": ["Verdict attempted without the current successful Bruin snapshot receipt."]}
        row = {"run_id": _text(verdict.get("run_id", run_id)), "snapshot_id": snapshot_id,
               "id": _text(verdict.get("id", "V-" + uuid.uuid4().hex[:12])),
               "outcome": _text(verdict.get("outcome", verdict.get("verdict", "insufficient_evidence"))),
               "reasons": _text(verdict.get("reasons", verdict.get("reasoning", verdict.get("reason", verdict.get("rationale", verdict.get("explanation", "")))))),
               "cited_claim_ids": _ids(verdict.get("cited_claim_ids", verdict.get("claim_ids", []))),
               "cited_evidence_ids": _ids(verdict.get("cited_evidence_ids", verdict.get("evidence_ids", verdict.get("citations", [])))),
               "bruin_receipt_id": packet["bruin"]["receipt_id"], "created_at": _now()}
        snapshot_dir = directory / "snapshots" / snapshot_id
        _write(snapshot_dir / "verdicts.json", [row])
        binary = self._binary()
        if not binary:
            return {"run_id": run_id, "status": "unavailable", "issues": ["Bruin CLI is unavailable."]}
        result = self._command([binary, "run", "--config-file", str(directory / ".bruin.yml"),
                                "--no-color", "--workers", "1", "--timeout", "45",
                                str(snapshot_dir / "pipeline" / "assets" / "verdicts.sql")], directory, timeout=55)
        _write(snapshot_dir / "bruin-verdict-run.json", result)
        status = "passed" if result["exit_code"] == 0 else "blocked"
        final = {"run_id": run_id, "snapshot_id": snapshot_id, "status": status,
                 "verdict": row, "bruin": {"status": status, "exit_code": result["exit_code"],
                 "log_path": str(snapshot_dir / "bruin-verdict-run.json")},
                 "issues": [] if status == "passed" else ["Bruin rejected the verdict references or snapshot."]}
        _write(directory / "verdict.json", final)
        return final


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Exercise the real local Bruin evidence gate")
    parser.add_argument("--variant", choices=("baseline", "authorization"), default="baseline")
    parser.add_argument("--bad-citation", action="store_true")
    parser.add_argument("--run-id", default="verification-" + uuid.uuid4().hex[:8])
    args = parser.parse_args()
    store = EvidenceStore(Path(__file__).resolve().parent)
    case = store.load_case(args.variant)
    claims = [{"id": "C-ACCESS", "actor": "prosecutor", "kind": "factual", "scope": "case_fact",
               "text": "The platform made 2.1 million requests; access alone does not establish permission.",
               "evidence_ids": ["EX-NOT-FOUND" if args.bad_citation else "EX-ACCESS"]}]
    packet = store.prepare(args.run_id, args.variant, case["exhibits"], claims,
                           [{"actor": "prosecutor", "kind": "submit_claim", "target_id": "C-ACCESS"}])
    print(json.dumps({k: packet[k] for k in ("run_id", "snapshot_id", "status", "judge_allowed", "issues", "bruin")}, indent=2))
