"""Explicit citation fault injection against the real Bruin evidence gate.

This is an integration test, not a hearing, a model hallucination, or a verdict.
No model, Telem, BAND or other remote API is called by this module. The already
installed local Bruin CLI runs twice; every result retains its actual receipt.
"""
import copy
import json
from pathlib import Path
import uuid

from evidence_store import EvidenceStore


def _summary(packet):
    return {key: copy.deepcopy(packet.get(key))
            for key in ("status", "snapshot_id", "checks", "issues", "bruin")}


def run_integrity_demo(root):
    """Return an honest blocked -> repaired result, or the actual failure state.

    Runtime logs and both immutable input snapshots remain under
    root/runtime/runs/<run_id>/. Missing CLI/driver access is reported as
    unavailable by EvidenceStore, never converted into a synthetic PASS.
    """
    root = Path(root).resolve()
    run_id = "citation-test-" + uuid.uuid4().hex[:12]
    store = EvidenceStore(root)
    case = store.load_case("baseline")
    original_claim = {
        "id": "C-CITATION-TEST", "actor": "prosecutor", "round": 1,
        "kind": "factual", "scope": "case_fact", "status": "submitted",
        "text": "The stipulated log records 2.1 million requests from a SkillVault-controlled service account.",
        "evidence_ids": ["EX-MISSING"],
    }
    corrected_claim = copy.deepcopy(original_claim)
    corrected_claim["evidence_ids"] = ["EX-ACCESS"]
    injection = {
        "id": "A-INJECT-CITATION-FAULT", "actor": "system", "seq": 1,
        "kind": "explicit_test_fault_injection", "target_id": original_claim["id"],
        "reason": "This test deliberately references EX-MISSING to demonstrate the real missing-citation check. No model produced this error.",
        "test_type": "citation_test", "mode": "explicit_integrity_test",
    }
    failed_packet = store.prepare(run_id, "baseline", case["exhibits"],
                                  [original_claim], [injection])
    repair = {
        "id": "A-REPAIR-CITATION", "actor": "system", "seq": 2,
        "kind": "explicit_test_citation_repair", "target_id": corrected_claim["id"],
        "reason": "The test controller replaces EX-MISSING with existing stipulated exhibit EX-ACCESS and requests a new Bruin snapshot. No model decision is claimed.",
        "test_type": "citation_test", "mode": "explicit_integrity_test",
    }
    repaired_packet = store.prepare(run_id, "baseline", case["exhibits"],
                                    [corrected_claim], [injection, repair])
    failed = _summary(failed_packet)
    repaired = _summary(repaired_packet)
    failed_receipt = failed.get("bruin") or {}
    repaired_receipt = repaired.get("bruin") or {}
    success = bool(
        failed["status"] == "blocked"
        and failed_receipt.get("exit_code") not in (None, 0)
        and repaired["status"] == "passed"
        and repaired_receipt.get("exit_code") == 0
        and failed["snapshot_id"] != repaired["snapshot_id"]
        and repaired_packet.get("judge_allowed") is True
    )
    result = {
        "type": "citation_test", "mode": "explicit_integrity_test",
        "run_id": run_id, "success": success,
        "status": "passed" if success else "incomplete",
        "failed": failed, "repaired": repaired,
        "original_claim": original_claim, "corrected_claim": corrected_claim,
        "explanation": (
            "Explicit integrity test: the controller deliberately injects an EX-MISSING citation, "
            "runs the real Bruin pipeline, then changes the citation to EX-ACCESS and runs a new "
            "snapshot. No model is called and this is not presented as a naturally occurring "
            "hallucination. A successful test proves that this citation gate blocks the missing "
            "reference and accepts the corrected reference; it does not prove factual truth or "
            "legal correctness. The statuses and receipts below are the actual process results."
        ),
        "model_called": False,
    }
    directory = root / "runtime" / "runs" / run_id
    directory.mkdir(parents=True, exist_ok=True)
    temporary = directory / "integrity_demo.json.tmp"
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(directory / "integrity_demo.json")
    return result


if __name__ == "__main__":
    result = run_integrity_demo(Path(__file__).resolve().parent)
    print(json.dumps(result, ensure_ascii=False, indent=2))
