from __future__ import annotations

import argparse
import sys
from pathlib import Path

import joblib

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from train.data_loader import clean_text

STYLE_MODEL_PATH = ROOT / "models" / "style_classifier_v1.joblib"
COMPLIANCE_MODEL_PATH = ROOT / "models" / "compliance_classifier_v1.joblib"


def _load_model(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"{path.name} not found. Train the model before predicting.")
    return joblib.load(path)


def _confidence(model, texts) -> tuple[object, float]:
    predicted = model.predict(texts)[0]
    probabilities = model.predict_proba(texts)[0]
    class_index = list(model.classes_).index(predicted)
    return predicted, float(probabilities[class_index])


def predict_citation(citation: str) -> dict:
    style_model = _load_model(STYLE_MODEL_PATH)
    compliance_model = _load_model(COMPLIANCE_MODEL_PATH)
    texts = [clean_text(citation)]
    style, style_confidence = _confidence(style_model, texts)
    compliant, compliance_confidence = _confidence(compliance_model, texts)
    return {
        "citation_style": str(style),
        "style_confidence": style_confidence,
        "is_format_compliant": bool(int(compliant)),
        "compliance_confidence": compliance_confidence,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Classify a citation with PaperPilot ML models.")
    parser.add_argument("citation", help="Citation string to classify")
    args = parser.parse_args()
    result = predict_citation(args.citation)
    print(f"predicted style: {result['citation_style']}")
    print(f"style confidence: {result['style_confidence']:.4f}")
    print(f"is_format_compliant: {result['is_format_compliant']}")
    print(f"compliance confidence: {result['compliance_confidence']:.4f}")


if __name__ == "__main__":
    main()
