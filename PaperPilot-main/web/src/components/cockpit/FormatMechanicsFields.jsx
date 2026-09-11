/**
 * Format Fields — shared editable form for Customize and AI Upload modes.
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
    <div className="space-y-4 rounded-xl border border-slate-200 bg-[#f8f9fb] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
        <p className="text-[10px] text-slate-400">All fields are editable</p>
      </div>

      <Field label="Profile name">
        <input
          disabled={disabled}
          value={form.name}
          onChange={set("name")}
          placeholder="e.g. Capstone Format Guide"
          className={inputClass}
        />
      </Field>

      <Section title="Paper">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Size" hint="e.g. 8.5 x 11">
            <input
              disabled={disabled}
              value={form.paperSize}
              onChange={set("paperSize")}
              placeholder="8.5 x 11"
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
          <Field label="Substance" hint="Paper weight, e.g. 20">
            <input
              disabled={disabled}
              value={form.paperSubstance}
              onChange={set("paperSubstance")}
              placeholder="20"
              className={inputClass}
            />
          </Field>
          <Field label="Spacing" hint="Line spacing, e.g. 1.5">
            <input
              disabled={disabled}
              value={form.spacing}
              onChange={set("spacing")}
              placeholder="1.5"
              list="pp-line-spacing"
              className={inputClass}
            />
            <datalist id="pp-line-spacing">
              <option value="1" />
              <option value="1.5" />
              <option value="2" />
            </datalist>
          </Field>
          <Field label="Indention" hint="e.g. 1 tab or 0.5 inch">
            <input
              disabled={disabled}
              value={form.indention}
              onChange={set("indention")}
              placeholder="0.5 inch"
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
                placeholder="1"
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
              placeholder="16"
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
              placeholder="14"
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
              placeholder="12"
              className={inputClass}
            />
          </Field>
          <Field label="Type" hint="Font family">
            <input
              disabled={disabled}
              value={form.fontType}
              onChange={set("fontType")}
              placeholder="Times New Roman"
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
              placeholder="Black/Automatic"
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
          <Field label="Position" hint="e.g. top right, no extra characters">
            <input
              disabled={disabled}
              value={form.paginationPosition}
              onChange={set("paginationPosition")}
              placeholder="Top right"
              className={inputClass}
            />
          </Field>
          <Field label="First page of each chapter" hint="e.g. no page number shown">
            <input
              disabled={disabled}
              value={form.paginationFirstPageRule}
              onChange={set("paginationFirstPageRule")}
              placeholder="No page number shown"
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section title="Page breaks">
        <Field label="Page break rules" hint="e.g. only when starting a new chapter">
          <textarea
            disabled={disabled}
            value={form.pageBreaks}
            onChange={set("pageBreaks")}
            placeholder="Only when starting a new chapter"
            className={areaClass}
          />
        </Field>
      </Section>

      <Section title="Layout for tables">
        <Field label="Table naming / title convention" hint='e.g. Table <name> above a TABLE TITLE caption'>
          <textarea
            disabled={disabled}
            value={form.tableLayout}
            onChange={set("tableLayout")}
            placeholder='Table <name> above a "TABLE TITLE" caption'
            className={areaClass}
          />
        </Field>
      </Section>

      <Section title="Layout for figures">
        <Field
          label="Figure naming / title convention"
          hint="e.g. Figure <number>: Figure Title in bold/underlined below the figure"
        >
          <textarea
            disabled={disabled}
            value={form.figureLayout}
            onChange={set("figureLayout")}
            placeholder="Figure <number>: Figure Title in bold/underlined below the figure"
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
  );
}
