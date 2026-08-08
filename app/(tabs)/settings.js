// app/(tabs)/settings.js

import { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Alert, Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/supabase";
import { updateProfile } from "../../src/lib/db";
import { Card, Btn, Avatar, Field, Input, SelectPicker, Divider } from "../../src/components/UI";
import { T, SS } from "../../src/styles/tokens";
import { VERTICALS, getVerticalForProfession, getProfileFields } from "../../src/lib/professions";
import { useTranslation } from "../../src/hooks/i18n/index.js";

export default function SettingsScreen() {
  const insets       = useSafeAreaInsets();
  const { profile, setProfile, loading } = useProfile();
  const { t, lang, setLanguage, languages } = useTranslation();
  const signOut = () => supabase.auth.signOut();
  const [tab,    setTab]    = useState("account");
  const [form,   setForm]   = useState({});
  const [saving, setSaving] = useState(false);

  const PROFESSION_GROUPS = Object.values(VERTICALS)
    .filter(v => v.id !== "other")
    .map(v => ({ label: `${v.icon}  ${v.label}`, options: v.professions }))
    .concat([{ label: t("settings.account.otherProfession"), options: [t("settings.account.otherProfession")] }]);

  const TERMS = t("settings.terms");

  useEffect(() => {
    if (profile) setForm({
      name:            profile.name            ?? "",
      trade:           profile.trade           ?? "",
      email:           profile.email           ?? "",
      phone:           profile.phone           ?? "",
      bio:             profile.bio             ?? "",
      hourly_rate:     String(profile.hourly_rate ?? ""),
      bank_name:       profile.bank_name        ?? "",
      sort_code:       profile.sort_code        ?? "",
      account_number:  profile.account_number   ?? "",
      payment_terms:   profile.payment_terms    ?? "14 days",
      invoice_notes:   profile.invoice_notes    ?? "",
      booking_slug:    profile.booking_slug     ?? "",
      notif_email_booking:    profile.notif_email_booking    ?? true,
      notif_sms_paid:         profile.notif_sms_paid         ?? false,
      notif_weekly_digest:    profile.notif_weekly_digest    ?? true,
      notif_overdue_reminder: profile.notif_overdue_reminder ?? true,
      extra_fields:    profile.extra_fields     ?? {},
    });
  }, [profile]);

  const fields = getProfileFields(form.trade);
  const exFld  = key => val => setForm(p => ({ ...p, extra_fields: { ...p.extra_fields, [key]: val } }));

  async function save() {
    setSaving(true);
    const { data, error } = await updateProfile(profile.clerk_id, {
      ...form,
      hourly_rate: parseFloat(form.hourly_rate) || 0,
    });
    setSaving(false);
    if (error) { Alert.alert(t("settings.alerts.saveFailed")); return; }
    setProfile(data);
    Alert.alert(t("settings.alerts.saved"));
  }

  const fld = k => v => setForm(p => ({...p, [k]: v}));
  const tog = k => v => setForm(p => ({...p, [k]: v}));

  const tabs = [
    ["account",  t("settings.tabs.account")],
    ["payment",  t("settings.tabs.payment")],
    ["notifs",   t("settings.tabs.notifs")],
    ["plan",     t("settings.tabs.plan")],
    ["language", t("settings.tabs.language")],
  ];

  const PLANS = [
    { key: "free", name: t("settings.plan.plans.free.name"), price: t("settings.plan.plans.free.price"), features: t("settings.plan.plans.free.features"), hi: false },
    { key: "pro",  name: t("settings.plan.plans.pro.name"),  price: t("settings.plan.plans.pro.price"),  features: t("settings.plan.plans.pro.features"),  hi: true  },
  ];

  const NOTIF_ROWS = [
    ["notif_email_booking",    t("settings.notifs.emailBooking"),    t("settings.notifs.viaResend")],
    ["notif_sms_paid",         t("settings.notifs.smsPaid"),         t("settings.notifs.viaTwilio")],
    ["notif_weekly_digest",    t("settings.notifs.weeklyDigest"),    t("settings.notifs.viaResend")],
    ["notif_overdue_reminder", t("settings.notifs.overdueReminder"), t("settings.notifs.viaTwilio")],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Header */}
      <View style={{ backgroundColor: T.surface, paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: T.border }}>
        <View style={[SS.spaceBetween, { marginBottom: 14 }]}>
          <Text style={{ fontSize: 22, fontWeight: "900", color: T.text, letterSpacing: -0.5 }}>{t("settings.title")}</Text>
          {profile && <Avatar name={profile.name} size={36}/>}
        </View>
        {/* Tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={SS.row}>
            {tabs.map(([id, label]) => (
              <TouchableOpacity key={id} onPress={() => setTab(id)}
                style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: T.r.full, marginRight: 8, backgroundColor: tab === id ? T.brand : T.surface2 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: tab === id ? "#fff" : T.muted }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}>

        {/* ── ACCOUNT ── */}
        {tab === "account" && (
          <Card>
            {profile && (
              <View style={[SS.row, { gap: 14, marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: T.border }]}>
                <Avatar name={form.name || "?"} size={52}/>
                <View>
                  <Text style={{ fontWeight: "700", fontSize: 16 }}>{form.name || t("settings.account.yourName")}</Text>
                  <View style={{ flexDirection: "row", marginTop: 4 }}>
                    <View style={{ backgroundColor: getVerticalForProfession(form.trade).color.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: getVerticalForProfession(form.trade).color.text }}>
                        {getVerticalForProfession(form.trade).icon} {form.trade || t("settings.account.notSet")}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
            <Field label={t("settings.account.fullName")}><Input value={form.name ?? ""} onChangeText={fld("name")} autoCapitalize="words"/></Field>
            <Field label={t("settings.account.profession")}><SelectPicker value={form.trade ?? ""} options={PROFESSION_GROUPS} onChange={fld("trade")}/></Field>
            <Field label={t("settings.account.email")}><Input value={form.email ?? ""} onChangeText={fld("email")} keyboardType="email-address" autoCapitalize="none"/></Field>
            <Field label={t("settings.account.phone")}><Input value={form.phone ?? ""} onChangeText={fld("phone")} keyboardType="phone-pad"/></Field>
            <Field label={t("settings.account.bio")}><Input value={form.bio ?? ""} onChangeText={fld("bio")} multiline numberOfLines={3} placeholder={t("settings.account.bioPlaceholder")}/></Field>
            <Field label={t("settings.account.hourlyRate")}><Input value={form.hourly_rate ?? ""} onChangeText={fld("hourly_rate")} keyboardType="decimal-pad"/></Field>
            <Field label={t("settings.account.bookingSlug")}><Input value={form.booking_slug ?? ""} onChangeText={fld("booking_slug")} autoCapitalize="none" placeholder={t("settings.account.bookingSlugPlaceholder")}/></Field>

            {fields.length > 0 && (
              <>
                <Divider/>
                <Text style={{ fontSize: 15, fontWeight: "700", marginBottom: 4 }}>
                  {getVerticalForProfession(form.trade).label} {t("settings.account.detailsSuffix")}
                </Text>
                <Text style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>
                  {t("settings.account.extraFieldsHint")}
                </Text>
                {fields.map(field => (
                  <VerticalField key={field.key} field={field} value={form.extra_fields[field.key]} onChange={exFld(field.key)} t={t} />
                ))}
                <Divider/>
              </>
            )}

            <Btn onPress={save} disabled={saving} style={{ marginTop: 8 }}>{saving ? t("settings.account.saving") : t("settings.account.save")}</Btn>
          </Card>
        )}

        {/* ── PAYMENT ── */}
        {tab === "payment" && (
          <Card>
            <Text style={{ fontSize: 15, fontWeight: "700", marginBottom: 16 }}>{t("settings.payment.bankDetails")}</Text>
            <Field label={t("settings.payment.bankName")}><Input value={form.bank_name ?? ""} onChangeText={fld("bank_name")} placeholder={t("settings.payment.bankNamePlaceholder")}/></Field>
            <View style={[SS.row, { gap: 12 }]}>
              <View style={{ flex: 1 }}><Field label={t("settings.payment.sortCode")}><Input value={form.sort_code ?? ""} onChangeText={fld("sort_code")} placeholder={t("settings.payment.sortCodePlaceholder")}/></Field></View>
              <View style={{ flex: 1 }}><Field label={t("settings.payment.accountNumber")}><Input value={form.account_number ?? ""} onChangeText={fld("account_number")} placeholder={t("settings.payment.accountNumberPlaceholder")} keyboardType="number-pad"/></Field></View>
            </View>
            <Divider/>
            <Text style={{ fontSize: 15, fontWeight: "700", marginBottom: 12 }}>{t("settings.payment.invoiceDefaults")}</Text>
            <Field label={t("settings.payment.paymentTerms")}><SelectPicker value={form.payment_terms ?? "14 days"} options={TERMS} onChange={fld("payment_terms")}/></Field>
            <Field label={t("settings.payment.invoiceNotes")}><Input value={form.invoice_notes ?? ""} onChangeText={fld("invoice_notes")} multiline numberOfLines={2} placeholder={t("settings.payment.invoiceNotesPlaceholder")}/></Field>
            <Btn onPress={save} disabled={saving} style={{ marginTop: 8 }}>{saving ? t("settings.account.saving") : t("settings.payment.save")}</Btn>
          </Card>
        )}

        {/* ── NOTIFICATIONS ── */}
        {tab === "notifs" && (
          <Card>
            <Text style={{ fontSize: 15, fontWeight: "700", marginBottom: 16 }}>{t("settings.notifs.title")}</Text>
            {NOTIF_ROWS.map(([key, label, sub]) => (
              <View key={key} style={[SS.spaceBetween, { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border }]}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500" }}>{label}</Text>
                  <Text style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{sub}</Text>
                </View>
                <Switch value={!!form[key]} onValueChange={tog(key)} trackColor={{ false: T.surface3, true: T.brand }} thumbColor="#fff"/>
              </View>
            ))}
            <Btn onPress={save} disabled={saving} style={{ marginTop: 16 }}>{saving ? t("settings.account.saving") : t("settings.notifs.save")}</Btn>
          </Card>
        )}

        {/* ── PLAN ── */}
        {tab === "plan" && (
          <View>
            <Card style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", marginBottom: 6 }}>{t("settings.plan.current")}</Text>
              <View style={SS.row}>
                <View style={{ backgroundColor: profile?.plan === "pro" ? T.brandLight : T.surface2, borderRadius: T.r.full, paddingHorizontal: 14, paddingVertical: 5 }}>
                  <Text style={{ fontWeight: "700", color: profile?.plan === "pro" ? T.brand : T.muted, fontSize: 13 }}>
                    {profile?.plan === "pro" ? t("settings.plan.pro") : t("settings.plan.free")}
                  </Text>
                </View>
              </View>
            </Card>
            {PLANS.map(p => (
              <Card key={p.key} style={{ marginBottom: 12, borderWidth: p.hi ? 2 : 1, borderColor: p.hi ? T.brand : T.border }}>
                {p.hi && <View style={{ backgroundColor: T.brand, borderRadius: T.r.full, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 3, marginBottom: 8 }}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{t("settings.plan.mostPopular")}</Text>
                </View>}
                <Text style={{ fontSize: 17, fontWeight: "800", marginBottom: 2 }}>{p.name}</Text>
                <Text style={{ fontSize: 26, fontWeight: "900", color: p.hi ? T.brand : T.text, letterSpacing: -1, marginBottom: 12 }}>{p.price}</Text>
                {p.features.map(f => (
                  <View key={f} style={[SS.row, { gap: 8, marginBottom: 6 }]}>
                    <Text style={{ color: p.hi ? T.brand : T.green }}>✓</Text>
                    <Text style={{ fontSize: 13, color: T.muted }}>{f}</Text>
                  </View>
                ))}
                {profile?.plan !== p.key && (
                  <Btn style={{ marginTop: 12 }} variant={p.hi ? "primary" : "ghost"} onPress={() => Alert.alert(t("settings.plan.comingSoonTitle"), t("settings.plan.comingSoonMsg"))}>
                    {p.hi ? t("settings.plan.upgrade") : t("settings.plan.downgrade")}
                  </Btn>
                )}
                {profile?.plan === p.key && (
                  <View style={{ marginTop: 12, alignItems: "center" }}>
                    <Text style={{ color: T.brand, fontWeight: "700", fontSize: 13 }}>{t("settings.plan.currentPlanLabel")}</Text>
                  </View>
                )}
              </Card>
            ))}
            <Btn variant="danger" onPress={() => Alert.alert(t("settings.plan.signOutConfirmTitle"), t("settings.plan.signOutConfirmMsg"), [{ text:t("settings.plan.cancel"),style:"cancel" },{ text:t("settings.plan.signOut"),style:"destructive",onPress:signOut }])} style={{ marginTop: 8 }}>
              {t("settings.plan.signOut")}
            </Btn>
          </View>
        )}

        {/* ── LANGUAGE ── */}
        {tab === "language" && (
          <View>
            <Text style={{ fontSize:15, fontWeight:"700", marginBottom:6 }}>{t("settings.language.title")}</Text>
            <Text style={{ fontSize:13, color:T.muted, marginBottom:16 }}>
              {t("settings.language.subtitle")}
            </Text>
            {languages.map(l => (
              <TouchableOpacity key={l.code} onPress={() => setLanguage(l.code)}
                style={{
                  flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                  padding:18, borderRadius:T.r.lg, marginBottom:10,
                  borderWidth:2, borderColor:lang===l.code?T.brand:T.border,
                  backgroundColor:lang===l.code?T.brandLight:T.surface,
                }}>
                <View>
                  <Text style={{ fontSize:16, fontWeight:"700", color:lang===l.code?T.brand:T.text }}>{l.nativeLabel}</Text>
                  <Text style={{ fontSize:13, color:T.muted, marginTop:2 }}>{l.label}</Text>
                </View>
                {lang===l.code && <Text style={{ fontSize:20, color:T.brand }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/* ── VerticalField ───────────────────────────────────── */
function VerticalField({ field, value, onChange, t }) {
  if (field.type === "boolean") {
    return (
      <View style={[SS.spaceBetween, { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border }]}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: "500" }}>{field.label}</Text>
          {field.helpText && <Text style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{field.helpText}</Text>}
        </View>
        <Switch value={!!value} onValueChange={onChange} trackColor={{ false: T.surface3, true: T.brand }} thumbColor="#fff"/>
      </View>
    );
  }

  if (field.type === "list") {
    const items = Array.isArray(value) ? value : [];
    const addItem    = () => onChange([...items, {}]);
    const removeItem = idx => onChange(items.filter((_, i) => i !== idx));
    const updateItem = (idx, key, val) => onChange(items.map((it, i) => i === idx ? { ...it, [key]: val } : it));

    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 13, fontWeight: "500", color: T.muted, marginBottom: 8 }}>{field.label}</Text>
        {items.map((item, idx) => (
          <View key={idx} style={{ backgroundColor: T.surface2, borderRadius: T.r.md, padding: 10, marginBottom: 8 }}>
            {field.itemFields.map(itf => (
              <Input key={itf.key} value={item[itf.key] ?? ""} placeholder={itf.placeholder}
                onChangeText={v => updateItem(idx, itf.key, v)} style={{ marginBottom: 6 }}/>
            ))}
            <TouchableOpacity onPress={() => removeItem(idx)} style={{ alignSelf: "flex-end" }}>
              <Text style={{ color: T.red, fontSize: 13, fontWeight: "600" }}>{t("settings.vertical.remove")}</Text>
            </TouchableOpacity>
          </View>
        ))}
        <Btn variant="ghost" size="sm" onPress={addItem}>
          {t("settings.vertical.addItem", { item: field.label.toLowerCase().replace(/s$/, "") })}
        </Btn>
      </View>
    );
  }

  // default: text
  return (
    <Field label={field.label}>
      <Input value={value ?? ""} placeholder={field.placeholder} onChangeText={onChange}/>
    </Field>
  );
}