"""Verify additive custom publisher registration against the untouched upstream tag."""

from __future__ import annotations

import ast
import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT / "custom_components" / "neonplan3d" / "packs.py"
CUSTOM_ID = "4d62b4e84557"
CUSTOM_KEY = "SW+iDO2xxCCarJmxHtierq9KVXwhSNxqYf4mygAKWj8="


def assignments(source: str) -> dict[str, ast.expr]:
    tree = ast.parse(source)
    result: dict[str, ast.expr] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            result[node.targets[0].id] = node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
            result[node.target.id] = node.value
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--upstream-tag", default="v4.0.2")
    args = parser.parse_args()
    upstream = subprocess.check_output(
        ["git", "show", f"{args.upstream_tag}:custom_components/neonplan3d/packs.py"], cwd=ROOT, text=True
    )
    baseline = assignments(upstream)
    current = assignments(PACKS.read_text(encoding="utf-8"))
    official = ast.literal_eval(baseline["PACK_PUBLIC_KEYS"])
    registered = ast.literal_eval(current["PACK_PUBLIC_KEYS"])
    for key_id, value in official.items():
        if registered.get(key_id) != value:
            raise SystemExit(f"Official publisher key changed or removed: {key_id}")
    if registered.get(CUSTOM_ID) != CUSTOM_KEY:
        raise SystemExit("TechPanda key is missing or changed")
    official_studio = set(ast.literal_eval(baseline["STUDIO_KEYS"]))
    studio = set(ast.literal_eval(current["STUDIO_KEYS"]))
    if not official_studio.issubset(studio) or CUSTOM_ID not in studio:
        raise SystemExit("Studio key restrictions changed or TechPanda is not furniture-only")
    print(f"Registry OK against {args.upstream_tag}: {len(official)} upstream keys unchanged; TechPanda key is furniture-only.")


if __name__ == "__main__":
    main()
