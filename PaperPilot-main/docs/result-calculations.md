# What Minor, Moderate, and Critical mean (the simple version)

## First, what the numbers are

Imagine your teacher gives you a list of rules for how your paper should look. PaperPilot reads your paper and checks every page against those rules.

Every time it finds a spot that breaks a rule, it adds **1** to a counter. So the numbers are **how many spots** broke a rule, not how bad each one is.

In your paper:

- **Minor:** 1,897 spots
- **Moderate:** 3,237 spots
- **Critical:** 372 spots

## The three colors are like traffic lights

- **Critical (red)** means big problem. Fix these first.
- **Moderate (orange)** means medium problem. Fix these next.
- **Minor (yellow)** means small problem. Fix these last.

So red is the **most serious**, even though it has the **smallest** number.

## What counts as each one

### Critical: big problems

- The letters use the wrong style. For example, the rules say Times New Roman but you used Arial.
- The letters are the wrong size, like too big or too small.
- The paper is the wrong size.
- The empty space around the edge of the page is **way off**.

These are easy to notice just by looking at the page.

### Moderate: medium problems

- The space between lines is wrong. For example, lines are squished together when they should have more room.
- The lines don't line up the way they should. For example, the right side should be neat and straight but it's ragged.
- A page number is missing or in the wrong corner.
- Page numbers skip, repeat or restart where they shouldn't, or use the wrong style (for example 1, 2, 3 where the rules say i, ii, iii).
- You wrote where your information came from in a different way than the rules say.
- The page is sideways when it should be standing up, or the other way around. (If the rules allow sideways pages for tables and figures, those pages are fine.)
- The empty space around the edge of the page is **a little more off than it should be**.

### Minor: small problems

- The first line of a paragraph isn't pushed in the right amount.
- The letters aren't black when they should be.
- A page number shows up on the title page or the first page of a chapter when it should be hidden.
- A heading isn't styled the way the rules say (for example it should be bold, centered or in Title Case).
- There are two spaces between words, or the wrong number of spaces after a sentence.
- A table or picture label isn't written the right way.
- The empty space around the edge of the page is **just a tiny bit off**.

## So why does Moderate have the biggest number?

Because of **how often** each rule gets checked.

Think of it like a teacher grading homework:

- Some rules get checked **on almost every line**, like "do the lines line up?" and "is the space between lines right?"
- Some rules get checked **once per paragraph**, like "is the first line pushed in?"
- Some rules only matter in **a few places**, like "is the page number in the right corner?"

If one setting is wrong for the whole paper, a rule checked on every line gets counted **hundreds or thousands of times**.

That's what happened here:

- **Moderate is biggest** because line-up and line-spacing get checked on almost every line.
- **Minor is second** because the first-line push-in is checked once per paragraph, so fewer times.
- **Critical is smallest** because most of your letters were already the right style and size.

## A picture to help

Imagine you're painting a fence with 100 boards:

- You used the **wrong color paint** on every board. That's 100 medium mistakes.
- You **missed a spot** at the start of 20 boards. That's 20 small mistakes.
- **2 boards are broken.** That's 2 big mistakes.

The broken boards are the worst problem, but the wrong paint has the biggest number because it's on every board.

## The good news

A lot of those 3,237 moderate spots might come from **just one or two settings** that are wrong for the whole paper. Fix that one setting, and a huge chunk of the number can disappear at once.

## What to do

1. Fix the **red** ones first. They're the most important.
2. Then fix the **orange** ones. Changing one setting can fix many at once.
3. Last, fix the **yellow** ones.

---


## How the score numbers are worked out

Every number on the results page is calculated once, on the server, by `scoring.py` (the same file is used by the ML service and the API). The website and the phone app only display those numbers. Percentages are rounded to one decimal place, and the overall score is rounded to a whole number. Nothing is estimated in the browser.

### Words used on the results page

- **Formatting unit**: one small piece of the paper that is checked against one category's rule.
  - **Fonts:** each line of text (passes only if the letter style, size and colour are all right), plus each heading when the rules give a heading style.
  - **Margins:** each edge (top, bottom, left, right) of each page.
  - **Indentation:** the first line of each paragraph that has at least two lines.
  - **Spacing:** each pair of neighbouring lines inside a paragraph, plus each paragraph's word spacing when the rules say how many spaces to use.
  - **Alignment:** each long body line.
  - **Pagination:** each page whose page number the rules say something about (shown or hidden, position, number style, and counting in order).
- **Passed unit / failed unit**: a unit either follows its category's rule or it doesn't. Always: **units checked = units passed + units failed**.
- **Issue**: one rule broken at one place. A failed unit makes **at least one** issue, and can make more. For example, a line in the wrong font *and* the wrong size is **1 failed Fonts unit** but **2 issues**. Some checks look at the whole page and have no unit at all: paper size and orientation (counted under Margins), table and figure captions (counted under Captions) and citations (counted under Citations). So the issue count of a category can be **larger** than its failed units.
- **Issue type**: one row in the issues list (for example "Line spacing differs"). It groups every place where that rule was broken.
- **Severity**: how serious an issue type is (critical, moderate or minor). It is set by a fixed rule for each check (see the first part of this page). Margin issues get their severity from how far off the margin is, and an issue type takes the **worst** severity among its places. If the Gemini helper is switched on, it may move a severity **one step** up or down. The issue then shows `severity_source: "gemini"` and keeps the original as `rule_severity`. Severity never changes any unit count or score.
- **Not applicable**: the format mechanics have no rule for that category, so nothing was checked.
- **Not evaluated**: there is a rule, but nothing in the paper could be measured for it (for example, no paragraph with two or more lines). Both are shown as "N/A" and are **never** counted as 100%.

### Formulas

| Number on screen | Formula |
| --- | --- |
| Right (passed units) | units passed ÷ units checked × 100 |
| Wrong (failed units) | units failed ÷ units checked × 100 |
| Category score bar | that category's passed units ÷ that category's checked units × 100 |
| Overall score | average of the category scores, counting only categories with at least one checked unit (each category counts equally; there are no weights) |
| Where issues cluster (% of failed units) | that category's failed units ÷ failed units in all categories × 100 |
| Severity mix (% of issues found) | issues with that severity ÷ all issues × 100 |
| Errors / Warnings / Issue types | number of critical issue types / moderate or minor issue types / all issue types |

If a formula would divide by zero, the value is `null` and the page shows "—" or "N/A" instead of a made-up number. Right + Wrong is always exactly 100% whenever at least one unit was checked.

The overall score and "Right" are different questions, so they usually differ. The overall score gives every **category** an equal vote. "Right" gives every **unit** an equal vote.

### Worked example (made-up numbers, only to show the arithmetic)

Suppose a scan checks 7,872 units and 6,367 of them fail.

- Units passed = 7,872 − 6,367 = 1,505
- Wrong = 6,367 ÷ 7,872 × 100 = 80.88…% → shown as **80.9%**
- Right = 1,505 ÷ 7,872 × 100 = 19.11…% → shown as **19.1%**
- 80.88…% + 19.11…% = 100%

If 3,500 of the failed units are Fonts units, Fonts' cluster share is 3,500 ÷ 6,367 × 100 = 54.97…% → **55.0%**. That count comes from the analyzer; it is never worked out backwards from a rounded percentage.

### Where the raw numbers live

Every finished scan stores a `scoring` object at `compliance_scans/{user id}/{scan id}/scoring`. Each percentage in it has the form `{value, numerator, denominator, meaning}`, so you can recompute it by hand. The object also has:

- `units`: checked / passed / failed totals
- `categories`: status, units, score, failed-unit share, issue count and issue types for each category
- `issues`: total issues, issues per category and per severity, and issues that have no unit
- `overall`: which categories were averaged
- `consistency`: the result of the automatic checks that run after every analysis (totals add up, percentages match their fractions, nothing above 100%, no score where nothing was checked). If a check fails, the server logs it and the results page shows a warning.

Each scan is stored under its own user and scan id. Re-analysing a paper creates a new scan; it never adds to an old one.

### Machine learning

PaperPilot does **not** use a Random Forest. The trained models are text classifiers (TF-IDF features with logistic regression). They guess a citation's style and whether it follows the required style, and they help read rule values out of a format mechanics file. They can add citation issues and fill in missing mechanics rules. They never count units, never change a score or percentage, and are not used for severity. The only machine help with severity is the optional Gemini step described above.

### How to check any scan yourself

1. Open the scan's `scoring` object (Firebase console, or `GET /scans/{scan id}`).
2. Check that `units.checked == units.passed + units.failed`, and that each category's units add up to those totals.
3. For any percentage, divide `numerator` by `denominator` and multiply by 100. It should equal `value`.
4. Average the `score.value` of the categories listed in `overall.categories`. It should equal `overall.value`.
5. `consistency.ok` should be `true`.

## Reading a real result: "chapter 1"

This walks through one real scan, using only the numbers printed on its results page. It was scanned before Pagination became its own category, so it shows five category bars; a scan today shows six, and the overall score averages every category that checked at least one unit.

### Right 44.3% and Wrong 55.7%

The page says **9,886 units were checked** and **5,506 failed**.

- Units passed = 9,886 − 5,506 = **4,380**
- Right = 4,380 ÷ 9,886 × 100 = 44.305…% → **44.3%**
- Wrong = 5,506 ÷ 9,886 × 100 = 55.695…% → **55.7%**
- 44.3% + 55.7% = **100%**

### The five category bars

Each bar is that category's passed units ÷ its checked units:

- **Fonts 90.3%:** about 9 out of every 10 measured lines had the right font.
- **Margins 84.7%**
- **Indentation 11.6%:** most first lines were not indented the required amount.
- **Spacing 0%:** **every** measured line pair had the wrong spacing. This usually means one wrong setting for the whole chapter (for example 1.5 instead of 2.0).
- **Alignment 17.7%**

The small grey text under each bar ("2,014 issues found…") is the number of **issues**, not units. One failed unit can break more than one rule.

### Overall score 41

The overall score is the average of the five category scores, with each category counting equally:

> (90.3 + 84.7 + 11.6 + 0 + 17.7) ÷ 5 = 204.3 ÷ 5 = 40.86 → shown as **41**

The server averages the exact, unrounded category scores. Its result is 40.8-something, which also rounds to **41**. Adding up the rounded bars by hand can be off by a tiny amount, because each bar was already rounded.

Why is 41 lower than Right (44.3%)? The overall score gives each **category** one equal vote. Spacing scored 0, and it counts as a full fifth of the average even though it is only one of five categories. Right/Wrong gives each **unit** one equal vote.

### Where issues cluster (% of failed units)

Each bar is that category's failed units ÷ all 5,506 failed units. For example, Spacing's 36.6% means about a third of all failed units were spacing failures. Fixing Spacing and Indentation alone would remove about 70% of the failures.

### Severity mix (% of issues found)

Each chip is the number of issues with that severity ÷ all issues found. Moderate 58.8% means more than half of all issues are moderate (mostly spacing and alignment). Critical 6.8% is small: only font and some margin problems are critical.

### Why did the cluster bars add up to 100.1% and not 100%?

In this screenshot, 36.6 + 33.4 + 21.9 + 6.8 + 1.4 = **100.1**. The counts were not wrong. Each bar was **rounded on its own**.

Example with made-up exact values: 36.58 → 36.6, 33.38 → 33.4, 21.90 → 21.9, 6.76 → 6.8, 1.38 → 1.4. The exact values add up to 100.00, but the rounded ones add up to 100.1, because three of the five were rounded up.

**Fix:** the page now rounds a group of shares together. It first rounds every value down. Then it gives the leftover 0.1s to the values that lost the most when rounded down (the "largest remainder" method). The same values now display as 36.6, 33.4, 21.9, **6.7**, 1.4 = exactly **100.0%**. This applies to the cluster bars, the severity chips and the Right/Wrong pair. Only the display changes; the stored numbers stay exact.

### Note about this particular scan

This scan was produced before the new scoring code was deployed. That's why:

- the Right card has no "x of 9,886 units" line;
- the bars don't say "x of y units failed".

After the ML service and API are redeployed and the chapter is analysed again, those lines appear. You can then check every bar by hand by dividing the two numbers shown under it.
