/**
 * Format Fields — editable form for Customize, Upload extract, and Saved mechanics.
 * Values shown are the actual rules (from extraction, saved profile, or sample starter).
 */

import { supportedCitationStyle } from "../../lib/formatMechanicsForm.js";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import {
  BODY_NUMBERING_OPTIONS,
  CHAPTER_FIRST_PAGE_OPTIONS,
  CHAPTER_MARKER_OPTIONS,
  FONT_FAMILIES,
  HEADING_RULE_FIELDS,
  LANDSCAPE_OPTIONS,
  MAX_HEADING_LEVELS,
  PAGE_POSITIONS,
  PRELIMINARY_STYLE_OPTIONS,
  TITLE_PAGE_OPTIONS,
  WORD_SPACING_OPTIONS,
  emptyHeading,
  headingLabel,
} from "../../lib/mechanicsOptions";
import { isIgnoreFormValue } from "../../lib/formatMechanicsForm.js";

const LINE_SPACING_OPTIONS = [
  { value: "1", label: "1 (Single)" },
  { value: "1.15" },
  { value: "1.5", label: "1.5 (One and a half)" },
  { value: "2", label: "2 (Double)" },
];
const FONT_FAMILY_OPTIONS = FONT_FAMILIES.map((value) => ({ value }));
const FONT_COLOR_OPTIONS = ["Black/Automatic", "Black", "Automatic"].map((value) => ({ value }));

const inputClass =
  "mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#16bfa8] disabled:bg-slate-50";
const areaClass =
  "mt-1.5 min-h-[4.5rem] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#16bfa8] disabled:bg-slate-50";

function Field({ label, children, hint }) {
  return (
    <label className="block text-[11px] font-semibold text-slate-600">
      {label}
      {children}
      {hint ? <span className="mt-1 block text-[10px] font-normal text-slate-400">{hint}</span> : null}
    </label>
  );
}

/** Free-text input with a dropdown that always lists every preset, whatever is typed. */
function ComboInput({ value, onChange, options, disabled }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();
  const current = String(value ?? "").trim().toLowerCase();

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openList() {
    setActive(options.findIndex((o) => o.value.toLowerCase() === current));
    setOpen(true);
  }

  function choose(option) {
    onChange(option.value);
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      choose(options[active]);
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
        aria-label="Show choices"
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
          className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((option, index) => {
            const selected = option.value.toLowerCase() === current;
            return (
              <li
                key={option.value}
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

/** Select with an IGNORE (no rule) choice; a saved value outside the list stays selectable. */
function ChoiceSelect({ value, onChange, options, disabled, emptyLabel = "IGNORE" }) {
  const items = options.map((option) => (typeof option === "string" ? { value: option } : option));
  const current = String(value ?? "");
  if (current && current !== "IGNORE" && !items.some((item) => item.value === current)) {
    items.push({ value: current, label: `${current} (custom)` });
  }
  return (
    <select disabled={disabled} value={current} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      {current === "" ? <option value="">Choose…</option> : null}
      <option value="IGNORE">{emptyLabel}</option>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label || item.value}
        </option>
      ))}
    </select>
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

export default function FormatMechanicsFields({ form, onChange, disabled, title = "Format Fields" }) {
  function set(key) {
    return (e) => onChange?.({ ...form, [key]: e.target.value });
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
        <p className="text-[10px] text-slate-400">Edit any rule to customize</p>
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
          <Field label="Size">
            <input
              disabled={disabled}
              value={form.paperSize}
              onChange={set("paperSize")}
              className={inputClass}
            />
          </Field>
          <Field label="Orientation">
            <select
              disabled={disabled}
              value={form.paperOrientation}
              onChange={set("paperOrientation")}
              className={inputClass}
            >
              {String(form.paperOrientation || "") === "" ? <option value="">Choose…</option> : null}
              <option value="IGNORE">IGNORE</option>
              <option value="Portrait">Portrait</option>
              <option value="Landscape">Landscape</option>
            </select>
          </Field>
          <Field label="Substance" hint="Paper weight">
            <input
              disabled={disabled}
              value={form.paperSubstance}
              onChange={set("paperSubstance")}
              className={inputClass}
            />
          </Field>
          <Field label="Spacing" hint="Pick a choice or type your own, e.g. 1.5 or Double">
            <ComboInput
              disabled={disabled}
              value={form.spacing}
              onChange={setValue("spacing")}
              options={LINE_SPACING_OPTIONS}
            />
          </Field>
          <Field label="Word spacing" hint="Spaces between words and after periods">
            <ChoiceSelect
              disabled={disabled}
              value={form.wordSpacing}
              onChange={setValue("wordSpacing")}
              options={WORD_SPACING_OPTIONS}
            />
          </Field>
          <Field label="Indention" hint="e.g. 0.5 inch, 1/2 inch, 1.27 cm">
            <input
              disabled={disabled}
              value={form.indention}
              onChange={set("indention")}
              className={inputClass}
            />
          </Field>
          <Field label="Alignment" hint="Body text alignment — IGNORE skips this check">
            <select
              disabled={disabled}
              value={form.alignment || ""}
              onChange={set("alignment")}
              className={inputClass}
            >
              {String(form.alignment || "") === "" ? <option value="">Choose…</option> : null}
              <option value="IGNORE">IGNORE</option>
              <option value="Justified">Justified</option>
              <option value="Left">Left</option>
              <option value="Center">Center</option>
              <option value="Right">Right</option>
            </select>
          </Field>
          <Field label="Landscape pages" hint="When pages may be turned sideways">
            <ChoiceSelect
              disabled={disabled}
              value={form.paperLandscapePages}
              onChange={setValue("paperLandscapePages")}
              options={LANDSCAPE_OPTIONS}
            />
          </Field>
        </div>
      </Section>

      <Section title="Margins">
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
              <input
                disabled={disabled}
                type="number"
                min="0"
                max="5"
                step="0.05"
                value={form[key]}
                onChange={set(key)}
                className={inputClass}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Font">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Body text size" hint="Same as Contents Size — not heading size">
            <input
              disabled={disabled}
              type="number"
              min="6"
              max="72"
              step="0.5"
              value={form.bodySize}
              onChange={set("bodySize")}
              className={inputClass}
            />
          </Field>
          <Field label="Type" hint="Font family">
            <ComboInput
              disabled={disabled}
              value={form.fontType}
              onChange={setValue("fontType")}
              options={FONT_FAMILY_OPTIONS}
            />
          </Field>
          <Field label="Color">
            <ComboInput
              disabled={disabled}
              value={form.fontColor}
              onChange={setValue("fontColor")}
              options={FONT_COLOR_OPTIONS}
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
                        <input
                          disabled={disabled}
                          type="number"
                          min="6"
                          max="72"
                          step="0.5"
                          value={heading.size}
                          onChange={(e) => setHeadingValue(index, "size", e.target.value)}
                          className={inputClass}
                        />
                      ) : (
                        <ChoiceSelect
                          disabled={disabled}
                          value={heading[field.key]}
                          onChange={(value) => setHeadingValue(index, field.key, value)}
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
          <Field label="Position" hint="Where page numbers sit on normal pages">
            <ChoiceSelect
              disabled={disabled}
              value={form.paginationPosition}
              onChange={setValue("paginationPosition")}
              options={PAGE_POSITIONS}
            />
          </Field>
          <Field label="Title page" hint="Document page 1">
            <ChoiceSelect
              disabled={disabled}
              value={form.paginationTitlePage}
              onChange={setValue("paginationTitlePage")}
              options={TITLE_PAGE_OPTIONS}
            />
          </Field>
          <Field label="First page of each chapter">
            <ChoiceSelect
              disabled={disabled}
              value={form.paginationFirstPageRule}
              onChange={setValue("paginationFirstPageRule")}
              options={CHAPTER_FIRST_PAGE_OPTIONS}
            />
          </Field>
          <Field label="Preliminary pages" hint="Pages before Chapter 1">
            <ChoiceSelect
              disabled={disabled}
              value={form.paginationPreliminaryStyle}
              onChange={setValue("paginationPreliminaryStyle")}
              options={PRELIMINARY_STYLE_OPTIONS}
            />
          </Field>
          <Field label="Body numbering" hint="From Chapter 1 onward">
            <ChoiceSelect
              disabled={disabled}
              value={form.paginationBodyNumbering}
              onChange={setValue("paginationBodyNumbering")}
              options={BODY_NUMBERING_OPTIONS}
            />
          </Field>
          <Field
            label="Chapter starts"
            hint="How chapter headings are written — set IGNORE if your guide does not specify this"
          >
            <select
              disabled={disabled}
              className={inputClass}
              value={
                isIgnoreFormValue(form.paginationChapterMarkers)
                  ? "IGNORE"
                  : Array.isArray(form.paginationChapterMarkers) && form.paginationChapterMarkers.length
                    ? form.paginationChapterMarkers.join(",")
                    : ""
              }
              onChange={(e) => {
                const next = e.target.value;
                if (next === "IGNORE") {
                  onChange?.({ ...form, paginationChapterMarkers: "IGNORE" });
                } else if (!next) {
                  onChange?.({ ...form, paginationChapterMarkers: [] });
                } else {
                  onChange?.({
                    ...form,
                    paginationChapterMarkers: next.split(",").map((part) => part.trim()).filter(Boolean),
                  });
                }
              }}
            >
              {!(
                isIgnoreFormValue(form.paginationChapterMarkers) ||
                (Array.isArray(form.paginationChapterMarkers) && form.paginationChapterMarkers.length)
              ) ? (
                <option value="">Choose…</option>
              ) : null}
              <option value="IGNORE">IGNORE</option>
              <option value="chapter_roman,chapter_arabic">
                CHAPTER I… and Chapter 1… (both)
              </option>
              {CHAPTER_MARKER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Page breaks">
        <Field label="Page break rules">
          <textarea
            disabled={disabled}
            value={form.pageBreaks}
            onChange={set("pageBreaks")}
            className={areaClass}
          />
        </Field>
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
        <Field label="Citation style" hint="IGNORE skips citation checks">
          <select
            disabled={disabled}
            value={
              /^ignore$/i.test(String(form.citationFormat || "").trim())
                ? "IGNORE"
                : supportedCitationStyle(form.citationFormat)
            }
            onChange={set("citationFormat")}
            className={inputClass}
          >
            {String(form.citationFormat || "") === "" ? <option value="">Choose…</option> : null}
            <option value="IGNORE">IGNORE</option>
            <option value="APA">APA</option>
            <option value="MLA">MLA</option>
            <option value="IEEE">IEEE</option>
          </select>
        </Field>
      </Section>
      </div>
    </div>
  );
}
