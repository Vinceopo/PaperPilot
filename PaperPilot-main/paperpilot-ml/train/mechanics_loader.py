from __future__ import annotations

from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

from train.data_loader import build_text_pipeline, clean_text

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "format_mechanics_labeled.csv"
MODEL_PATH = ROOT / "models" / "mechanics_type_classifier_v1.joblib"
REQUIRED_COLUMNS = ("source_text", "rule_type", "rule_value")


def load_labeled_mechanics(csv_path: Path | None = None) -> pd.DataFrame:
    path = Path(csv_path) if csv_path is not None else CSV_PATH
    if not path.exists():
        raise FileNotFoundError(
            f"{path.name} is missing. Add labeled data at {path} before training."
        )
    frame = pd.read_csv(path)
    missing = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing:
        raise ValueError(
            "format_mechanics_labeled.csv is missing required columns: " + ", ".join(missing)
        )
    frame = frame.copy()
    frame["source_text"] = frame["source_text"].map(clean_text)
    frame["rule_type"] = frame["rule_type"].map(lambda value: str(value).strip())
    frame["rule_value"] = frame["rule_value"].fillna("").map(clean_text)
    frame = frame[frame["source_text"].astype(bool) & frame["rule_type"].astype(bool)]
    if len(frame) < 20:
        raise ValueError(
            "Need at least 20 labeled format-mechanics rows before training. "
            f"The current file has {len(frame)}."
        )
    return frame.reset_index(drop=True)


def load_mechanics_splits(
    csv_path: Path | None = None, random_state: int = 42
) -> dict[str, pd.DataFrame]:
    frame = load_labeled_mechanics(csv_path)
    counts = frame["rule_type"].value_counts()
    stratify = frame["rule_type"] if counts.min() >= 2 else None
    train_df, test_df = train_test_split(
        frame,
        test_size=0.20,
        stratify=stratify,
        random_state=random_state,
    )
    return {
        "train": train_df.reset_index(drop=True),
        "test": test_df.reset_index(drop=True),
    }


def build_mechanics_pipeline():
    return build_text_pipeline()
