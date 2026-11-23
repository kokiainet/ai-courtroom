"""@bruin
name: courtroom.decisions
type: python
image: python:3.12
connection: duckdb-default
materialization:
  type: table
  strategy: create+replace
@bruin"""

import json
import os

import pandas as pd


def _find_decisions_file():
    candidates = [
        "data/decisions.json",
        "../data/decisions.json",
        "../../data/decisions.json",
        "bruin-pipeline/data/decisions.json",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "decisions.json"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    raise FileNotFoundError("decisions.json not found; export it from the courtroom app first")


def materialize():
    path = _find_decisions_file()
    with open(path) as f:
        payload = json.load(f)
    rows = payload["decisions"]
    for r in rows:
        r["verdict"] = payload["verdict"]
        r["seed"] = payload["seed"]
        r["margin"] = payload["margin"]
    return pd.DataFrame(rows)
