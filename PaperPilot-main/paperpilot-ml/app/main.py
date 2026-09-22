from __future__ import annotations

import sys
from pathlib import Path

import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from train.data_loader import clean_text

STYLE_MODEL_PATH = ROOT / "models" / "style_classifier_v1.joblib"
COMPLIANCE_MODEL_PATH = ROOT / "models" / "compliance_classifier_v1.joblib"

app = FastAPI(title="PaperPilot Citation ML", version="1.0.0")
style_model = None
compliance_model = None


class ClassifyRequest(BaseModel):
    citations: list[str] = Field(default_factory=list)


class ClassifyItem(BaseModel):
    citation_text: str
    citation_style: str
    is_format_compliant: bool
    confidence: float
    issue_description: str


def _load_model(path: Path):
    if not path.exists():
        raise FileNotFoundError(
            f"{path.name} not found. Train both classifiers before starting the API."
        )
    return joblib.load(path)


@app.on_event("startup")
def load_models() -> None:
    global style_model, compliance_model
    style_model = _load_model(STYLE_MODEL_PATH)
    compliance_model = _load_model(COMPLIANCE_MODEL_PATH)


def _predict_one(citation: str) -> ClassifyItem:
    text = clean_text(citation)
    texts = [text]
    style = str(style_model.predict(texts)[0])
    style_proba = style_model.predict_proba(texts)[0]
    style_confidence = float(style_proba[list(style_model.classes_).index(style)])
    compliant_raw = compliance_model.predict(texts)[0]
    is_compliant = bool(int(compliant_raw))
    issue = (
        ""
        if is_compliant
        else f"Formatting does not match expected {style} pattern"
    )
    return ClassifyItem(
        citation_text=text,
        citation_style=style,
        is_format_compliant=is_compliant,
        confidence=style_confidence,
        issue_description=issue,
    )


@app.post("/classify-citations", response_model=list[ClassifyItem])
def classify_citations(body: ClassifyRequest) -> list[ClassifyItem]:
    if style_model is None or compliance_model is None:
        raise HTTPException(status_code=503, detail="Models are not loaded.")
    return [_predict_one(citation) for citation in body.citations]
