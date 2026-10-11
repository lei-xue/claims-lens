"""DeepSeek writes plain-language explanations for every active CARC and RARC;
Kimi reviews each batch against the official wording and corrects mistakes.

Output: content/carc.json, content/rarc.json (our own text; no official wording)
"""
import datetime
import json
import pathlib
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

from ark import DEEPSEEK, KIMI, USAGE, chat_json, log

ROOT = pathlib.Path(__file__).resolve().parent.parent
C = ROOT / "content"
WORK = C / "work"
WORK.mkdir(exist_ok=True)
LOCK = threading.Lock()
TODAY = datetime.date.today()

CATEGORIES = [
    "patient-responsibility", "contractual", "missing-info", "coding", "eligibility",
    "authorization", "coverage", "medical-necessity", "timely-filing", "duplicate",
    "coordination-of-benefits", "bundling", "pricing", "provider", "regulatory", "other",
]

SYSTEM = """You are a senior US medical billing and revenue-cycle specialist. You explain X12 claim
adjustment reason codes (CARC) and remittance advice remark codes (RARC) to billing staff and
patients in plain English. Be accurate to the official definition you are given; do not invent
payer-specific rules. Write your own words — do not copy the official sentence.
Output ONLY JSON."""

CARC_SHAPE = """{"codes": [{
  "code": "16",
  "title": "<3-7 word plain-English name, e.g. 'Missing or invalid claim information'>",
  "plain": "<1-2 sentences: what it means, in plain English>",
  "category": "<one of: %s>",
  "groups": ["CO"],                     // group codes it is most often paired with (CO, PR, OA, PI)
  "causes": ["<typical cause>", "..."],  // 2-4
  "fix": ["<concrete next step>", "..."],// 2-4, ordered
  "owner": "<front desk | coding | billing | clinical | patient | payer>",
  "appeal": "<usually | sometimes | rarely | n/a>",
  "kind": "<denial | reduction | patient-share | informational>"
}]}""" % ", ".join(CATEGORIES)

RARC_SHAPE = """{"codes": [{
  "code": "N290",
  "title": "<3-7 word plain-English name>",
  "plain": "<1-2 sentences in plain English>",
  "category": "<one of: %s>",
  "action": "<one short sentence: what the provider should do, or 'No action — informational.'>",
  "alert": true|false                    // true if the official text starts with 'Alert:'
}]}""" % ", ".join(CATEGORIES)

REVIEW_SYS = """You are auditing plain-language explanations of X12 CARC/RARC codes for accuracy.
For each code compare the explanation with the official definition. Fix anything that is wrong,
misleading, too vague to act on, or copies the official sentence verbatim. Keep the same JSON
fields. Output ONLY JSON: {"codes": [ <every entry, corrected or unchanged> ], "changed": ["<codes you changed>"]}"""


def active(c):
    if not c["stop"]:
        return True
    m, d, y = map(int, c["stop"].split("/"))
    return datetime.date(y, m, d) > TODAY


def official_text(c):
    return f'{c["code"]}: {c["description"]}' + (f' (Usage: {c["usage"]})' if c.get("usage") else "")


def need(cond, msg):
    if not cond:
        raise AssertionError(msg)


def run_batch(kind, batch, idx):
    out_p = WORK / f"{kind}-{idx:03d}.json"
    if out_p.exists():
        return
    shape = CARC_SHAPE if kind == "carc" else RARC_SHAPE
    codes = {c["code"] for c in batch}
    check = lambda o: need({x["code"] for x in o["codes"]} >= codes, "missing codes")
    listing = "\n".join(official_text(c) for c in batch)
    draft = chat_json(DEEPSEEK, [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"Official {kind.upper()} definitions:\n{listing}\n\nExplain every code. Return:\n{shape}"},
    ], validate=check, max_tokens=16000, temperature=0.4)
    reviewed = chat_json(KIMI, [
        {"role": "system", "content": REVIEW_SYS},
        {"role": "user", "content": f"Official definitions:\n{listing}\n\nExplanations to audit:\n"
                                    + json.dumps(draft["codes"], indent=0)},
    ], validate=check, max_tokens=32000)
    changed = set(reviewed.get("changed") or [])
    for x in reviewed["codes"]:
        x["reviewed"] = "changed" if x["code"] in changed else "ok"
    out_p.write_text(json.dumps(reviewed["codes"], indent=1))
    log(f"{kind} batch {idx}: {len(batch)} codes, kimi changed {len(reviewed.get('changed') or [])}")


def main():
    kinds = sys.argv[1:] or ["carc", "rarc"]
    jobs = []
    for kind in kinds:
        lst = [c for c in json.loads((C / f"{kind}-official.json").read_text()) if active(c)]
        size = 10 if kind == "carc" else 15
        jobs += [(kind, lst[i:i + size], i // size) for i in range(0, len(lst), size)]
    log("batches", len(jobs))
    with ThreadPoolExecutor(6) as ex:
        for f in [ex.submit(run_batch, *j) for j in jobs]:
            try:
                f.result()
            except Exception as e:
                log("batch FAILED", e)
    for kind in kinds:
        official = {c["code"]: c for c in json.loads((C / f"{kind}-official.json").read_text())}
        merged = {}
        for p in sorted(WORK.glob(f"{kind}-*.json")):
            for x in json.loads(p.read_text()):
                if x["code"] in official:
                    x["start"] = official[x["code"]]["start"]
                    x["stop"] = official[x["code"]]["stop"]
                    merged[x["code"]] = x
        (C / f"{kind}.json").write_text(json.dumps(list(merged.values()), indent=1))
        log(f"{kind}: {len(merged)} explained")
    log("usage", USAGE)


if __name__ == "__main__":
    main()
