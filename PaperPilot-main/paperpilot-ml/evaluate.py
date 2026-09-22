from __future__ import annotations

import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix, f1_score

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from train.data_loader import load_splits

STYLE_MODEL_PATH = ROOT / "models" / "style_classifier_v1.joblib"
COMPLIANCE_MODEL_PATH = ROOT / "models" / "compliance_classifier_v1.joblib"


def _require_model(path: Path) -> object:
    if not path.exists():
        raise FileNotFoundError(f"{path.name} not found. Train the model before evaluating.")
    return joblib.load(path)


def _report(title: str, y_true, y_pred, labels=None) -> float:
    print(f"\n=== {title} ===")
    print(classification_report(y_true, y_pred, digits=4, zero_division=0))
    matrix = confusion_matrix(y_true, y_pred, labels=labels)
    index = labels if labels is not None else sorted(set(y_true) | set(y_pred))
    print("Confusion matrix:")
    print(pd.DataFrame(matrix, index=index, columns=index))
    macro_f1 = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
    print(f"Macro F1: {macro_f1:.4f}")
    return macro_f1


def evaluate() -> None:
    style_model = _require_model(STYLE_MODEL_PATH)
    compliance_model = _require_model(COMPLIANCE_MODEL_PATH)
    test_df = load_splits()["test"]
    texts = test_df["citation_text"]

    style_true = test_df["citation_style"]
    style_pred = style_model.predict(texts)
    style_labels = list(style_model.classes_)
    style_f1 = _report("Style classifier", style_true, style_pred, labels=style_labels)

    compliance_true = test_df["is_format_compliant"]
    compliance_pred = compliance_model.predict(texts)
    compliance_labels = list(compliance_model.classes_)
    compliance_f1 = _report(
        "Compliance classifier",
        compliance_true,
        compliance_pred,
        labels=compliance_labels,
    )

    print("\n=== Overall ===")
    print(f"Style classifier macro F1: {style_f1:.4f}")
    print(f"Compliance classifier macro F1: {compliance_f1:.4f}")


if __name__ == "__main__":
    evaluate()
