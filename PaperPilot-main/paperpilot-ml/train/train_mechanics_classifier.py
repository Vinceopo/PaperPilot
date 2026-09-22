from __future__ import annotations

import sys
from pathlib import Path

import joblib

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from train.mechanics_loader import (
    MODEL_PATH,
    build_mechanics_pipeline,
    load_mechanics_splits,
)


def train() -> Path:
    splits = load_mechanics_splits()
    train_df = splits["train"]
    pipeline = build_mechanics_pipeline()
    pipeline.fit(train_df["source_text"], train_df["rule_type"])
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    print(
        f"Saved mechanics type classifier to {MODEL_PATH} "
        f"(train={len(train_df)}, test={len(splits['test'])}, "
        f"classes={len(pipeline.classes_)})"
    )
    return MODEL_PATH


if __name__ == "__main__":
    train()
