/**
 * Format Fields — editable form for Customize, Upload extract, and Saved mechanics.
 * Values shown are the actual rules (from extraction, saved profile, or sample starter).
 */

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const LINE_SPACING_OPTIONS = [
  { value: "1", label: "1 (Single)" },
  { value: "1.15" },
  { value: "1.5", label: "1.5 (One and a half)" },
  { value: "2", label: "2 (Double)" },
];
const FONT_FAMILY_OPTIONS = ["Times New Roman", "Arial", "Calibri", "Cambria", "Georgia", "Garamond"].map(
  (value) => ({ value })
);
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
          <Field label="Indention" hint="e.g. 0.5 inch, 1/2 inch, 1.27 cm">
            <input
              disabled={disabled}
              value={form.indention}
              onChange={set("indention")}
              className={inputClass}
            />
          </Field>
          <Field label="Alignment" hint="Body text alignment">
            <select
              disabled={disabled}
              value={form.alignment || ""}
              onChange={set("alignment")}
              className={inputClass}
            >
              <option value="">Left or justified (not specified)</option>
              <option value="Justified">Justified</option>
              <option value="Left">Left</option>
              <option value="Center">Center</option>
              <option value="Right">Right</option>
            </select>
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
          <Field label="Heading 1 size">
            <input
              disabled={disabled}
              type="number"
              min="6"
              max="72"
              step="0.5"
              value={form.fontHeading1Size}
              onChange={set("fontHeading1Size")}
              className={inputClass}
            />
          </Field>
          <Field label="Heading 2 size">
            <input
              disabled={disabled}
              type="number"
              min="6"
              max="72"
              step="0.5"
              value={form.fontHeading2Size}
              onChange={set("fontHeading2Size")}
              className={inputClass}
            />
          </Field>
          <Field label="Heading 3 and Content size">
            <input
              disabled={disabled}
              type="number"
              min="6"
              max="72"
              step="0.5"
              value={form.fontHeading3Size}
              onChange={set("fontHeading3Size")}
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

      <Section title="Pagination">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Position">
            <input
              disabled={disabled}
              value={form.paginationPosition}
              onChange={set("paginationPosition")}
              className={inputClass}
            />
          </Field>
          <Field label="First page of each chapter">
            <input
              disabled={disabled}
              value={form.paginationFirstPageRule}
              onChange={set("paginationFirstPageRule")}
              className={inputClass}
            />
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
        <Field label="Citation style">
          <select
            disabled={disabled}
            value={form.citationFormat}
            onChange={set("citationFormat")}
            className={inputClass}
          >
            <option value="APA">APA</option>
            <option value="MLA">MLA</option>
            <option value="IEEE">IEEE</option>
            <option value="CHICAGO">Chicago</option>
          </select>
        </Field>
      </Section>
      </div>
    </div>
  );
}
