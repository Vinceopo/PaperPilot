from __future__ import annotations

import sys
from pathlib import Path

import joblib

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from train.data_loader import build_text_pipeline, load_splits

MODEL_PATH = ROOT / "models" / "compliance_classifier_v1.joblib"


def train() -> Path:
    splits = load_splits()
    train_df = splits["train"]
    pipeline = build_text_pipeline()
    pipeline.fit(train_df["citation_text"], train_df["is_format_compliant"])
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    print(
        f"Saved compliance classifier to {MODEL_PATH} "
        f"(train={len(train_df)}, val={len(splits['val'])}, test={len(splits['test'])})"
    )
    return MODEL_PATH


if __name__ == "__main__":
    train()
