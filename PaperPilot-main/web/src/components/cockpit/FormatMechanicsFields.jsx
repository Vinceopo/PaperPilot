/**
 * Format Fields — editable form for Customize, Upload extract, and Saved mechanics.
 * Values shown are the actual rules (from extraction, saved profile, or sample starter).
 */

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
          <Field label="Spacing" hint="Line spacing">
            <input
              disabled={disabled}
              value={form.spacing}
              onChange={set("spacing")}
              list="pp-line-spacing"
              className={inputClass}
            />
            <datalist id="pp-line-spacing">
              <option value="1" />
              <option value="1.5" />
              <option value="2" />
            </datalist>
          </Field>
          <Field label="Indention">
            <input
              disabled={disabled}
              value={form.indention}
              onChange={set("indention")}
              className={inputClass}
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
            <input
              disabled={disabled}
              value={form.fontType}
              onChange={set("fontType")}
              list="pp-font-families"
              className={inputClass}
            />
            <datalist id="pp-font-families">
              {["Times New Roman", "Arial", "Calibri", "Cambria", "Georgia", "Garamond"].map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Field>
          <Field label="Color">
            <input
              disabled={disabled}
              value={form.fontColor}
              onChange={set("fontColor")}
              list="pp-font-colors"
              className={inputClass}
            />
            <datalist id="pp-font-colors">
              <option value="Black/Automatic" />
              <option value="Black" />
              <option value="Automatic" />
            </datalist>
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
