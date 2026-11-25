"""Generate Downloads/B-end & AI Process.pdf - PaperPilot backend & AI pipeline explainer."""
from __future__ import annotations

from pathlib import Path

from fpdf import FPDF

OUT = Path.home() / "Downloads" / "B-end & AI Process.pdf"


class Doc(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "PaperPilot  |  B-end & AI Process", align="L")
        self.ln(12)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def h2(self, text: str) -> None:
        self.ln(3)
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(30, 70, 120)
        self.multi_cell(0, 8, text)
        self.ln(1)

    def h3(self, text: str) -> None:
        self.ln(2)
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 7, text)
        self.ln(0.5)

    def body(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(35, 35, 35)
        self.multi_cell(0, 5.5, text)
        self.ln(1.5)

    def bullet(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(35, 35, 35)
        self.cell(6, 5.5, "-")
        self.multi_cell(self.epw - 6, 5.5, text)
        self.set_x(self.l_margin)
        self.ln(0.5)

    def step(self, num: int, title: str, detail: str) -> None:
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(20, 40, 70)
        self.multi_cell(0, 6, f"{num}.  {title}")
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(35, 35, 35)
        self.multi_cell(0, 5.5, detail)
        self.ln(2)

    def callout(self, text: str) -> None:
        self.ln(1)
        self.set_fill_color(235, 242, 250)
        self.set_draw_color(30, 70, 120)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(20, 40, 70)
        self.set_x(self.l_margin)
        self.multi_cell(self.epw, 6, "  " + text, border=1, fill=True)
        self.set_x(self.l_margin)
        self.ln(2)

    def ensure_left(self) -> None:
        self.set_x(self.l_margin)


def build() -> Path:
    pdf = Doc(orientation="P", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_margins(18, 18, 18)

    # Cover block
    pdf.set_fill_color(20, 40, 70)
    pdf.rect(0, 0, 210, 52, style="F")
    pdf.set_xy(18, 16)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(255, 255, 255)
    pdf.multi_cell(0, 10, "B-end & AI Process")
    pdf.set_x(18)
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(0, 6, "How PaperPilot turns a manuscript into Scan Results")
    pdf.set_y(58)

    pdf.callout(
        "One-line summary: Rules find and score problems; ML helpers assist on the side; "
        "Gemini explains findings more clearly - without changing the score."
    )

    pdf.h2("1. What goes in (input)")
    pdf.body(
        "When you press Analyse, the client sends authenticated requests to the PaperPilot API "
        "(FastAPI). The main scan input is:"
    )
    pdf.bullet("Manuscript file - PDF or DOCX, stored in S3 after a presigned upload.")
    pdf.bullet(
        "Format Mechanics - your confirmed style rules (fonts, margins, spacing, indentation, "
        "alignment, page numbers, captions, citation style, and related fields)."
    )
    pdf.bullet("User plan/tier - Free, Premium, or Pro (limits detail depth and upload size).")
    pdf.bullet("Firebase ID token - proves who is running the scan.")

    pdf.h2("2. Backend services involved")
    pdf.body(
        "PaperPilot uses a split backend so large files can be analysed with live progress:"
    )
    pdf.bullet(
        "API gateway (api/) - auth, manuscripts, mechanics, billing, and scan orchestration. "
        "Endpoint: POST /manuscripts/{id}/versions/{id}/scan."
    )
    pdf.bullet(
        "ML analyze service (machinelearning/) - background worker on Render. "
        "Endpoints: POST /v1/analyze, GET .../progress, GET .../result."
    )
    pdf.bullet(
        "Gemini (Google Generative AI, model gemini-2.0-flash by default) - optional wording "
        "and severity polish after rules run; also used by the lighter POST /analyze text helper."
    )
    pdf.bullet(
        "Local ML extractors (mechanics_ml) - optional helpers when reading a style guide or "
        "boosting citation confidence. They do not set the overall score."
    )

    pdf.h2("3. End-to-end flow (Analyse button)")
    pdf.step(
        1,
        "Eligibility & rules check",
        "The API checks your subscription scan allowance and that Format Mechanics rules are "
        "ready (IGNORE fields are omitted; remaining rules must be complete).",
    )
    pdf.step(
        2,
        "Fetch the document",
        "The gateway downloads the saved manuscript bytes from S3 (or falls back to the "
        "version's stored URL). For the ML path it base64-encodes the file and creates an "
        "analyze job.",
    )
    pdf.step(
        3,
        "Queue or run in-process",
        "If the ML service is configured, a pending scan is created and the job runs in a "
        "background thread. If ML is down or returns a server error, the API runs the same "
        "compliance checklist in-process so analysis still completes.",
    )
    pdf.step(
        4,
        "Parse the document",
        "validate_document checks type and size limits (Free ~15 MB, Premium ~45 MB, "
        "Pro ~120 MB). parse_document turns PDF/DOCX into structured pages, lines, "
        "paragraphs, fonts, margins, and other measurements - often in page chunks for large files.",
    )
    pdf.step(
        5,
        "Build formatting units & roles",
        "The rule engine converts the parsed structure into many small 'units' (spots that "
        "can pass or fail), then labels roles such as body text, Heading N, caption, and "
        "title-page text.",
    )
    pdf.step(
        6,
        "Deterministic rule checks (the score engine)",
        "run_compliance_scan walks a fixed checklist: fonts, heading styles, margins, "
        "indentation, spacing, word spacing, alignment, page numbers, captions, and "
        "citations. Each unit is marked pass or fail. Failures are grouped into issues with "
        "page/line locations.",
    )
    pdf.step(
        7,
        "Gemini enrichment (optional)",
        "enrich_compliance_issues sends already-found issues to Gemini. Gemini may rewrite "
        "Why/Fix text and move severity by at most one step (e.g. moderate -> minor). It "
        "cannot invent new issues, change unit counts, or change Right/Wrong % or the "
        "overall score. Role labels from the engine are locked so Gemini cannot rename them.",
    )
    pdf.step(
        8,
        "Scoring & persistence",
        "build_scoring_payload computes Right %, Wrong %, category bars, and overall /100. "
        "The API hydrates the pending scan from ML progress/result (or persists the "
        "in-process result). The client maps that payload into Scan Results and the PDF report.",
    )

    pdf.add_page()
    pdf.h2("4. How scoring is calculated")
    pdf.body(
        "Two views sit side by side - both come only from the rule checker's pass/fail units:"
    )
    pdf.h3("Right / Wrong % (unit view)")
    pdf.body(
        "right_pct = passed_units / total_units x 100\n"
        "wrong_pct = 100 - right_pct\n\n"
        "Every measured spot counts once. Categories with thousands of units (e.g. Fonts) "
        "weigh heavily here."
    )
    pdf.h3("Category scores & overall /100")
    pdf.body(
        "For each measured category (Fonts, Margins, Indentation, Spacing, Alignment, ...):\n"
        "category_score = (checked - failed) / checked x 100\n\n"
        "overall_score = average of category scores that were actually measured\n\n"
        "Unmeasured categories are skipped so they do not drag the average. Bands: "
        "Good >= 80 | Needs review 50-79 | Critical < 50."
    )
    pdf.body(
        "Severity counts (Errors / Warnings / Checks) are separate: they count rule-level "
        "findings (tickets), not the thousands of micro-units."
    )

    pdf.h2("5. Roles of each AI / helper piece")
    pdf.h3("Rule checker (deterministic engine)")
    pdf.bullet("Job: find format problems and measure pass/fail.")
    pdf.bullet("Changes the score? YES - this is the only score source.")

    pdf.h3("Machine learning helpers")
    pdf.bullet(
        "Style-guide upload: trained extractors can fill Format Mechanics fields you did not type."
    )
    pdf.bullet("Citations: may add confidence on top of normal citation rules.")
    pdf.bullet(
        "ML service worker: runs the same checklist as the API for progress on large files."
    )
    pdf.bullet("Changes the score? NO.")

    pdf.h3("Gemini")
    pdf.bullet("Rewrites explanations ('Why') and recommendations ('Fix').")
    pdf.bullet("May adjust severity by one step only, with measured evidence as ground truth.")
    pdf.bullet(
        "Separate /analyze path: can return summary, keywords, and suggested improvements "
        "from title/abstract/text - not the compliance score."
    )
    pdf.bullet(
        "Changes the score? NO. If Gemini is off or fails, you still get a full rule-based scan."
    )

    pdf.h2("6. What the user sees (output)")
    pdf.bullet("Overall score out of 100 and category score bars.")
    pdf.bullet("Right % / Incorrect % from unit pass rates.")
    pdf.bullet("Issue list with severity, locations (page/line), Why, and Fix.")
    pdf.bullet("Document preview / tracing for highlighted spots.")
    pdf.bullet("Downloadable PDF report using the same scoring math as the UI.")

    pdf.h2("7. Failure & fallback behavior")
    pdf.bullet(
        "ML unreachable or 5xx -> API falls back to in-process run_compliance_scan."
    )
    pdf.bullet(
        "Lost/stale ML jobs -> gateway may requeue once, then mark the scan failed without "
        "consuming a successful scan credit when analysis never finished."
    )
    pdf.bullet(
        "Gemini unavailable -> original rule wording and rule severity are kept."
    )

    pdf.ln(4)
    pdf.callout(
        "Remember: Rules find and score. ML assists. Gemini explains. "
        "The numbers you trust come from the checklist math alone."
    )

    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(
        0,
        5,
        "Source: PaperPilot codebase - api/app (compliance, gemini_client, scan_ml_sync, main), "
        "machinelearning/app (jobs, compliance), docs/HOW_PAPERPILOT_SCAN_WORKS.md, "
        "machinelearning/docs/SCORING_EXPLAINED.md.",
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT))
    return OUT


if __name__ == "__main__":
    path = build()
    print(path)
    print("exists:", path.exists(), "size:", path.stat().st_size if path.exists() else 0)
