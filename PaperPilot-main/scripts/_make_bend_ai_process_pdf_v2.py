"""Generate Downloads/B-end & AI Process v2.pdf - very simple explainer."""
from __future__ import annotations

from pathlib import Path

from fpdf import FPDF

OUT = Path.home() / "Downloads" / "B-end & AI Process v2.pdf"


class Doc(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(100, 100, 100)
        self.set_x(self.l_margin)
        self.cell(0, 8, "PaperPilot  |  B-end & AI Process v2 (Simple)", align="L")
        self.ln(12)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def left(self) -> None:
        self.set_x(self.l_margin)

    def h2(self, text: str) -> None:
        self.ln(4)
        self.left()
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(30, 70, 120)
        self.multi_cell(0, 8, text)
        self.ln(1)

    def body(self, text: str) -> None:
        self.left()
        self.set_font("Helvetica", "", 11)
        self.set_text_color(35, 35, 35)
        self.multi_cell(0, 6, text)
        self.ln(1.5)

    def bullet(self, text: str) -> None:
        self.left()
        self.set_font("Helvetica", "", 11)
        self.set_text_color(35, 35, 35)
        self.cell(7, 6, "-")
        self.multi_cell(self.epw - 7, 6, text)
        self.left()
        self.ln(0.8)

    def big_step(self, num: int, title: str, detail: str) -> None:
        self.left()
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(20, 40, 70)
        self.multi_cell(0, 7, f"Step {num}: {title}")
        self.left()
        self.set_font("Helvetica", "", 11)
        self.set_text_color(35, 35, 35)
        self.multi_cell(0, 6, detail)
        self.ln(2.5)

    def box(self, text: str) -> None:
        self.ln(1)
        self.left()
        self.set_fill_color(235, 242, 250)
        self.set_draw_color(30, 70, 120)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(20, 40, 70)
        self.multi_cell(self.epw, 7, "  " + text, border=1, fill=True)
        self.left()
        self.ln(3)


def build() -> Path:
    pdf = Doc(orientation="P", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_margins(18, 18, 18)

    # Cover
    pdf.set_fill_color(20, 40, 70)
    pdf.rect(0, 0, 210, 56, style="F")
    pdf.set_xy(18, 14)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(255, 255, 255)
    pdf.multi_cell(0, 10, "B-end & AI Process v2")
    pdf.set_x(18)
    pdf.set_font("Helvetica", "", 12)
    pdf.multi_cell(0, 7, "A very simple guide: how PaperPilot checks your paper")
    pdf.set_y(62)

    pdf.box(
        "Easy version: PaperPilot is like a teacher with a checklist. "
        "The checklist gives your score. AI only helps explain the mistakes."
    )

    pdf.h2("The big idea (in one breath)")
    pdf.body(
        "You upload a paper and pick the format rules you want (like APA fonts, margins, "
        "spacing). PaperPilot opens your file, checks lots of tiny spots against those rules, "
        "marks each spot right or wrong, then shows you a score and a list of problems."
    )
    pdf.body(
        "There are three helpers. Only one of them sets the grade."
    )
    pdf.bullet("Rule checker = the teacher with the checklist. This one sets the score.")
    pdf.bullet("Machine learning helpers = small assistants. They help a little. They do not set the score.")
    pdf.bullet("Gemini (Google AI) = a writing helper. It makes the 'why' and 'how to fix' easier to read. It does not change the score.")

    pdf.h2("What you give PaperPilot")
    pdf.bullet("Your paper file (PDF or Word).")
    pdf.bullet("Your Format Mechanics (the style rules you chose).")
    pdf.bullet("Your account (so PaperPilot knows it is you).")

    pdf.h2("What happens when you press Analyse")
    pdf.big_step(
        1,
        "Save and send your paper",
        "Your file is uploaded and stored. Then the app asks the backend to start a scan "
        "using your Format Mechanics.",
    )
    pdf.big_step(
        2,
        "Open and read the paper",
        "The backend opens the file and breaks it into pages, lines, fonts, margins, and "
        "other small parts it can measure. Think of this as carefully reading the paper's "
        "layout, not just the words.",
    )
    pdf.big_step(
        3,
        "Check every rule on the checklist",
        "This is the main work. PaperPilot asks simple questions like: Is the font right? "
        "Are the margins right? Is the spacing right? Is the first line indented? Are page "
        "numbers and captions okay? Each tiny spot gets a pass or a fail.",
    )
    pdf.big_step(
        4,
        "Ask AI to explain the problems (optional)",
        "After the checklist finds the problems, Gemini can rewrite the explanation so it "
        "is clearer. It may also make a problem look a little less or a little more serious "
        "(by one step only). It cannot invent brand-new mistakes, and it cannot change your score.",
    )
    pdf.big_step(
        5,
        "Add up the score and show results",
        "PaperPilot counts how many spots passed and failed, builds your score bars, and "
        "shows Scan Results: overall score, Right/Wrong %, and the list of issues you can fix.",
    )

    pdf.add_page()
    pdf.h2("How the score works (super simple)")
    pdf.body(
        "Imagine the paper is full of tiny checkmarks. Each checkmark is one measured spot."
    )
    pdf.bullet("Right % = how many spots passed.")
    pdf.bullet("Wrong % = how many spots failed.")
    pdf.bullet(
        "Category scores (Fonts, Margins, Spacing, and so on) = how well each group did."
    )
    pdf.bullet(
        "Overall score out of 100 = the average of the category scores that were checked."
    )
    pdf.body(
        "Important: those numbers always come from the checklist math. Gemini does not "
        "rewrite the numbers."
    )

    pdf.h2("Who does what?")
    pdf.body("Rule checker")
    pdf.bullet("Finds format problems.")
    pdf.bullet("Counts pass and fail.")
    pdf.bullet("Creates the score. YES, this changes the score.")

    pdf.body("Machine learning helpers")
    pdf.bullet("Can help fill Format Mechanics when you upload a style guide.")
    pdf.bullet("Can help a bit with citations.")
    pdf.bullet("Can run the same checklist in the background for big files.")
    pdf.bullet("Does NOT set the overall score.")

    pdf.body("Gemini AI")
    pdf.bullet("Makes the 'Why' and 'Fix' text easier to understand.")
    pdf.bullet("May tweak how serious a label looks by one step.")
    pdf.bullet("Does NOT add new issues.")
    pdf.bullet("Does NOT change Right %, Wrong %, or the overall score.")

    pdf.h2("What you see at the end")
    pdf.bullet("A score out of 100.")
    pdf.bullet("Bars for things like Fonts, Margins, Spacing.")
    pdf.bullet("Right % and Wrong %.")
    pdf.bullet("A list of issues with page/line, why it failed, and how to fix it.")
    pdf.bullet("A report you can download.")

    pdf.h2("If something is offline")
    pdf.bullet("If the ML worker is busy or down, the main app can still run the same checklist.")
    pdf.bullet("If Gemini is off, you still get a full scan - just with the original rule wording.")
    pdf.bullet("You do not need AI online for PaperPilot to grade format.")

    pdf.ln(2)
    pdf.box(
        "Remember this sentence: Rules find and score the problems. "
        "ML helps a little. Gemini explains the problems more clearly."
    )

    pdf.left()
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(
        0,
        5,
        "This is the simple v2 guide. For more technical detail, see "
        "'B-end & AI Process.pdf' in the same Downloads folder.",
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT))
    return OUT


if __name__ == "__main__":
    path = build()
    print(path)
    print("exists:", path.exists(), "size:", path.stat().st_size if path.exists() else 0)
