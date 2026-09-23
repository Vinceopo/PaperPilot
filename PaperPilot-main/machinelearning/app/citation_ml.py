from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[2] / "paperpilot-ml"
if str(ML_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_ROOT))

STYLE_MODEL_PATH = ML_ROOT / "models" / "style_classifier_v1.joblib"
COMPLIANCE_MODEL_PATH = ML_ROOT / "models" / "compliance_classifier_v1.joblib"


@lru_cache(maxsize=1)
def _models():
    try:
        import joblib
        from train.data_loader import clean_text
    except Exception:
        return None
    if not STYLE_MODEL_PATH.exists():
        return None
    try:
        style_model = joblib.load(STYLE_MODEL_PATH)
        compliance_model = joblib.load(COMPLIANCE_MODEL_PATH) if COMPLIANCE_MODEL_PATH.exists() else None
    except Exception:
        return None
    return style_model, compliance_model, clean_text


def classify_citation(text: str) -> dict | None:
    packed = _models()
    snippet = (text or "").strip()
    if not packed or len(snippet) < 3:
        return None
    style_model, compliance_model, clean_text = packed
    cleaned = [clean_text(snippet)]
    try:
        predicted_style = style_model.predict(cleaned)[0]
        style = str(predicted_style).upper()
        probabilities = style_model.predict_proba(cleaned)[0]
        style_confidence = float(probabilities[list(style_model.classes_).index(predicted_style)])
    except Exception:
        return None
    compliant = None
    compliance_confidence = 0.0
    if compliance_model is not None:
        try:
            predicted = compliance_model.predict(cleaned)[0]
            compliant = bool(int(predicted))
            probs = compliance_model.predict_proba(cleaned)[0]
            compliance_confidence = float(probs[list(compliance_model.classes_).index(predicted)])
        except Exception:
            compliant = None
    return {
        "citation_style": style,
        "style_confidence": style_confidence,
        "is_format_compliant": compliant,
        "compliance_confidence": compliance_confidence,
    }
