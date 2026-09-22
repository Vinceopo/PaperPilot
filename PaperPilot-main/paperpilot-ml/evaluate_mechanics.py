from __future__ import annotations

import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix, f1_score

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from train.mechanics_loader import MODEL_PATH, load_mechanics_splits


def evaluate() -> None:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"{MODEL_PATH.name} not found. Train the mechanics model first.")
    model = joblib.load(MODEL_PATH)
    test_df = load_mechanics_splits()["test"]
    y_true = test_df["rule_type"]
    y_pred = model.predict(test_df["source_text"])
    labels = list(model.classes_)
    print("\n=== Mechanics rule-type classifier ===")
    print(classification_report(y_true, y_pred, labels=labels, digits=4, zero_division=0))
    print("Confusion matrix:")
    print(pd.DataFrame(confusion_matrix(y_true, y_pred, labels=labels), index=labels, columns=labels))
    print(f"Macro F1: {f1_score(y_true, y_pred, average='macro', zero_division=0):.4f}")


if __name__ == "__main__":
    evaluate()
