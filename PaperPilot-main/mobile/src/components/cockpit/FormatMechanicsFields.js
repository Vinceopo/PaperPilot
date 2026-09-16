/**
 * Format Fields — shared editable form for Customize and AI Upload modes (RN).
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../../theme";

const ORIENTATIONS = ["Portrait", "Landscape"];
const CITATIONS = ["APA", "MLA", "IEEE", "CHICAGO"];
const SPACING_HINTS = ["1", "1.5", "2"];
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

function ChipRow({ options, value, onSelect, disabled }) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            disabled={disabled}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
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
            placeholder="1.5"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
          />
          <ChipRow
            options={SPACING_HINTS}
            value={form.spacing}
            onSelect={(v) => set("spacing", v)}
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
