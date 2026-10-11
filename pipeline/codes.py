"""Parse the X12 CARC / RARC code-list pages (saved in content/raw/) into JSON.

The official wording is X12's; it stays in content/raw-derived files that are used only as
model input and are not shipped with the app (see .gitignore). The app ships our own
plain-language explanations plus a link to the official list.
"""
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "content" / "raw"


def rows(fn):
    s = (RAW / fn).read_text()
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", s, re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)
        if len(tds) >= 2:
            clean = lambda x: html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", x))).strip()
            yield clean(tds[0]).replace(" ", ""), clean(tds[1])


def parse(fn, code_re):
    out = {}
    for code, text in rows(fn):
        if not re.fullmatch(code_re, code) or "Start:" not in text:
            continue
        m = re.search(r"\s*Start:\s*([\d/]+)(.*)$", text)
        desc = text[: m.start()].strip() if m else text
        tail = m.group(2) if m else ""
        stop = re.search(r"Stop:\s*([\d/]+)", tail)
        usage = None
        if "Usage:" in desc:
            desc, usage = [x.strip() for x in desc.split("Usage:", 1)]
        out[code] = {
            "code": code,
            "description": desc,
            "usage": usage,
            "start": m.group(1) if m else None,
            "stop": stop.group(1) if stop else None,
        }
    return list(out.values())


carc = parse("claim-adjustment-reason-codes.html", r"\d{1,3}|[A-Z]\d{1,2}|[A-Z]")
rarc = parse("remittance-advice-remark-codes.html", r"M\d{1,3}|MA\d{1,3}|N\d{1,4}")
for name, lst in (("carc", carc), ("rarc", rarc)):
    (ROOT / "content" / f"{name}-official.json").write_text(json.dumps(lst, indent=1))
    active = [c for c in lst if not c["stop"]]
    print(name, len(lst), "codes,", len(active), "without a stop date")
