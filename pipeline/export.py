"""Merge reviewed explanation batches into web/public/data/{carc,rarc}.json (safe while explain.py runs)."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
C = ROOT / "content"
KEEP = {
    "carc": ("code", "title", "plain", "category", "groups", "causes", "fix", "owner", "appeal", "kind", "start", "stop"),
    "rarc": ("code", "title", "plain", "category", "action", "alert", "start", "stop"),
}
for kind, keep in KEEP.items():
    official = {c["code"]: c for c in json.loads((C / f"{kind}-official.json").read_text())}
    merged = {}
    for p in sorted((C / "work").glob(f"{kind}-*.json")):
        for x in json.loads(p.read_text()):
            if x.get("code") in official:
                x["start"], x["stop"] = official[x["code"]]["start"], official[x["code"]]["stop"]
                merged[x["code"]] = {k: x.get(k) for k in keep}
    order = list(official)
    rows = sorted(merged.values(), key=lambda x: order.index(x["code"]))
    (ROOT / "web" / "public" / "data" / f"{kind}.json").write_text(json.dumps(rows, separators=(",", ":")))
    print(kind, len(rows), "of", sum(1 for c in official.values() if not c["stop"]), "active")
