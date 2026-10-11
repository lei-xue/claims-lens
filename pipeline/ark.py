"""Minimal client for the Volcengine Ark (OpenAI-compatible) chat API.

Reads ARK_API_KEY / ARK_BASE_URL from the environment (load them with
`set -a; . /root/.config/ark/ark.env; set +a`). Never log the key.
"""
import contextlib
import fcntl
import json
import os
import random
import re
import sys
import time

import requests

BASE = os.environ["ARK_BASE_URL"].rstrip("/")
KEY = os.environ["ARK_API_KEY"]

KIMI = "kimi-k3"
DEEPSEEK = "deepseek-v4.1-flash"

USAGE = {"prompt": 0, "completion": 0, "calls": 0}

# The Coding Plan caps in-flight requests per model across ALL our processes
# (HTTP 429 InflightBatchsizeExceeded), so callers take a slot via file locks.
SLOTS = {KIMI: 6, DEEPSEEK: 8}
SLOT_DIR = "/tmp/ark-slots"


@contextlib.contextmanager
def slot(model):
    os.makedirs(SLOT_DIR, exist_ok=True)
    n = SLOTS.get(model, 4)
    while True:
        for i in random.sample(range(n), n):
            f = open(f"{SLOT_DIR}/{model}-{i}.lock", "w")
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                f.close()
                continue
            try:
                yield
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
                f.close()
            return
        time.sleep(1 + random.random() * 2)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, file=sys.stderr, flush=True)


def chat(model, messages, max_tokens=16000, temperature=None, timeout=900):
    """Streamed chat call; returns the final answer text (reasoning dropped)."""
    body = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if temperature is not None:
        body["temperature"] = temperature
    for attempt in range(12):
        try:
            with slot(model):
                return _stream(model, body, timeout)
        except ValueError:
            raise
        except Exception as e:  # network / rate limit: back off and retry
            wait = min(120, 10 * (2 ** min(attempt, 4))) + random.random() * 10
            log(f"{model} attempt {attempt + 1} failed: {str(e)[:160]}; retry in {wait:.0f}s")
            time.sleep(wait)
    raise RuntimeError(f"{model}: giving up after retries")


def _stream(model, body, timeout):
    r = requests.post(
        f"{BASE}/chat/completions",
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        json=body, stream=True, timeout=timeout,
    )
    if r.status_code == 429 or r.status_code >= 500:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")
    if r.status_code != 200:
        raise ValueError(f"HTTP {r.status_code}: {r.text[:500]}")
    out = []
    finish, done, rlen = None, False, 0
    # split on b"\n" only: str.splitlines() would also break on U+2028 etc.
    # that can appear inside the JSON payload
    for raw in r.iter_lines():
        line = raw.decode("utf-8")
        if not line or not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if data == "[DONE]":
            done = True
            break
        ev = json.loads(data)
        if ev.get("usage"):
            USAGE["prompt"] += ev["usage"].get("prompt_tokens", 0)
            USAGE["completion"] += ev["usage"].get("completion_tokens", 0)
        for ch in ev.get("choices") or []:
            delta = ch.get("delta") or {}
            if delta.get("content"):
                out.append(delta["content"])
            rlen += len(delta.get("reasoning_content") or "")
            finish = ch.get("finish_reason") or finish
    USAGE["calls"] += 1
    text = "".join(out)
    if finish != "stop":
        log(f"{model} incomplete reply: finish={finish} done={done} "
            f"content={len(text)} reasoning={rlen} chars")
    return text


def extract_json(text):
    """Pull the first JSON object/array out of a model reply."""
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0], default=-1)
    if start < 0:
        raise ValueError("no JSON in reply")
    obj, _ = json.JSONDecoder().raw_decode(text[start:])
    return obj


def chat_json(model, messages, validate=None, tries=3, **kw):
    """chat() + JSON parse + optional validation, re-asking on failure."""
    last = None
    for _ in range(tries):
        text = ""
        try:
            text = chat(model, messages, **kw)
            obj = extract_json(text)
            if validate:
                validate(obj)
            return obj
        except Exception as e:
            last = e
            log(f"{model} bad JSON/validation: {e} | head={text[:120]!r} tail={text[-120:]!r}")
    raise RuntimeError(f"{model}: no valid JSON after {tries} tries: {last}")
