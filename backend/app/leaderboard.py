"""Local, reproducible comparison of teams on the same dataset/ruleset."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .data_loader import RULES

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "cache" / "leaderboard.sqlite"


def _connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("""CREATE TABLE IF NOT EXISTS entries (
        team_name TEXT NOT NULL,
        ruleset TEXT NOT NULL,
        data_version TEXT NOT NULL,
        score REAL NOT NULL,
        delta REAL NOT NULL,
        cost INTEGER NOT NULL,
        critical_count INTEGER NOT NULL,
        decisions TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (team_name, ruleset, data_version)
    )""")
    return connection


def save(team_name: str, ruleset: str, decisions: list[dict], result: dict, cost: int) -> dict:
    name = " ".join(team_name.split())
    if not name or any(ord(char) < 32 for char in name):
        raise ValueError("Название команды не может быть пустым или содержать управляющие символы.")
    if len(name) > 40:
        raise ValueError("Название команды должно быть не длиннее 40 символов.")
    decisions = sorted(decisions, key=lambda item: int(item["measureId"][1:]))
    with _connect() as conn:
        conn.execute("""INSERT INTO entries(team_name,ruleset,data_version,score,delta,cost,critical_count,decisions)
            VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(team_name,ruleset,data_version) DO UPDATE SET
            score=excluded.score,delta=excluded.delta,cost=excluded.cost,
            critical_count=excluded.critical_count,decisions=excluded.decisions,updated_at=CURRENT_TIMESTAMP
            WHERE entries.decisions != excluded.decisions OR entries.score != excluded.score""",
            (name, ruleset, RULES["dataVersion"], result["score"], result["delta"], cost, result["criticalCount"], json.dumps(decisions, ensure_ascii=False)))
        updated_at = conn.execute("SELECT updated_at FROM entries WHERE team_name=? AND ruleset=? AND data_version=?", (name, ruleset, RULES["dataVersion"])).fetchone()[0]
    return {"teamName": name, "score": result["score"], "delta": result["delta"], "cost": cost, "criticalCount": result["criticalCount"], "decisions": decisions, "ruleset": ruleset, "updatedAt": updated_at.replace(" ", "T") + "Z"}


def list_entries(ruleset: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("""SELECT team_name,score,delta,cost,critical_count,decisions,updated_at
            FROM entries WHERE ruleset=? AND data_version=?
            ORDER BY score DESC, cost ASC, team_name ASC LIMIT 50""", (ruleset, RULES["dataVersion"])).fetchall()
    return [{"rank": index, "teamName": row["team_name"], "score": row["score"], "delta": row["delta"], "cost": row["cost"], "criticalCount": row["critical_count"], "decisions": json.loads(row["decisions"]), "updatedAt": row["updated_at"].replace(" ", "T") + "Z"} for index, row in enumerate(rows, 1)]
