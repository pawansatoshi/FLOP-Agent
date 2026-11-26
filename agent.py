"""Fail-closed readiness gate. No transaction execution."""
import json
from pathlib import Path

def readiness(config):
    required = ("network", "sdk_release", "gateway", "activation_block", "evidence_url")
    missing = [key for key in required if not config.get(key)]
    return {"mode": "monitor-only", "missing": missing,
            "execution_enabled": False, "reason": "Verified execution adapter not implemented"}

if __name__ == "__main__":
    print(json.dumps(readiness(json.loads(Path("network.json").read_text())), indent=2))
