# How PaperPilot Checks Your Paper (Client Overview)

PaperPilot compares your uploaded research paper against **your chosen formatting rules** (mechanics)—fonts, margins, spacing, indentation, page size, alignment, and related requirements—then shows a clear score, what failed, and where to fix it.

## One-line summary

**We do not need you to collect hundreds of graded papers. Users bring their rule guide + research paper; the system measures the paper against those rules.**

## What gets checked

When you run a scan, PaperPilot reads your PDF or Word document and checks it against the **one rule profile you selected** for that scan. Typical checks include:

- Font name and size
- Margins and page size
- Line spacing and paragraph spacing
- Indentation and alignment
- Pagination and layout details tied to your mechanics
- Citations and captions where your rules define expectations

The engine **measures** what is in the file (for example, “this line is 11 pt Arial with a 1-inch left margin”) and compares those measurements to your saved rules—not to a generic template unless that is what you configured.

## Your score: right % and wrong %

After analysis you see two numbers that always add up to **100%**:

- **Right %** — share of evaluated checks that passed
- **Wrong %** — share that failed (`wrong % = 100% − right %`)

These are simple pass/fail totals over many small checks across the document, not a subjective letter grade from a human reader.

## Category breakdown (where problems live)

**Wrong %** can be split by **category**—for example Fonts, Margins, Indentation, Spacing, Alignment, Paper size, and similar groupings from your mechanics. Each slice shows what **share of all failing checks** fell in that category. Those slices add up to **100% of what went wrong**, so you can see whether margins or fonts (or something else) drove most issues.

## Severity colors

Each problem is labeled **critical**, **moderate**, or **minor**. The results screen shows **severity percentages**—how much of the failing work falls into each level—and uses **color chips** so critical items stand out (typically the strongest red), moderate issues use a middle tone, and minor items use a lighter warning color. Fix critical items first when you are short on time.

## While the scan runs: progress

Instead of a silent spinner, you see a **progress bar** with short status text (for example parsing, checking, scoring). The app updates about once per second until the scan finishes or reports an error.

## After the scan: summary and next steps

A **compact summary modal** opens first (not the full report screen):

- Right %, wrong %, top category slices, and severity chips
- **View Document** — opens your paper with an issues list; click an issue to jump to that spot
- **View Full Result** — opens the detailed report you already use today (full breakdown, all issues, recommendations)

## Click-to-fix (reference tracing)

From the issue list, **click a finding** and PaperPilot:

- Scrolls to the **page and line** (or nearest region) in your manuscript preview
- Highlights the area with a **soft red background** and an **underline** on the problem text when the format allows

**PDF** previews generally give the most precise highlights. **Word (DOCX)** uses the same location idea; highlighting may be approximate at paragraph or line level.

## Frequently asked questions

### What “model” or AI are you using?

PaperPilot uses a **hybrid** approach:

- **Most format compliance is rule-based measurement**—the system reads the document structure and typography and compares it to your saved mechanics. That part does not require a custom-trained language model.
- **Optional helpers** (for example extracting fields from an uploaded style guide, or classifying messy citation cases) may use lightweight ML or external APIs where configured. Those assist the workflow; they do **not** replace the core pass/fail checks.

We do **not** claim that your entire scan is scored by a fine-tuned large language model reading the paper like a professor.

### How was this built?

Your team (or institution) configures **mechanics**—the structured rule set for a program or style guide. Users upload the **paper under test** and pick which saved mechanics apply. The checking service runs on secure backend infrastructure; the phone and web apps talk only to the main PaperPilot API, not directly to the analysis servers.

### Do we need to provide a training dataset?

**No, for normal format checking.** You need:

1. A **rule profile** (mechanics)—often filled from a form and optionally refined from an uploaded guide PDF/DOCX  
2. The **student or author paper** to scan  

Uploads are used for **that scan and your account**, not to train a shared model on hundreds of graded theses unless you separately opt into optional ML experiments (such as citation classifiers).

### What is Cloudinary’s role?

**Cloudinary stores document files** (your paper and related uploads) so the app can show previews and pass a stable link to the analysis pipeline without sending huge files through the browser on every step. PaperPilot’s **API** (hosted on Vercel) handles auth, saved mechanics, and scan history; it fetches the document from Cloudinary when needed and sends the job to the **document checking service** on Render. Your manuscript stays in your normal PaperPilot storage flow—we are not asking clients to manage Cloudinary directly unless you are on the technical setup team.

### Can one scan use multiple rule books at once?

**Not in v1.** You save many mechanics profiles, but each scan uses **exactly one** selected profile.

### Will the app call the analysis server directly from my browser?

**No.** Only the PaperPilot API calls the analysis service; that keeps keys private and consistent with how auth and Firebase data already work.

## What this version does not promise

- Perfect highlight placement in every Word file (PDF is the precision target)
- Comparing two different rule books in a single scan
- Replacing your institution’s final human review for policy or content

For technical architecture and APIs, see [`HOW_IT_WORKS_DEV.md`](./HOW_IT_WORKS_DEV.md) and [`PLAN.md`](./PLAN.md).
