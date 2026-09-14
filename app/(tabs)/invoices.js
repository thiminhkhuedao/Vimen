// app/(tabs)/invoices.js
import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useProfile } from "../../src/hooks/useProfile";
import { getInvoices, getClients, getJobs, createInvoice, markInvoicePaid, deleteInvoice } from "../../src/lib/db";
import { createPaymentLink } from "../../src/lib/stripe";
import * as Clipboard from "expo-clipboard";
import { sendInvoiceEmail, sendInvoicePaidSMS } from "../../src/lib/notifications";
import { withTimeout } from "../../src/lib/withTimeout";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { Card, Btn, Badge, EmptyState, Spinner, Sheet, Field, Input, SelectPicker } from "../../src/components/UI";
import { T, SS, fmt, fmtDate, today } from "../../src/styles/tokens";

const STATUS_COLOR = { paid: "green", unpaid: "amber", overdue: "red" };
const MAX_RETRIES = 2;

export default function InvoicesScreen() {
  const insets        = useSafeAreaInsets();
  const { t }         = useTranslation();
  const { profile }   = useProfile();
  const { getToken }  = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [clients,  setClients]  = useState([]);
  const [jobs,     setJobs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError,setLoadError] = useState(null);
  const [filter,   setFilter]   = useState("all");
  const [addOpen,  setAddOpen]  = useState(false);
  const [detailInv,setDetailInv]= useState(null);
  const [busy, setBusy] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState({});

  const load = useCallback(async (refresh = false, attempt = 0) => {
    if (!profile?.id) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    setLoadError(null);

    try {
      const [{ data: i }, { data: c }, { data: j }] = await withTimeout(
        Promise.all([
          getInvoices(profile.id), getClients(profile.id), getJobs(profile.id),
        ]),
        8000,
        "invoices load"
      );
      setInvoices(i ?? []);
      setClients(c ?? []);
      setJobs(j ?? []);
      if (refresh) setRefreshing(false); else setLoading(false);

    } catch (err) {
      // Same fix as index.js/clients.js/jobs.js: an uncaught network
      // error here used to leave `loading` stuck at true forever.
      console.error("[invoices] load() failed:", err);

      const isTransient = (err instanceof TypeError && /fetch/i.test(err.message))
        || /timed out/i.test(err.message);

      if (isTransient && attempt < MAX_RETRIES) {
        const delay = 600 * (attempt + 1);
        setTimeout(() => load(refresh, attempt + 1), delay);
        return;
      }

      setLoadError(err);
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const isOverdue = inv => inv.status === "unpaid" && inv.due_date && new Date(inv.due_date) < new Date();
  const statusOf  = inv => isOverdue(inv) ? "overdue" : inv.status;
  const filtered  = filter === "all" ? invoices : invoices.filter(i => statusOf(i) === filter);
  const paid      = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const unpaid    = invoices.filter(i => i.status === "unpaid").reduce((s, i) => s + Number(i.amount), 0);

  const statusLabel = s => s==="paid" ? t("invoices.status.paid") : s==="overdue" ? t("invoices.status.overdue") : t("invoices.status.unpaid");

  function openAdd() {
    setForm({ client_id: clients[0]?.id ?? "", job_id: "", amount: "", due_date: "" });
    setAddOpen(true);
  }

  async function handleCreate() {
    if (!form.client_id || !form.amount) { Alert.alert(t("invoices.selectClientAndAmount")); return; }
    setSaving(true);
    const { data, error } = await createInvoice(profile.id, {
      client_id: form.client_id, job_id: form.job_id || null,
      amount: parseFloat(form.amount), due_date: form.due_date || null, status: "unpaid",
    });
    setSaving(false);
    if (error) { Alert.alert(t("invoices.createFailed")); return; }
    setInvoices(prev => [data, ...prev]);
    setAddOpen(false);
  }

  async function handleMarkPaid(id) {
    const { data, error } = await markInvoicePaid(id);
    if (error) { Alert.alert(t("invoices.markPaidFailed")); return; }
    setInvoices(prev => prev.map(i => i.id === id ? data : i));
    setDetailInv(null);

    // SMS notification
    const inv = invoices.find(i => i.id === id);
    if (inv && profile?.notif_sms_paid && profile?.phone) {
      sendInvoicePaidSMS(inv, profile);
    }
  }

  async function handleSendEmail(inv) {
    if (!inv.client?.email) { Alert.alert(t("invoices.noClientEmail")); return; }
    const result = await sendInvoiceEmail(inv, profile);
    if (result.success) Alert.alert(t("invoices.emailedTitle"), t("invoices.emailedSentTo",{email:inv.client.email}));
    else Alert.alert(t("invoices.emailFailedTitle"), result.error);
  }

  async function handleStripeLink(inv) {
    setBusy(true);
    try {
      const token = await getToken();
      const result = await createPaymentLink(inv.id, token);
      if (!result) throw new Error("No result from Stripe");
      setInvoices(prev => prev.map(i =>
        i.id === inv.id ? { ...i, stripe_payment_link_url: result.url, stripe_payment_link_id: result.id } : i
      ));
      setDetailInv(prev => prev && prev.id === inv.id ? { ...prev, stripe_payment_link_url: result.url } : prev);
      Alert.alert(t("invoices.paymentLinkCreated") || "Payment link created");
    } catch (err) {
      console.error("[InvoicesScreen] Stripe payment link error:", err);
      Alert.alert(t("invoices.paymentLinkFailed") || "Failed to create payment link. Check your Stripe connection.");
    }
    setBusy(false);
  }

  async function handleCopyBankDetails(inv) {
    const lines = [
      profile.bank_name      && `${t("invoices.bankLabel")} ${profile.bank_name}`,
      profile.sort_code      && `${t("invoices.sortCodeLabel")} ${profile.sort_code}`,
      profile.account_number && `${t("invoices.accountLabel")} ${profile.account_number}`,
      `${t("invoices.referenceLabel")} ${inv.invoice_number}`,
    ].filter(Boolean).join("\n");
    await Clipboard.setStringAsync(lines);
    Alert.alert(t("invoices.bankDetailsCopied") || "Bank details copied");
  }

  function handleDelete(inv) {
    Alert.alert(
      t("invoices.deleteConfirmTitle") || "Delete this invoice?",
      t("invoices.deleteConfirmMessage") || "This can't be undone.",
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        {
          text: t("invoices.delete") || "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const { error } = await deleteInvoice(inv.id);
            setBusy(false);
            if (error) { Alert.alert(t("invoices.deleteFailed") || "Could not delete this invoice."); return; }
            setInvoices(prev => prev.filter(i => i.id !== inv.id));
            setDetailInv(null);
          },
        },
      ]
    );
  }

  if (loading) return <Spinner />;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Header */}
      <View style={{ backgroundColor: T.surface, paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: T.border }}>
        <View style={SS.spaceBetween}>
          <Text style={{ fontSize: 22, fontWeight: "900", color: T.text, letterSpacing: -0.5 }}>{t("nav.invoices")}</Text>
          <Btn size="sm" onPress={openAdd}>+ {t("invoices.newShort")}</Btn>
        </View>

        {/* Mini metrics */}
        <View style={[SS.row, { gap: 10, marginTop: 12 }]}>
          <View style={{ flex: 1, backgroundColor: T.greenBg, borderRadius: T.r.md, padding: 10 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: T.green, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("invoices.status.paid")}</Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: T.green }}>{fmt(paid)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: T.amberBg, borderRadius: T.r.md, padding: 10 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: T.amber, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("invoices.outstandingLabel")}</Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: T.amber }}>{fmt(unpaid)}</Text>
          </View>
        </View>

        {/* Filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View style={SS.row}>
            {[["all",t("invoices.tabAll")], ["unpaid",t("invoices.tabUnpaid")], ["paid",t("invoices.tabPaid")], ["overdue",t("invoices.tabOverdue")]].map(([id, label]) => (
              <TouchableOpacity key={id} onPress={() => setFilter(id)}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: T.r.full, marginRight: 8, backgroundColor: filter === id ? T.brand : T.surface2 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: filter === id ? "#fff" : T.muted }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {loadError && (
        <TouchableOpacity onPress={()=>load()} style={{ backgroundColor:T.redBg, marginHorizontal:16, marginTop:12, padding:12, borderRadius:10 }}>
          <Text style={{ color:T.red, fontSize:13, fontWeight:"600" }}>⚠️ {t("invoices.loadErrorRetry")}</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.brand}/>}
      >
        {filtered.length === 0
          ? <EmptyState icon="🧾" message={t("invoices.noneYet")} action={<Btn size="sm" onPress={openAdd}>+ {t("invoices.createFirst")}</Btn>}/>
          : filtered.map(inv => {
              const status = statusOf(inv);
              return (
                <TouchableOpacity key={inv.id} onPress={() => setDetailInv(inv)} activeOpacity={0.85}>
                  <Card style={{ marginBottom: 10 }}>
                    <View style={SS.spaceBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: T.brand, marginBottom: 2 }}>{inv.invoice_number}</Text>
                        <Text style={{ fontSize: 15, fontWeight: "600" }} numberOfLines={1}>{inv.client?.name ?? "—"}</Text>
                        <Text style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                          {fmtDate(inv.created_at)}{inv.due_date ? ` · ${t("invoices.dueShort")} ${fmtDate(inv.due_date)}` : ""}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 6 }}>
                        <Text style={{ fontSize: 18, fontWeight: "800" }}>{fmt(inv.amount)}</Text>
                        <Badge color={STATUS_COLOR[status] ?? "gray"}>{statusLabel(status)}</Badge>
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
        }
      </ScrollView>

      {/* Invoice detail sheet */}
      <Sheet visible={!!detailInv} onClose={() => setDetailInv(null)} title={detailInv?.invoice_number ?? ""} height="75%">
        {detailInv && (
          <>
            <View style={{ backgroundColor: T.surface2, borderRadius: T.r.md, padding: 14, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: T.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{t("invoices.billTo")}</Text>
              <Text style={{ fontSize: 15, fontWeight: "700" }}>{detailInv.client?.name}</Text>
              <Text style={{ fontSize: 13, color: T.muted }}>{detailInv.client?.email}</Text>
              <Text style={{ fontSize: 13, color: T.muted }}>{detailInv.client?.address}</Text>
            </View>
            <View style={SS.spaceBetween}>
              <Text style={{ fontSize: 13, color: T.muted }}>
                {detailInv.job?.title ?? t("invoices.servicesRendered")}
              </Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: T.brand }}>{fmt(detailInv.amount)}</Text>
            </View>
            <View style={[SS.row, { marginTop: 20, gap: 8, flexWrap: "wrap" }]}>
              {detailInv.status === "unpaid" && (
                <>
                  <Btn size="sm" variant="success" onPress={() => handleMarkPaid(detailInv.id)} style={{ flex: 1 }}>✓ {t("invoices.markPaidShort")}</Btn>
                  <Btn size="sm" onPress={() => handleSendEmail(detailInv)} style={{ flex: 1 }}>📧 {t("invoices.emailShort")}</Btn>
                </>
              )}
              {detailInv.stripe_payment_link_url ? (
                <Btn size="sm" variant="ghost" onPress={() => Linking.openURL(detailInv.stripe_payment_link_url)} style={{ flex: 1 }}>💳 {t("invoices.paymentLinkShort")}</Btn>
              ) : detailInv.status === "unpaid" && (
                <Btn size="sm" variant="ghost" onPress={() => handleStripeLink(detailInv)} disabled={busy} style={{ flex: 1 }}>
                  💳 {busy ? (t("invoices.creating") || "Creating...") : (t("invoices.createPaymentLink") || "Payment link")}
                </Btn>
              )}
              <Btn size="sm" variant="ghost" onPress={() => handleCopyBankDetails(detailInv)} style={{ flex: 1 }}>
                🏦 {t("invoices.copyBankDetails") || "Copy bank details"}
              </Btn>
              <Btn size="sm" variant="danger" onPress={() => handleDelete(detailInv)} disabled={busy} style={{ flex: 1 }}>
                🗑 {t("invoices.delete") || "Delete"}
              </Btn>
            </View>
          </>
        )}
      </Sheet>

      {/* Create invoice sheet */}
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title={t("invoices.newInvoice")} height="75%">
        <Field label={t("invoices.clientLabel")}>
          <SelectPicker value={clients.find(c => c.id === form.client_id)?.name ?? ""} options={clients.map(c => c.name)}
            onChange={name => { const cl = clients.find(c => c.name === name); if (cl) setForm(p => ({...p, client_id: cl.id, job_id: ""})); }}/>
        </Field>
        <Field label={t("invoices.linkedJobLabel")}>
          <SelectPicker value={jobs.find(j => j.id === form.job_id)?.title ?? t("invoices.noneOption")}
            options={[t("invoices.noneOption"), ...jobs.filter(j => (j.client_id ?? j.client?.id) === form.client_id).map(j => j.title)]}
            onChange={title => { const j = jobs.find(j => j.title === title); setForm(p => ({...p, job_id: j?.id ?? "", amount: j ? String(j.amount) : p.amount})); }}/>
        </Field>
        <View style={[SS.row, { gap: 12 }]}>
          <View style={{ flex: 1 }}><Field label={t("invoices.amountLabel")}><Input value={form.amount ?? ""} onChangeText={v => setForm(p => ({...p, amount: v}))} keyboardType="decimal-pad" placeholder="0.00"/></Field></View>
          <View style={{ flex: 1 }}><Field label={t("invoices.dueDateLabel")}><Input value={form.due_date ?? ""} onChangeText={v => setForm(p => ({...p, due_date: v}))} placeholder="YYYY-MM-DD"/></Field></View>
        </View>
        <Btn onPress={handleCreate} disabled={saving} style={{ marginTop: 8 }}>{saving ? t("invoices.creating") : t("invoices.createInvoiceButton")}</Btn>
      </Sheet>
    </View>
  );
}