from __future__ import annotations

from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "citations_labeled.csv"
REQUIRED_COLUMNS = (
    "citation_text",
    "citation_style",
    "is_format_compliant",
    "issue_description",
)
MIN_ROWS_PER_STYLE = 30
SMART_QUOTES = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u201A": "'",
        "\u201B": "'",
        "\u201C": '"',
        "\u201D": '"',
        "\u201E": '"',
        "\u201F": '"',
    }
)


def clean_text(value: object) -> str:
    text = "" if value is None or (isinstance(value, float) and pd.isna(value)) else str(value)
    text = text.translate(SMART_QUOTES).strip()
    return " ".join(text.split())


def _parse_compliant(value: object) -> int:
    if isinstance(value, bool):
        return int(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "compliant"}:
        return 1
    if text in {"0", "false", "no", "n", "noncompliant", "non-compliant"}:
        return 0
    raise ValueError(
        f"Cannot parse is_format_compliant value {value!r}. Use true/false or 1/0."
    )


def build_text_pipeline() -> Pipeline:
    return Pipeline(
        [
            (
                "features",
                FeatureUnion(
                    [
                        (
                            "word_tfidf",
                            TfidfVectorizer(ngram_range=(1, 3), analyzer="word"),
                        ),
                        (
                            "char_tfidf",
                            TfidfVectorizer(ngram_range=(2, 4), analyzer="char_wb"),
                        ),
                    ]
                ),
            ),
            (
                "clf",
                LogisticRegression(
                    class_weight="balanced",
                    max_iter=1000,
                    random_state=42,
                ),
            ),
        ]
    )


def load_labeled_citations(csv_path: Path | None = None) -> pd.DataFrame:
    path = Path(csv_path) if csv_path is not None else CSV_PATH
    if not path.exists():
        raise FileNotFoundError(
            f"{path.name} is missing. Add labeled data at {path} before training."
        )

    frame = pd.read_csv(path)
    missing = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing:
        raise ValueError(
            "citations_labeled.csv is missing required columns: "
            + ", ".join(missing)
        )

    frame = frame.copy()
    frame["citation_text"] = frame["citation_text"].map(clean_text)
    frame["citation_style"] = frame["citation_style"].map(lambda value: str(value).strip())
    frame["is_format_compliant"] = frame["is_format_compliant"].map(_parse_compliant)
    frame["issue_description"] = frame["issue_description"].fillna("").map(clean_text)
    frame = frame[frame["citation_text"].astype(bool) & frame["citation_style"].astype(bool)]

    counts = frame["citation_style"].value_counts()
    short = counts[counts < MIN_ROWS_PER_STYLE]
    if not short.empty:
        details = ", ".join(f"{style} ({int(n)} rows)" for style, n in short.items())
        raise ValueError(
            "Need at least "
            f"{MIN_ROWS_PER_STYLE} labeled rows per citation_style before training. "
            f"Add more labeled data for: {details}."
        )
    return frame.reset_index(drop=True)


def load_splits(
    csv_path: Path | None = None, random_state: int = 42
) -> dict[str, pd.DataFrame]:
    frame = load_labeled_citations(csv_path)
    train_df, holdout_df = train_test_split(
        frame,
        test_size=0.30,
        stratify=frame["citation_style"],
        random_state=random_state,
    )
    val_df, test_df = train_test_split(
        holdout_df,
        test_size=0.50,
        stratify=holdout_df["citation_style"],
        random_state=random_state,
    )
    return {
        "train": train_df.reset_index(drop=True),
        "val": val_df.reset_index(drop=True),
        "test": test_df.reset_index(drop=True),
    }
