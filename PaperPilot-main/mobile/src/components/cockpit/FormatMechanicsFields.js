/**
 * Format Fields — shared editable form for Customize and AI Upload modes (RN).
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../../theme";
import {
  BODY_NUMBERING_OPTIONS,
  CHAPTER_FIRST_PAGE_OPTIONS,
  CHAPTER_MARKER_OPTIONS,
  HEADING_LEVELS,
  HEADING_STYLE_FIELDS,
  LANDSCAPE_OPTIONS,
  PAGE_POSITIONS,
  PRELIMINARY_STYLE_OPTIONS,
  TITLE_PAGE_OPTIONS,
  WORD_SPACING_OPTIONS,
  emptyHeadingStyles,
} from "../../lib/mechanicsOptions";

const ORIENTATIONS = ["Portrait", "Landscape"];
const CITATIONS = ["APA", "MLA", "IEEE", "CHICAGO"];
const SPACING_HINTS = ["1", "1.5", "2"];
const ALIGNMENTS = ["Justified", "Left", "Center", "Right"];
const FONT_HINTS = ["Times New Roman", "Arial", "Calibri", "Cambria", "Georgia", "Garamond"];

function Field({ label, hint, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function Section({ title, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHead}
        onPress={collapsible ? () => setOpen((v) => !v) : undefined}
        disabled={!collapsible}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        {collapsible ? (
          <Text style={styles.sectionToggle}>{open ? "−" : "+"}</Text>
        ) : null}
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function ChipRow({ options, value, onSelect, disabled, isActive }) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const opt = typeof option === "string" ? { value: option } : option;
        const active = isActive ? isActive(opt.value) : value === opt.value;
        return (
          <Pressable
            key={opt.value}
            disabled={disabled}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(opt.value)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label || opt.value}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Single choice; tapping the selected chip clears it ("Not checked"). Shows a saved custom value too. */
function ChoiceChips({ options, value, onChange, disabled }) {
  const current = String(value ?? "");
  const items = options.map((option) => (typeof option === "string" ? { value: option } : option));
  if (current && !items.some((item) => item.value === current)) {
    items.push({ value: current, label: `${current} (custom)` });
  }
  return (
    <ChipRow
      options={items}
      value={current}
      onSelect={(v) => onChange(current === v ? "" : v)}
      disabled={disabled}
    />
  );
}

export default function FormatMechanicsFields({
  form,
  onChange,
  disabled = false,
  title = "Format Fields",
}) {
  function set(key, value) {
    onChange?.({ ...form, [key]: value });
  }
  const headingStyles = form.headingStyles || emptyHeadingStyles();
  function setHeadingStyle(level, key, value) {
    set("headingStyles", { ...headingStyles, [level]: { ...headingStyles[level], [key]: value } });
  }
  const chapterMarkers = Array.isArray(form.paginationChapterMarkers) ? form.paginationChapterMarkers : [];
  function toggleChapterMarker(key) {
    set(
      "paginationChapterMarkers",
      chapterMarkers.includes(key) ? chapterMarkers.filter((item) => item !== key) : [...chapterMarkers, key]
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerHint}>All fields are editable</Text>
      </View>

      <Field label="Profile name">
        <TextInput
          editable={!disabled}
          style={styles.input}
          value={form.name}
          onChangeText={(v) => set("name", v)}
          placeholder="e.g. Capstone Format Guide"
          placeholderTextColor={colors.muted}
        />
      </Field>

      <Section title="Paper">
        <Field label="Size" hint="e.g. 8.5 x 11">
          <TextInput
            editable={!disabled}
            style={styles.input}
            value={form.paperSize}
            onChangeText={(v) => set("paperSize", v)}
            placeholder="8.5 x 11"
            placeholderTextColor={colors.muted}
          />
        </Field>
        <Field label="Orientation">
          <ChipRow
            options={ORIENTATIONS}
            value={form.paperOrientation || "Portrait"}
            onSelect={(v) => set("paperOrientation", v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Substance" hint="Paper weight, e.g. 20">
          <TextInput
            editable={!disabled}
            style={styles.input}
            value={form.paperSubstance}
            onChangeText={(v) => set("paperSubstance", v)}
            placeholder="20"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
          />
        </Field>
        <Field label="Spacing" hint="Line spacing, e.g. 1.5">
          <TextInput
            editable={!disabled}
            style={styles.input}
            value={form.spacing}
            onChangeText={(v) => set("spacing", v)}
            placeholder="1.5 or Double"
            placeholderTextColor={colors.muted}
          />
          <ChipRow
            options={SPACING_HINTS}
            value={form.spacing}
            onSelect={(v) => set("spacing", v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Word spacing" hint="Tap again to stop checking">
          <ChoiceChips
            options={WORD_SPACING_OPTIONS}
            value={form.wordSpacing}
            onChange={(v) => set("wordSpacing", v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Indention" hint="e.g. 1 tab or 0.5 inch">
          <TextInput
            editable={!disabled}
            style={styles.input}
            value={form.indention}
            onChangeText={(v) => set("indention", v)}
            placeholder="0.5 inch"
            placeholderTextColor={colors.muted}
          />
        </Field>
        <Field label="Alignment" hint="Body text alignment (leave unselected for left or justified)">
          <ChipRow
            options={ALIGNMENTS}
            value={form.alignment}
            onSelect={(v) => set("alignment", form.alignment === v ? "" : v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Landscape pages" hint="When pages may be turned sideways">
          <ChoiceChips
            options={LANDSCAPE_OPTIONS}
            value={form.paperLandscapePages}
            onChange={(v) => set("paperLandscapePages", v)}
            disabled={disabled}
          />
        </Field>
      </Section>

      <Section title="Margins" collapsible defaultOpen={false}>
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
            <TextInput
              editable={!disabled}
              style={styles.input}
              value={form[key]}
              onChangeText={(v) => set(key, v)}
              placeholder="1"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
            />
          </Field>
        ))}
      </Section>

      <Section title="Font" collapsible defaultOpen={false}>
        <Field label="Heading 1 size">
          <TextInput
            editable={!disabled}
            style={styles.input}
            value={form.fontHeading1Size}
            onChangeText={(v) => set("fontHeading1Size", v)}
            placeholder="16"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
          />
        </Field>
        <Field label="Heading 2 size">
          <TextInput
            editable={!disabled}
            style={styles.input}
            value={form.fontHeading2Size}
            onChangeText={(v) => set("fontHeading2Size", v)}
            placeholder="14"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
          />
        </Field>
        <Field label="Heading 3 and Content size">
          <TextInput
            editable={!disabled}
            style={styles.input}
            value={form.fontHeading3Size}
            onChangeText={(v) => set("fontHeading3Size", v)}
            placeholder="12"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
          />
        </Field>
        <Field label="Type" hint="Font family">
          <TextInput
            editable={!disabled}
            style={styles.input}
            value={form.fontType}
            onChangeText={(v) => set("fontType", v)}
            placeholder="Times New Roman"
            placeholderTextColor={colors.muted}
          />
          <ChipRow
            options={FONT_HINTS}
            value={form.fontType}
            onSelect={(v) => set("fontType", v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Color">
          <TextInput
            editable={!disabled}
            style={styles.input}
            value={form.fontColor}
            onChangeText={(v) => set("fontColor", v)}
            placeholder="Black/Automatic"
            placeholderTextColor={colors.muted}
          />
        </Field>
      </Section>

      <Section title="Heading styles" collapsible defaultOpen={false}>
        {HEADING_LEVELS.map(({ key: level, label }) => (
          <View key={level} style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            {HEADING_STYLE_FIELDS.map((field) => (
              <ChoiceChips
                key={field.key}
                options={field.options}
                value={headingStyles[level]?.[field.key]}
                onChange={(v) => setHeadingStyle(level, field.key, v)}
                disabled={disabled}
              />
            ))}
          </View>
        ))}
        <Text style={styles.hint}>Tap a selected choice again to stop checking it.</Text>
      </Section>

      <Section title="Pagination" collapsible defaultOpen={false}>
        <Field label="Position" hint="Where page numbers sit on normal pages">
          <ChoiceChips
            options={PAGE_POSITIONS}
            value={form.paginationPosition}
            onChange={(v) => set("paginationPosition", v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Title page" hint="Document page 1">
          <ChoiceChips
            options={TITLE_PAGE_OPTIONS}
            value={form.paginationTitlePage}
            onChange={(v) => set("paginationTitlePage", v)}
            disabled={disabled}
          />
        </Field>
        <Field label="First page of each chapter">
          <ChoiceChips
            options={CHAPTER_FIRST_PAGE_OPTIONS}
            value={form.paginationFirstPageRule}
            onChange={(v) => set("paginationFirstPageRule", v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Preliminary pages" hint="Pages before Chapter 1">
          <ChoiceChips
            options={PRELIMINARY_STYLE_OPTIONS}
            value={form.paginationPreliminaryStyle}
            onChange={(v) => set("paginationPreliminaryStyle", v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Body numbering" hint="From Chapter 1 onward">
          <ChoiceChips
            options={BODY_NUMBERING_OPTIONS}
            value={form.paginationBodyNumbering}
            onChange={(v) => set("paginationBodyNumbering", v)}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Chapter starts"
          hint="Headings that begin a new chapter page. None selected uses CHAPTER I and Chapter 1 styles."
        >
          <ChipRow
            options={CHAPTER_MARKER_OPTIONS}
            isActive={(key) => chapterMarkers.includes(key)}
            onSelect={toggleChapterMarker}
            disabled={disabled}
          />
        </Field>
      </Section>

      <Section title="Citation format" collapsible defaultOpen={false}>
        <Field label="Citation style">
          <ChipRow
            options={CITATIONS}
            value={String(form.citationFormat || "APA").toUpperCase()}
            onSelect={(v) => set("citationFormat", v)}
            disabled={disabled}
          />
        </Field>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    padding: 14,
    gap: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.slate,
  },
  headerHint: { fontSize: 10, color: colors.muted },
  section: {
    borderTopWidth: 1,
    borderTopColor: "rgba(226,232,240,0.9)",
    paddingTop: 12,
    marginTop: 8,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.accentText,
  },
  sectionToggle: { fontSize: 16, fontWeight: "700", color: colors.slate },
  sectionBody: { gap: 4 },
  field: { marginBottom: 10 },
  label: { fontSize: 11, fontWeight: "700", color: "#475569" },
  hint: { marginTop: 4, fontSize: 10, color: colors.muted },
  input: {
    marginTop: 6,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    fontSize: 13,
    color: colors.text,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  chipText: { fontSize: 11, fontWeight: "600", color: colors.slate },
  chipTextActive: { color: colors.accentText },
});
