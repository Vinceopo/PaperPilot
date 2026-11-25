/**
 * Format Fields — editable form for Customize, Upload extract, and Saved mechanics.
 * Values shown are the actual rules (from extraction, saved profile, or sample starter).
 */

import {
  PAGE_ALIGNMENT_OPTIONS,
  alignmentPageOverrideRowsFromText,
  alignmentPageOverridesTextFromRows,
  citationStylesForPlan,
  clampCitationFormatForPlan,
  parseLineSpacing,
} from "../../lib/formatMechanicsForm.js";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import {
  CHAPTER_FIRST_PAGE_OPTIONS,
  FONT_FAMILIES,
  HEADING_RULE_FIELDS,
  LANDSCAPE_OPTIONS,
  LINE_SPACING_OPTIONS,
  MAX_HEADING_LEVELS,
  PAGE_POSITIONS,
  PRELIMINARY_STYLE_OPTIONS,
  TITLE_PAGE_OPTIONS,
  WORD_SPACING_OPTIONS,
  canonicalHeadingItalic,
  canonicalHeadingWeight,
  canonicalLineSpacing,
  emptyHeading,
  headingLabel,
} from "../../lib/mechanicsOptions";

function headingFieldDisplayValue(key, value) {
  if (key === "bold") return canonicalHeadingWeight(value);
  if (key === "italic") return canonicalHeadingItalic(value);
  return value;
}

const FONT_FAMILY_OPTIONS = FONT_FAMILIES.map((value) => ({ value }));
const FONT_COLOR_OPTIONS = ["Black/Automatic", "Black", "Automatic"].map((value) => ({ value }));

const inputClass =
  "mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#16bfa8] disabled:bg-slate-50";
const areaClass =
  "mt-1.5 min-h-[4.5rem] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#16bfa8] disabled:bg-slate-50";

/** Number input with a fixed unit badge (in, pt, …) so measures aren’t ambiguous. */
function MeasureInput({ unit, disabled, className = inputClass, ...props }) {
  return (
    <div className="relative">
      <input disabled={disabled} className={`${className} pr-9`} {...props} />
      <span
        className="pointer-events-none absolute inset-y-0 right-0 mt-1.5 flex h-9 items-center pr-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
        aria-hidden="true"
      >
        {unit}
      </span>
    </div>
  );
}

function optionMatchesValue(option, currentRaw) {
  const optionValue = String(option?.value ?? "").trim();
  const current = String(currentRaw ?? "").trim();
  if (!optionValue || !current) return false;
  if (optionValue.toLowerCase() === current.toLowerCase()) return true;
  const optionN = parseLineSpacing(optionValue);
  const currentN = parseLineSpacing(current);
  return optionN != null && currentN != null && Math.abs(optionN - currentN) < 0.05;
}

function AlignmentPageOverridesEditor({ value, onChange, disabled }) {
  const [rows, setRows] = useState(() => alignmentPageOverrideRowsFromText(value));

  useEffect(() => {
    const incoming = alignmentPageOverridesTextFromRows(alignmentPageOverrideRowsFromText(value));
    const current = alignmentPageOverridesTextFromRows(rows);
    if (incoming !== current) setRows(alignmentPageOverrideRowsFromText(value));
    // Keep incomplete draft rows while the parent echoes the same complete overrides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit(next) {
    setRows(next);
    onChange(alignmentPageOverridesTextFromRows(next));
  }

  function updateRow(index, patch) {
    commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    commit([...rows, { page: "", alignment: "center" }]);
  }

  function removeRow(index) {
    commit(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {rows.length ? (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <label className="min-w-[5.5rem] flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Page</span>
                <input
                  disabled={disabled}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="e.g. 1"
                  value={row.page}
                  onChange={(e) => updateRow(index, { page: e.target.value })}
                  className={inputClass}
                  aria-label={`Override page number ${index + 1}`}
                />
              </label>
              <label className="min-w-[8rem] flex-[1.4]">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Alignment
                </span>
                <select
                  disabled={disabled}
                  value={row.alignment || "center"}
                  onChange={(e) => updateRow(index, { alignment: e.target.value })}
                  className={inputClass}
                  aria-label={`Override alignment ${index + 1}`}
                >
                  {PAGE_ALIGNMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {disabled ? null : (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Remove page override ${index + 1}`}
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">
          No page overrides yet — body alignment applies to every page.
        </p>
      )}
      {disabled ? null : (
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-[#16bfa8] hover:text-[#109b89]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add page override
        </button>
      )}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block text-[11px] font-semibold text-slate-600">
      {label}
      {children}
      {hint ? <span className="mt-1 block text-[10px] font-normal text-slate-400">{hint}</span> : null}
    </label>
  );
}

/**
 * Free-text field with optional suggestions. Presets are shortcuts only —
 * any value may be typed (dynamic school / thesis mechanics).
 */
function ComboInput({
  value,
  onChange,
  options,
  disabled,
  includeIgnore = false,
  ignoreLabel = "IGNORE",
  placeholder = "Type any value…",
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();
  const currentRaw = String(value ?? "");
  const current = currentRaw.trim().toLowerCase();

  const items = (() => {
    const base = (options || []).map((option) =>
      typeof option === "string" ? { value: option } : option
    );
    const list = [];
    if (includeIgnore) list.push({ value: "IGNORE", label: ignoreLabel });
    for (const item of base) {
      if (!list.some((entry) => entry.value === item.value)) list.push(item);
    }
    // Keep typed/extracted values selectable, but never label them "(custom)" —
    // that looked like a unit name instead of in / pt / cm on measure fields.
    if (
      currentRaw &&
      currentRaw !== "IGNORE" &&
      !list.some((entry) => optionMatchesValue(entry, currentRaw))
    ) {
      list.push({ value: currentRaw, label: currentRaw });
    }
    return list;
  })();

  const matched = items.find((o) => optionMatchesValue(o, currentRaw));
  const displayValue = matched?.label || matched?.value || currentRaw;

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openList() {
    setActive(items.findIndex((o) => o.value.toLowerCase() === current));
    setOpen(true);
  }

  function choose(option) {
    onChange(option.value);
    setOpen(false);
    inputRef.current?.focus();
  }

  function commitTyped(typed) {
    const trimmed = typed.trim().toLowerCase();
    const byLabel = items.find(
      (o) => (o.label || o.value).toLowerCase() === trimmed
    );
    onChange(byLabel ? byLabel.value : typed);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + items.length) % items.length);
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        disabled={disabled}
        value={displayValue}
        placeholder={placeholder}
        onChange={(e) => commitTyped(e.target.value)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="none"
        className={`${inputClass} pr-8`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Show suggestions"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          if (open) setOpen(false);
          else openList();
          inputRef.current?.focus();
        }}
        className="absolute bottom-0 right-0 top-1.5 flex w-8 items-center justify-center text-slate-500 hover:text-slate-700 disabled:opacity-40"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="pp-scroll absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((option, index) => {
            const selected = option.value.toLowerCase() === current;
            return (
              <li
                key={`${option.value}-${index}`}
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setActive(index)}
                className={`cursor-pointer px-3 py-1.5 text-xs font-normal ${
                  index === active ? "bg-[#e6f9f4]" : ""
                } ${selected ? "font-semibold text-[#109b89]" : "text-slate-700"}`}
              >
                {option.label || option.value}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Suggestions + IGNORE + free text (same as ComboInput — not a closed select). */
function ChoiceSelect({ value, onChange, options, disabled, emptyLabel = "IGNORE" }) {
  return (
    <ComboInput
      disabled={disabled}
      value={value}
      onChange={onChange}
      options={options}
      includeIgnore
      ignoreLabel={emptyLabel}
    />
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3 border-t border-slate-200/80 pt-3 first:border-t-0 first:pt-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#109b89]">{title}</p>
      {children}
    </div>
  );
}

export default function FormatMechanicsFields({
  form,
  onChange,
  disabled,
  title = "Format Fields",
  tier = "free",
}) {
  const citationOptions = citationStylesForPlan(tier);
  const citationValue = (() => {
    if (/^ignore$/i.test(String(form.citationFormat || "").trim())) return "IGNORE";
    return clampCitationFormatForPlan(form.citationFormat, tier);
  })();

  // If a Free user loads a saved MLA/IEEE profile, snap the field to APA.
  useEffect(() => {
    const raw = String(form.citationFormat || "").trim();
    if (!raw || /^ignore$/i.test(raw)) return;
    const clamped = clampCitationFormatForPlan(raw, tier);
    if (clamped && clamped.toUpperCase() !== raw.toUpperCase()) {
      onChange?.({ ...form, citationFormat: clamped });
    }
  }, [tier, form.citationFormat]);

  function set(key) {
    return (e) => {
      let next = e.target.value;
      if (key === "citationFormat") next = clampCitationFormatForPlan(next, tier);
      onChange?.({ ...form, [key]: next });
    };
  }
  function setValue(key) {
    return (value) => onChange?.({ ...form, [key]: value });
  }
  const headings = Array.isArray(form.headings) ? form.headings : [];
  function setHeadings(next) {
    onChange?.({ ...form, headings: next });
  }
  function updateHeading(index, update) {
    setHeadings(headings.map((heading, i) => (i === index ? update(heading) : heading)));
  }
  function setHeadingValue(index, key, value) {
    updateHeading(index, (heading) => ({ ...heading, [key]: value }));
  }
  function addHeadingRule(index, key) {
    updateHeading(index, (heading) => ({ ...heading, fields: [...(heading.fields || []), key] }));
  }
  function removeHeadingRule(index, key) {
    updateHeading(index, (heading) => ({
      ...heading,
      [key]: "",
      fields: (heading.fields || []).filter((field) => field !== key),
    }));
  }
  function addHeading() {
    setHeadings([...headings, emptyHeading()]);
  }
  function removeHeading(index) {
    setHeadings(headings.filter((_, i) => i !== index));
  }

  return (
    <div className="flex max-h-[min(32rem,70vh)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-[#f8f9fb]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
        <p className="text-[10px] text-slate-400">Type any value — suggestions are optional</p>
      </div>

      <div className="pp-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
      <Field label="Profile name">
        <input
          disabled={disabled}
          value={form.name}
          onChange={set("name")}
          className={inputClass}
        />
      </Field>

      <Section title="Paper">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Size" hint="Width × height in inches — e.g. 8.5 x 11">
            <input
              disabled={disabled}
              value={form.paperSize}
              onChange={set("paperSize")}
              placeholder="8.5 x 11 in"
              className={inputClass}
            />
          </Field>
          <Field label="Orientation" hint="Portrait, Landscape, or type your school’s wording">
            <ChoiceSelect
              disabled={disabled}
              value={form.paperOrientation}
              onChange={setValue("paperOrientation")}
              options={["Portrait", "Landscape"]}
            />
          </Field>
          <Field
            label="Line Spacing"
            hint="Line multiple (not in/pt/cm) — Single, 1.5, Double, or type a value"
          >
            <div className="relative">
              <ComboInput
                disabled={disabled}
                value={canonicalLineSpacing(form.spacing)}
                onChange={(next) => setValue("spacing")(canonicalLineSpacing(next))}
                options={LINE_SPACING_OPTIONS}
                includeIgnore
              />
              <span
                className="pointer-events-none absolute inset-y-0 right-8 mt-1.5 flex h-9 items-center pr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                aria-hidden="true"
              >
                ×
              </span>
            </div>
          </Field>
          <Field label="Word spacing" hint="Spaces between words and after periods — type any rule">
            <ChoiceSelect
              disabled={disabled}
              value={form.wordSpacing}
              onChange={setValue("wordSpacing")}
              options={WORD_SPACING_OPTIONS}
            />
          </Field>
          <Field label="Indention" hint="First-line indent — values are in inches (in)">
            <MeasureInput
              unit="in"
              disabled={disabled}
              value={form.indention}
              onChange={set("indention")}
              placeholder="0.5"
              aria-label="Indention in inches"
            />
          </Field>
          <Field label="Alignment" hint="Body text — type any wording; IGNORE skips this check">
            <ChoiceSelect
              disabled={disabled}
              value={form.alignment || ""}
              onChange={setValue("alignment")}
              options={["Justified", "Left", "Center", "Right"]}
            />
          </Field>
          <Field label="Landscape pages" hint="When pages may be turned sideways — type any rule">
            <ChoiceSelect
              disabled={disabled}
              value={form.paperLandscapePages}
              onChange={setValue("paperLandscapePages")}
              options={LANDSCAPE_OPTIONS}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Alignment page overrides"
              hint="Optional — set a different alignment for specific pages (e.g. title page centered)"
            >
              <div className="mt-1.5">
                <AlignmentPageOverridesEditor
                  disabled={disabled}
                  value={form.alignmentPageOverrides || ""}
                  onChange={(next) => onChange?.({ ...form, alignmentPageOverrides: next })}
                />
              </div>
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Margins">
        <p className="mb-2 text-[10px] text-slate-400">Values are in inches (in)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            ["marginTop", "Top"],
            ["marginLeft", "Left"],
            ["marginBottom", "Bottom"],
            ["marginRight", "Right"],
            ["marginGutter", "Gutter"],
            ["marginHeader", "Header"],
            ["marginFooter", "Footer"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <MeasureInput
                unit="in"
                disabled={disabled}
                type="number"
                min="0"
                max="5"
                step="0.05"
                value={form[key]}
                onChange={set(key)}
                aria-label={`${label} margin in inches`}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Font">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Body text size" hint="Points (pt) — same as Contents Size, not heading size">
            <MeasureInput
              unit="pt"
              disabled={disabled}
              type="number"
              min="6"
              max="72"
              step="0.5"
              value={form.bodySize}
              onChange={set("bodySize")}
              aria-label="Body text size in points"
            />
          </Field>
          <Field label="Type" hint="Any font name — e.g. Linux Biolinum O (suggestions optional)">
            <ComboInput
              disabled={disabled}
              value={form.fontType}
              onChange={setValue("fontType")}
              options={FONT_FAMILY_OPTIONS}
              includeIgnore
              placeholder="Type any font name…"
            />
          </Field>
          <Field label="Color" hint="Black, Automatic, or type any color rule">
            <ComboInput
              disabled={disabled}
              value={form.fontColor}
              onChange={setValue("fontColor")}
              options={FONT_COLOR_OPTIONS}
              includeIgnore
            />
          </Field>
        </div>
      </Section>

      <Section title="Headings">
        <p className="mb-2 text-[10px] text-slate-400">
          Filled from your uploaded format. Edit only if a value does not match your guide.
        </p>
        {headings.length ? null : (
          <p className="text-[11px] text-slate-400">
            No heading rules — this check is skipped. Add a level only if your guide defines one.
          </p>
        )}
        {headings.map((heading, index) => {
          const label = headingLabel(index);
          const shown = HEADING_RULE_FIELDS.filter((field) => heading.fields?.includes(field.key));
          const missing = HEADING_RULE_FIELDS.filter((field) => !heading.fields?.includes(field.key));
          return (
            <div key={index} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-600">{label}</p>
                {disabled ? null : (
                  <button
                    type="button"
                    onClick={() => removeHeading(index)}
                    className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Remove ${label}`}
                    title={`Remove ${label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {shown.length ? (
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
                  {shown.map((field) => (
                    <div key={field.key}>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] text-slate-500">{field.label}</span>
                        {disabled ? null : (
                          <button
                            type="button"
                            onClick={() => removeHeadingRule(index, field.key)}
                            className="grid h-4 w-4 place-items-center rounded text-slate-400 hover:text-rose-600"
                            aria-label={`Remove ${field.label} from ${label}`}
                            title="Remove rule"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {field.key === "size" ? (
                        <MeasureInput
                          unit="pt"
                          disabled={disabled}
                          type="number"
                          min="6"
                          max="72"
                          step="0.5"
                          value={heading.size}
                          onChange={(e) => setHeadingValue(index, "size", e.target.value)}
                          aria-label={`${label} size in points`}
                        />
                      ) : (
                        <ChoiceSelect
                          disabled={disabled}
                          value={headingFieldDisplayValue(field.key, heading[field.key])}
                          onChange={(value) =>
                            setHeadingValue(index, field.key, headingFieldDisplayValue(field.key, value))
                          }
                          options={field.options}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[10px] text-slate-400">
                  No rules set — this heading level is skipped (same as IGNORE).
                </p>
              )}
              {!disabled && missing.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missing.map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => addHeadingRule(index, field.key)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:border-[#16bfa8] hover:text-[#109b89]"
                    >
                      <Plus className="h-3 w-3" />
                      {field.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {!disabled && headings.length < MAX_HEADING_LEVELS ? (
          <button
            type="button"
            onClick={addHeading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-[#16bfa8] hover:text-[#109b89]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add heading level
          </button>
        ) : null}
      </Section>

      <Section title="Pagination">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Position" hint="Where page numbers sit — type any wording">
            <ChoiceSelect
              disabled={disabled}
              value={form.paginationPosition}
              onChange={setValue("paginationPosition")}
              options={PAGE_POSITIONS}
            />
          </Field>
          <Field label="Title page" hint="Document page 1 — type any rule">
            <ChoiceSelect
              disabled={disabled}
              value={form.paginationTitlePage}
              onChange={setValue("paginationTitlePage")}
              options={TITLE_PAGE_OPTIONS}
            />
          </Field>
          <Field label="First page of each chapter" hint="Type any rule your guide uses">
            <ChoiceSelect
              disabled={disabled}
              value={form.paginationFirstPageRule}
              onChange={setValue("paginationFirstPageRule")}
              options={CHAPTER_FIRST_PAGE_OPTIONS}
            />
          </Field>
          <Field label="Preliminary pages" hint="Pages before Chapter 1 — type any style">
            <ChoiceSelect
              disabled={disabled}
              value={form.paginationPreliminaryStyle}
              onChange={setValue("paginationPreliminaryStyle")}
              options={PRELIMINARY_STYLE_OPTIONS}
            />
          </Field>
        </div>
      </Section>

      <Section title="Layout for tables">
        <Field label="Table naming / title convention">
          <textarea
            disabled={disabled}
            value={form.tableLayout}
            onChange={set("tableLayout")}
            className={areaClass}
          />
        </Field>
      </Section>

      <Section title="Layout for figures">
        <Field label="Figure naming / title convention">
          <textarea
            disabled={disabled}
            value={form.figureLayout}
            onChange={set("figureLayout")}
            className={areaClass}
          />
        </Field>
      </Section>

      <Section title="Citation format">
        <Field
          label="Citation style"
          hint={
            citationOptions.length > 1
              ? "IGNORE skips citation checks"
              : "Free plan: APA or IGNORE only — upgrade for MLA & IEEE"
          }
        >
          <select
            disabled={disabled}
            value={citationValue === "" && String(form.citationFormat || "") === "" ? "" : citationValue || "APA"}
            onChange={set("citationFormat")}
            className={inputClass}
          >
            {citationValue === "" && String(form.citationFormat || "") === "" ? (
              <option value="">Choose…</option>
            ) : null}
            <option value="IGNORE">IGNORE</option>
            {citationOptions.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
        </Field>
      </Section>
      </div>
    </div>
  );
}
