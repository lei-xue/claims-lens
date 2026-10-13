# Claims Lens: details

## Code map

| Path | What |
| --- | --- |
| `web/src/lib/x12.ts`, `interpret.ts` | X12 tokenizer (delimiters from ISA), 835/837P models, balancing checks — shared by browser and server |
| `web/server/services/imports.ts` | 835/837 import, claim matching, denial creation and auto-resolution |
| `web/server/services/workflow.ts` | Status machine, corrected 837P, appeal letters |
| `web/server/seed.ts` | ~200 days of fictional claims sent through the real import path |
| `web/tests/api.test.ts` | End-to-end API tests |
| `pipeline/` | Content build for the plain-language CARC/RARC explanations |

## Content

CARC/RARC numbers and status come from the published [X12 code lists](https://x12.org/codes). The explanations are this project's own text: drafted by DeepSeek and audited batch-by-batch by Kimi against the official definitions (`pipeline/explain.py`). The official wording is not redistributed (`content/raw/` is git-ignored); each code links to X12. CPT descriptors are AMA-copyrighted, so procedures carry short labels written for the demo. ICD-10-CM descriptions are public domain.

## Deploy

`deploy/docker-compose.yml` runs the app image and Postgres on the shared tunnel network; `deploy/update.sh` rebuilds, `deploy/reset-demo.sh` (nightly cron) reseeds the demo.

Rebuild the code explanations (needs an OpenAI-compatible Ark key in the environment):

```bash
python3 pipeline/codes.py && python3 pipeline/explain.py && python3 pipeline/export.py
```
