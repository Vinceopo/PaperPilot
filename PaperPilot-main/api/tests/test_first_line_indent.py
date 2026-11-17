"""Focused first-line indent regressions (FN, table FP, true 0.5\" FP).

Parameterized geometry only — no Capstone/manuscript-specific tokens in production logic.
"""

from __future__ import annotations

import unittest

from tests.test_indent_pdf import IndentFalseNegativeAndFalsePositiveTests


class FirstLineIndentRegressionTests(IndentFalseNegativeAndFalsePositiveTests):
    """Re-export the indent FN/FP cases under the first_line_indent module name."""


if __name__ == "__main__":
    unittest.main()
