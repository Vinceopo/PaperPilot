/**
 * Format Fields — editable form for Customize, Upload extract, and Saved mechanics (RN).
 * Values shown are the actual rules (from extraction, saved profile, or sample starter).
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../../theme";
import SelectField from "../ui/SelectField";
import { ChevronDownIcon, CloseIcon, TrashIcon } from "../shell/icons";
import { supportedCitationStyle } from "../../lib/formatMechanicsForm";
import {
  BODY_NUMBERING_OPTIONS,
  CHAPTER_FIRST_PAGE_OPTIONS,
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

const ORIENTATION_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "Portrait", label: "Portrait" },
  { value: "Landscape", label: "Landscape" },
];
const ALIGNMENT_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "Justified", label: "Justified" },
  { value: "Left", label: "Left" },
  { value: "Center", label: "Center" },
  { value: "Right", label: "Right" },
];
const CITATION_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "APA", label: "APA" },
  { value: "MLA", label: "MLA" },
  { value: "IEEE", label: "IEEE" },
];
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
const MARGINS = [
  ["marginTop", "Top"],
  ["marginLeft", "Left"],
  ["marginBottom", "Bottom"],
  ["marginRight", "Right"],
  ["marginGutter", "Gutter"],
  ["marginHeader", "Header"],
  ["marginFooter", "Footer"],
];

function Field({ label, hint, children, style, labelStyle }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.label, labelStyle]}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** Free-text input with a dropdown that always lists every preset, whatever is typed. */
function ComboInput({ value, onChange, options, disabled }) {
  const [open, setOpen] = useState(false);
  const current = String(value ?? "").trim().toLowerCase();

  function choose(option) {
    onChange(option.value);
    setOpen(false);
  }

  return (
    <View>
      <View>
        <TextInput
          editable={!disabled}
          style={[styles.input, styles.comboInput, disabled && styles.inputDisabled]}
          value={value == null ? "" : String(value)}
          onChangeText={onChange}
          placeholderTextColor={colors.muted}
        />
        <Pressable
          style={[styles.comboToggle, disabled && styles.comboToggleDisabled]}
          disabled={disabled}
          onPress={() => setOpen((v) => !v)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Show choices"
        >
          <View style={open ? styles.chevronOpen : null}>
            <ChevronDownIcon size={14} color={colors.slate} />
          </View>
        </Pressable>
      </View>
      {open ? (
        <View style={styles.comboList} accessibilityRole="menu">
          {options.map((option) => {
            const selected = option.value.toLowerCase() === current;
            return (
              <Pressable
                key={option.value}
                style={({ pressed }) => [styles.comboOption, pressed && styles.comboOptionPressed]}
                onPress={() => choose(option)}
                accessibilityRole="menuitem"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.comboOptionText, selected && styles.comboOptionSelected]}>
                  {option.label || option.value}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Select with a "Not checked" choice; a saved value outside the list stays selectable. */
function ChoiceSelect({ value, onChange, options, disabled, title, emptyLabel = "Not checked" }) {
  const items = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : { ...option, label: option.label || option.value }
  );
  const current = String(value ?? "");
  if (current && !items.some((item) => item.value === current)) {
    items.push({ value: current, label: `${current} (custom)` });
  }
  return (
    <SelectField
      title={title}
      value={current}
      options={[{ value: "", label: emptyLabel }, ...items]}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

export default function FormatMechanicsFields({
  form,
  onChange,
  disabled = false,
  title = "Format Fields",
  nameError = "",
  nameInputRef,
}) {
  function set(key, value) {
    onChange?.({ ...form, [key]: value });
  }
  const headings = Array.isArray(form.headings) ? form.headings : [];
  function updateHeading(index, update) {
    set(
      "headings",
      headings.map((heading, i) => (i === index ? update(heading) : heading))
    );
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
  function input(key, extra = {}) {
    return (
      <TextInput
        editable={!disabled}
        style={[styles.input, disabled && styles.inputDisabled, extra.multiline && styles.area]}
        value={form[key] == null ? "" : String(form[key])}
        onChangeText={(v) => set(key, v)}
        placeholderTextColor={colors.muted}
        textAlignVertical={extra.multiline ? "top" : "center"}
        {...extra}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerHint}>Edit any rule to customize</Text>
      </View>

      <View style={styles.body}>
        <Field label="Profile name">
          <TextInput
            ref={nameInputRef}
            editable={!disabled}
            style={[styles.input, disabled && styles.inputDisabled, nameError ? styles.inputError : null]}
            value={form.name}
            onChangeText={(v) => set("name", v)}
            placeholderTextColor={colors.muted}
          />
          {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        </Field>

        <Section title="Paper">
          <Field label="Size">{input("paperSize")}</Field>
          <Field label="Orientation">
            <SelectField
              title="Orientation"
              value={form.paperOrientation || ""}
              options={ORIENTATION_OPTIONS}
              onChange={(v) => set("paperOrientation", v)}
              disabled={disabled}
            />
          </Field>
          <Field label="Substance" hint="Paper weight">
            {input("paperSubstance", { keyboardType: "decimal-pad" })}
          </Field>
          <Field label="Spacing" hint="Pick a choice or type your own, e.g. 1.5 or Double">
            <ComboInput
              disabled={disabled}
              value={form.spacing}
              onChange={(v) => set("spacing", v)}
              options={LINE_SPACING_OPTIONS}
            />
          </Field>
          <Field label="Word spacing" hint="Spaces between words and after periods">
            <ChoiceSelect
              title="Word spacing"
              disabled={disabled}
              value={form.wordSpacing}
              onChange={(v) => set("wordSpacing", v)}
              options={WORD_SPACING_OPTIONS}
            />
          </Field>
          <Field label="Indention" hint="e.g. 0.5 inch, 1/2 inch, 1.27 cm">
            {input("indention")}
          </Field>
          <Field label="Alignment" hint="Body text alignment — leave blank to skip this check">
            <SelectField
              title="Alignment"
              value={form.alignment || ""}
              options={ALIGNMENT_OPTIONS}
              onChange={(v) => set("alignment", v)}
              disabled={disabled}
            />
          </Field>
          <Field label="Landscape pages" hint="When pages may be turned sideways">
            <ChoiceSelect
              title="Landscape pages"
              disabled={disabled}
              value={form.paperLandscapePages}
              onChange={(v) => set("paperLandscapePages", v)}
              options={LANDSCAPE_OPTIONS}
            />
          </Field>
        </Section>

        <Section title="Margins">
          <View style={styles.grid}>
            {MARGINS.map(([key, label]) => (
              <Field key={key} label={label} style={styles.gridCell}>
                {input(key, { keyboardType: "decimal-pad" })}
              </Field>
            ))}
          </View>
        </Section>

        <Section title="Font">
          <Field label="Body text size" hint="Paragraph text, in points">
            {input("bodySize", { keyboardType: "decimal-pad" })}
          </Field>
          <Field label="Type" hint="Font family">
            <ComboInput
              disabled={disabled}
              value={form.fontType}
              onChange={(v) => set("fontType", v)}
              options={FONT_FAMILY_OPTIONS}
            />
          </Field>
          <Field label="Color">
            <ComboInput
              disabled={disabled}
              value={form.fontColor}
              onChange={(v) => set("fontColor", v)}
              options={FONT_COLOR_OPTIONS}
            />
          </Field>
        </Section>

        <Section title="Headings">
          <Text style={styles.hint}>
            Filled from your uploaded format. Edit only if a value does not match your guide.
          </Text>
          {headings.length ? null : (
            <Text style={styles.hint}>
              No heading rules were found yet. Add a level only if your guide defines one.
            </Text>
          )}
          {headings.map((heading, index) => {
            const label = headingLabel(index);
            const shown = HEADING_RULE_FIELDS.filter((field) => heading.fields?.includes(field.key));
            const missing = HEADING_RULE_FIELDS.filter((field) => !heading.fields?.includes(field.key));
            return (
              <View key={index} style={styles.headingCard}>
                <View style={styles.headingTop}>
                  <Text style={styles.label}>{label}</Text>
                  {disabled ? null : (
                    <Pressable
                      onPress={() => set("headings", headings.filter((_, i) => i !== index))}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${label}`}
                    >
                      <TrashIcon size={15} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
                {shown.length ? (
                  <View style={styles.grid}>
                    {shown.map((field) => (
                      <View key={field.key} style={styles.gridCell}>
                        <View style={styles.ruleTop}>
                          <Text style={[styles.label, styles.subLabel]}>{field.label}</Text>
                          {disabled ? null : (
                            <Pressable
                              onPress={() => removeHeadingRule(index, field.key)}
                              hitSlop={8}
                              style={styles.ruleRemove}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${field.label} from ${label}`}
                            >
                              <CloseIcon size={12} color={colors.muted} />
                            </Pressable>
                          )}
                        </View>
                        {field.key === "size" ? (
                          <TextInput
                            editable={!disabled}
                            style={[styles.input, disabled && styles.inputDisabled]}
                            value={heading.size == null ? "" : String(heading.size)}
                            onChangeText={(v) => setHeadingValue(index, "size", v)}
                            keyboardType="decimal-pad"
                            placeholderTextColor={colors.muted}
                          />
                        ) : (
                          <ChoiceSelect
                            title={`${label} · ${field.label}`}
                            disabled={disabled}
                            value={heading[field.key]}
                            onChange={(v) => setHeadingValue(index, field.key, v)}
                            options={field.options}
                          />
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.hint}>No rules set for this heading.</Text>
                )}
                {!disabled && missing.length ? (
                  <View style={styles.chipRow}>
                    {missing.map((field) => (
                      <Pressable
                        key={field.key}
                        onPress={() => addHeadingRule(index, field.key)}
                        style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${field.label} to ${label}`}
                      >
                        <Text style={styles.chipText}>+ {field.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
          {!disabled && headings.length < MAX_HEADING_LEVELS ? (
            <Pressable
              onPress={() => set("headings", [...headings, emptyHeading()])}
              style={({ pressed }) => [styles.addLevel, pressed && styles.chipPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.addLevelText}>+ Add heading level</Text>
            </Pressable>
          ) : null}
        </Section>

        <Section title="Pagination">
          <Field label="Position" hint="Where page numbers sit on normal pages">
            <ChoiceSelect
              title="Position"
              disabled={disabled}
              value={form.paginationPosition}
              onChange={(v) => set("paginationPosition", v)}
              options={PAGE_POSITIONS}
            />
          </Field>
          <Field label="Title page" hint="Document page 1">
            <ChoiceSelect
              title="Title page"
              disabled={disabled}
              value={form.paginationTitlePage}
              onChange={(v) => set("paginationTitlePage", v)}
              options={TITLE_PAGE_OPTIONS}
            />
          </Field>
          <Field label="First page of each chapter">
            <ChoiceSelect
              title="First page of each chapter"
              disabled={disabled}
              value={form.paginationFirstPageRule}
              onChange={(v) => set("paginationFirstPageRule", v)}
              options={CHAPTER_FIRST_PAGE_OPTIONS}
            />
          </Field>
          <Field label="Preliminary pages" hint="Pages before Chapter 1">
            <ChoiceSelect
              title="Preliminary pages"
              disabled={disabled}
              value={form.paginationPreliminaryStyle}
              onChange={(v) => set("paginationPreliminaryStyle", v)}
              options={PRELIMINARY_STYLE_OPTIONS}
            />
          </Field>
          <Field label="Body numbering" hint="From Chapter 1 onward">
            <ChoiceSelect
              title="Body numbering"
              disabled={disabled}
              value={form.paginationBodyNumbering}
              onChange={(v) => set("paginationBodyNumbering", v)}
              options={BODY_NUMBERING_OPTIONS}
            />
          </Field>
        </Section>

        <Section title="Page breaks">
          <Field label="Page break rules">{input("pageBreaks", { multiline: true })}</Field>
        </Section>

        <Section title="Layout for tables">
          <Field label="Table naming / title convention">{input("tableLayout", { multiline: true })}</Field>
        </Section>

        <Section title="Layout for figures">
          <Field label="Figure naming / title convention">{input("figureLayout", { multiline: true })}</Field>
        </Section>

        <Section title="Citation format">
          <Field label="Citation style" hint="Leave blank to skip citation checks">
            <SelectField
              title="Citation style"
              value={supportedCitationStyle(form.citationFormat)}
              options={CITATION_OPTIONS}
              onChange={(v) => set("citationFormat", v)}
              disabled={disabled}
            />
          </Field>
        </Section>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(226,232,240,0.8)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.slate,
  },
  headerHint: { fontSize: 10, color: colors.muted },
  body: { paddingHorizontal: 16, paddingVertical: 16, gap: 16 },
  section: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(226,232,240,0.8)",
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.accentText,
  },
  field: {},
  label: { fontSize: 11, fontWeight: "600", color: "#475569" },
  hint: { marginTop: 4, fontSize: 10, color: colors.muted },
  input: {
    marginTop: 6,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#334155",
  },
  inputDisabled: { backgroundColor: "#f8fafc" },
  area: { height: 76, paddingTop: 8, paddingBottom: 8 },
  inputError: { borderColor: "#fb7185", backgroundColor: colors.roseBg },
  errorText: { marginTop: 4, fontSize: 11, color: colors.rose },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6, rowGap: 12 },
  gridCell: { width: "50%", paddingHorizontal: 6 },
  comboInput: { paddingRight: 34 },
  comboToggle: {
    position: "absolute",
    right: 0,
    top: 6,
    bottom: 0,
    width: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  comboToggleDisabled: { opacity: 0.4 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  comboList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.white,
    paddingVertical: 4,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  comboOption: { paddingHorizontal: 12, paddingVertical: 9 },
  comboOptionPressed: { backgroundColor: "#e6f9f4" },
  comboOptionText: { fontSize: 13, color: "#334155" },
  comboOptionSelected: { fontWeight: "600", color: "#109b89" },
  subLabel: { marginTop: 6, fontWeight: "400", color: "#64748b" },
  headingCard: {
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.white,
    padding: 12,
  },
  headingTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  ruleTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  ruleRemove: { marginTop: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipPressed: { backgroundColor: "#e6f9f4" },
  chipText: { fontSize: 11, fontWeight: "600", color: colors.slate },
  addLevel: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addLevelText: { fontSize: 12, fontWeight: "600", color: "#475569" },
});
