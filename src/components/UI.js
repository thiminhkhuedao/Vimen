// src/components/UI.js
// Every shared component used across all screens.
import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  Modal, StyleSheet, ActivityIndicator, Switch,
} from "react-native";
import { T, SS, initials } from "../styles/tokens";
import { useTranslation } from "../hooks/i18n/index.js";

/* ── Btn ─────────────────────────────────────────────── */
export function Btn({ variant = "primary", size = "md", onPress, children, disabled = false, style }) {
  const bg = {
    primary: T.brand,
    ghost:   "transparent",
    danger:  T.redBg,
    success: T.greenBg,
  }[variant] ?? T.brand;

  const color = {
    primary: "#fff",
    ghost:   T.text,
    danger:  T.red,
    success: T.green,
  }[variant] ?? "#fff";

  const pd = size === "sm" ? { paddingHorizontal: 12, paddingVertical: 7 }
           : size === "lg" ? { paddingHorizontal: 24, paddingVertical: 14 }
           :                 { paddingHorizontal: 18, paddingVertical: 10 };

  const fs = size === "sm" ? 13 : size === "lg" ? 16 : 14;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[{
        backgroundColor: bg,
        borderRadius: T.r.md,
        borderWidth: variant === "ghost" ? 1 : 0,
        borderColor: T.borderMed,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
        flexDirection: "row",
        gap: 6,
        ...pd,
      }, style]}
    >
      {typeof children === "string" || Array.isArray(children)
        ? <Text style={{ color, fontSize: fs, fontWeight: "600" }}>{children}</Text>
        : children}
    </TouchableOpacity>
  );
}

/* ── Badge ───────────────────────────────────────────── */
export function Badge({ color = "gray", children }) {
  const styles = {
    green:  [T.greenBg, T.green],
    amber:  [T.amberBg, T.amber],
    red:    [T.redBg,   T.red],
    brand:  [T.brandLight, T.brand],
    blue:   [T.blueBg,  T.blue],
    gray:   [T.surface2, T.muted],
  };
  const [bg, fg] = styles[color] || styles.gray;
  return (
    <View style={{ backgroundColor: bg, borderRadius: T.r.full, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{children}</Text>
    </View>
  );
}

/* ── Avatar ──────────────────────────────────────────── */
export function Avatar({ name = "?", size = 36, index = 0 }) {
  const color = T.avatarColors[index % T.avatarColors.length];
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ color: "#fff", fontSize: size * 0.36, fontWeight: "700" }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/* ── Card ────────────────────────────────────────────── */
export function Card({ children, style, onPress }) {
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[SS.card, style]}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[SS.card, style]}>{children}</View>;
}

/* ── SectionTitle ────────────────────────────────────── */
export function SectionTitle({ children, action }) {
  return (
    <View style={[SS.spaceBetween, { marginBottom: 12 }]}>
      <Text style={SS.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

/* ── Field ───────────────────────────────────────────── */
export function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={SS.label}>{label}</Text>
      {children}
    </View>
  );
}

/* ── Input ───────────────────────────────────────────── */
export function Input({ style, multiline, numberOfLines, ...props }) {
  return (
    <TextInput
      style={[SS.input, multiline && { height: numberOfLines ? numberOfLines * 22 : 80, textAlignVertical: "top" }, style]}
      placeholderTextColor={T.hint}
      multiline={multiline}
      numberOfLines={numberOfLines}
      {...props}
    />
  );
}

/* ── MetricCard ──────────────────────────────────────── */
export function MetricCard({ label, value, sub, icon, accent = false }) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: T.surface,
      borderRadius: T.r.lg,
      borderWidth: 1,
      borderColor: T.border,
      borderLeftWidth: accent ? 3 : 1,
      borderLeftColor: accent ? T.brand : T.border,
      padding: 16,
    }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: T.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
            {label}
          </Text>
          <Text style={{ fontSize: 24, fontWeight: "800", color: T.text, letterSpacing: -0.5 }}>{value}</Text>
          {sub && <Text style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{sub}</Text>}
        </View>
        {icon && <Text style={{ fontSize: 20, opacity: 0.4 }}>{icon}</Text>}
      </View>
    </View>
  );
}

/* ── EmptyState ──────────────────────────────────────── */
export function EmptyState({ icon = "📋", message, action }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 24 }}>
      <Text style={{ fontSize: 36, opacity: 0.4, marginBottom: 12 }}>{icon}</Text>
      <Text style={{ fontSize: 14, color: T.muted, textAlign: "center", marginBottom: action ? 16 : 0 }}>{message}</Text>
      {action}
    </View>
  );
}

/* ── Spinner ─────────────────────────────────────────── */
export function Spinner({ color = T.brand }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 48 }}>
      <ActivityIndicator color={color} size="large" />
    </View>
  );
}

/* ── Divider ─────────────────────────────────────────── */
export function Divider({ style }) {
  return <View style={{ height: 1, backgroundColor: T.border, marginVertical: 14, ...style }} />;
}

/* ── BottomSheet Modal ───────────────────────────────── */
export function Sheet({ visible, onClose, title, children, height = "75%" }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        backgroundColor: T.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: height,
        minHeight: 200,
        paddingBottom: 32,
      }}>
        {/* Handle */}
        <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: T.surface3 }} />
        </View>
        {title && (
          <View style={[SS.spaceBetween, { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border }]}>
            <Text style={{ fontSize: 17, fontWeight: "700" }}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 24, color: T.hint, lineHeight: 28 }}>×</Text>
            </TouchableOpacity>
          </View>
        )}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16 }}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ── ConfirmSheet ────────────────────────────────────── */
export function ConfirmSheet({ visible, onClose, onConfirm, title, message, confirmLabel, danger = true }) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} height="40%">
      {message && <Text style={{ fontSize: 14, color: T.muted, marginBottom: 20, lineHeight: 20 }}>{message}</Text>}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Btn variant="ghost" style={{ flex: 1 }} onPress={onClose}>{t("common.cancel")}</Btn>
        <Btn variant={danger ? "danger" : "primary"} style={{ flex: 1 }} onPress={onConfirm}>{confirmLabel ?? t("common.delete")}</Btn>
      </View>
    </Sheet>
  );
}

/* ── Toggle (wraps Switch) ───────────────────────────── */
export function Toggle({ value, onValueChange }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: T.surface3, true: T.brand }}
      thumbColor="#fff"
    />
  );
}

/* ── SettingRow ──────────────────────────────────────── */
export function SettingRow({ label, sub, value, onValueChange }) {
  return (
    <View style={[SS.spaceBetween, { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border }]}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "500", color: T.text }}>{label}</Text>
        {sub && <Text style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{sub}</Text>}
      </View>
      <Toggle value={value} onValueChange={onValueChange} />
    </View>
  );
}

/* ── InfoRow ─────────────────────────────────────────── */
export function InfoRow({ icon, value }) {
  if (!value) return null;
  return (
    <View style={[SS.row, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border, gap: 10 }]}>
      <Text style={{ fontSize: 15 }}>{icon}</Text>
      <Text style={{ fontSize: 13, color: T.muted, flex: 1 }}>{value}</Text>
    </View>
  );
}

/* ── SelectPicker (simple, supports optional groups) ─── */
// options can be either:
//   ["A","B","C"]                              — flat list (existing behaviour)
//   [{ label:"Group", options:["A","B"] }, ...] — grouped sections with headers
export function SelectPicker({ value, options, onChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isGrouped = options.length > 0 && typeof options[0] === "object" && options[0] !== null && "options" in options[0];

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[SS.input, SS.spaceBetween]}
      >
        <Text style={{ fontSize: 15, color: value ? T.text : T.hint }}>{value || t("common.selectPlaceholder")}</Text>
        <Text style={{ color: T.muted }}>▾</Text>
      </TouchableOpacity>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t("common.selectOption")} height="70%">
        {isGrouped ? (
          options.map(group => (
            <View key={group.label} style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: T.muted, textTransform: "uppercase", letterSpacing: 0.6, paddingTop: 14, paddingBottom: 6 }}>
                {group.label}
              </Text>
              {group.options.map(opt => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => { onChange(opt); setOpen(false); }}
                  style={[SS.spaceBetween, { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border }]}
                >
                  <Text style={{ fontSize: 15, color: T.text }}>{opt}</Text>
                  {value === opt && <Text style={{ color: T.brand, fontWeight: "700" }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ))
        ) : (
          options.map(opt => (
            <TouchableOpacity
              key={opt}
              onPress={() => { onChange(opt); setOpen(false); }}
              style={[SS.spaceBetween, { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border }]}
            >
              <Text style={{ fontSize: 15, color: T.text }}>{opt}</Text>
              {value === opt && <Text style={{ color: T.brand, fontWeight: "700" }}>✓</Text>}
            </TouchableOpacity>
          ))
        )}
      </Sheet>
    </>
  );
}
