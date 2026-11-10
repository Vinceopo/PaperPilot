import csv
from pathlib import Path

p = Path(r"C:\Users\vince\AppData\Local\Temp\pp_final.csv")
with p.open(encoding="utf-8-sig", newline="") as f:
    rows = list(csv.DictReader(f))
print("cols", list(rows[0].keys()))
for i, r in enumerate(rows[:22], start=2):
    g = (r.get("Grok comments") or "").strip()
    issue = (r.get("ISSUE") or "").replace("\n", " ")[:40]
    print(f"{i}: {r.get('STATUS')} | g={bool(g)} | {g[:70]!r} | {issue!r}")
