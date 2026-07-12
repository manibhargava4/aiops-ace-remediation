"""ace-sim: simulated IBM ACE integration server.

Mimics a message flow (HTTP In -> Compute(TRANSFORM_ORDER) -> HTTP Reply).
In BUG_MODE the ESQL-equivalent transform has the classic hung-thread bug:
a poison message (missing AccountId) sends the worker into a busy-wait
retry loop that never exits -> one core pegged, thread never recovers.
The fixed variant validates input and routes poison messages to the DLQ.

The 'source code' the AI triage service diagnoses lives in flows/*.esql.
"""

import logging
import os
import queue
import random
import threading
import time

from fastapi import FastAPI
from prometheus_client import Counter, Gauge, make_asgi_app

BUG_MODE = os.environ.get("BUG_MODE", "true").lower() == "true"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] ACE.server1.ORDER_FLOW %(message)s",
)
log = logging.getLogger("ace-sim")

MSG_PROCESSED = Counter("ace_messages_processed_total", "Messages processed")
MSG_FAILED = Counter("ace_messages_failed_total", "Messages routed to DLQ")
THREADS_HUNG = Gauge("ace_threads_hung", "Worker threads stuck in a loop")

app = FastAPI(title="ace-sim")
app.mount("/metrics", make_asgi_app())

_inbox: "queue.Queue[dict]" = queue.Queue()


def _generate_traffic():
    """Simulates upstream systems posting order messages to the flow."""
    seq = 0
    while True:
        seq += 1
        msg = {"OrderId": f"ORD-{seq:05d}", "AccountId": f"ACC-{random.randint(1, 999):03d}", "Amount": round(random.uniform(10, 500), 2)}
        # ponytail: deterministic poison after warm-up so the demo always reproduces
        if seq % 8 == 0:
            msg["AccountId"] = None  # poison message from upstream CRM feed
        _inbox.put(msg)
        time.sleep(2)


def transform_buggy(msg: dict) -> dict:
    """Mirrors flows/TRANSFORM_ORDER_buggy.esql — WHILE retry with no exit path."""
    attempts = 0
    while msg.get("AccountId") is None:
        # BUG: malformed input never becomes valid; no attempt cap, no DLQ route.
        attempts += 1
        if attempts % 5_000_000 == 0:
            log.error(
                "BIP2232E: Error detected whilst handling message in node "
                "'ORDER_FLOW.TRANSFORM_ORDER'. AccountId is NULL, retrying parse "
                "(attempt %d) OrderId=%s", attempts, msg["OrderId"],
            )
    return {**msg, "Status": "ENRICHED"}


def transform_fixed(msg: dict) -> dict | None:
    """Mirrors flows/TRANSFORM_ORDER_fixed.esql — validate, DLQ on poison."""
    if msg.get("AccountId") is None:
        MSG_FAILED.inc()
        log.warning(
            "BIP2231W: Message OrderId=%s failed validation (AccountId NULL); "
            "routed to DLQ ORDER.FLOW.DLQ", msg["OrderId"],
        )
        return None
    return {**msg, "Status": "ENRICHED"}


def _worker():
    transform = transform_buggy if BUG_MODE else transform_fixed
    log.info("Integration server started. Flow=ORDER_FLOW transform=%s", transform.__name__)
    while True:
        msg = _inbox.get()
        log.info("Processing message OrderId=%s AccountId=%s", msg["OrderId"], msg["AccountId"])
        if BUG_MODE and msg.get("AccountId") is None:
            THREADS_HUNG.set(1)  # set before entering the loop we never leave
        result = transform(msg)
        if result is not None:
            MSG_PROCESSED.inc()
            log.info("Message OrderId=%s transformed OK", msg["OrderId"])


@app.get("/health")
def health():
    return {"status": "ok", "bug_mode": BUG_MODE, "threads_hung": THREADS_HUNG._value.get()}


threading.Thread(target=_generate_traffic, daemon=True).start()
threading.Thread(target=_worker, daemon=True).start()


if __name__ == "__main__":
    # self-check: fixed transform must survive the poison message
    assert transform_fixed({"OrderId": "T1", "AccountId": None}) is None
    assert transform_fixed({"OrderId": "T2", "AccountId": "ACC-1"})["Status"] == "ENRICHED"
    print("self-check OK")
