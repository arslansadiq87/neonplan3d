"""Exercise the same signed-payload verifier used by fp3dpack.py and Home Assistant imports."""

from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import fp3dpack  # noqa: E402


def main() -> None:
    pack_path = Path(sys.argv[1])
    text = pack_path.read_text(encoding="utf-8")
    payload = fp3dpack.packs.verify_pack(text)
    assert payload["id"].startswith("studio."), "TechPanda key must remain furniture-only"

    changed = json.loads(text)
    changed["payload"]["name"] += " changed"
    try:
        fp3dpack.packs.verify_pack(json.dumps(changed))
    except fp3dpack.packs.PackError as err:
        assert err.code == "bad_signature", err.code
    else:
        raise AssertionError("Modified payload was accepted")
    print("PASS: valid custom pack accepted; modified payload rejected as bad_signature.")


if __name__ == "__main__":
    main()
