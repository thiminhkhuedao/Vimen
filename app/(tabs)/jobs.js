// app/(tabs)/jobs.js
import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProfile } from "../../src/hooks/useProfile";
import { getJobs, getClients, createJob, updateJob, completeJob, deleteJob, createInvoice } from "../../src/lib/db";
import { sendJobReminderSMS, sendInvoiceEmail } from "../../src/lib/notifications";
import { supabase } from "../../src/lib/supabase";
import { withTimeout } from "../../src/lib/withTimeout";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { Card, Btn, Badge, Avatar, EmptyState, Spinner, Sheet, Field, Input, SelectPicker } from "../../src/components/UI";
import { T, SS, fmt, fmtDate, today } from "../../src/styles/tokens";

const STATUS_COLOR = { scheduled: "amber", completed: "green", cancelled: "red" };
const MAX_RETRIES = 2;

export default function JobsScreen() {
  const insets           = useSafeAreaInsets();
  const { t }            = useTranslation();
  const { profile }      = useProfile();
  const [jobs,     setJobs]     = useState([]);
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [loadError,setLoadError] = useState(null);
  const [tab,      setTab]      = useState("scheduled");
  const [addOpen,  setAddOpen]  = useState(false);
  const [editJob,  setEditJob]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState({});

  const load = useCallback(async (refresh = false, attempt = 0) => {
    if (!profile?.id) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    setLoadError(null);

    try {
      const [{ data: j }, { data: c }] = await withTimeout(
        Promise.all([getJobs(profile.id), getClients(profile.id)]),
        8000,
        "jobs load"
      );
      setJobs(j ?? []);
      setClients(c ?? []);
      if (refresh) setRefreshing(false); else setLoading(false);

    } catch (err) {
      // Same fix as index.js/clients.js: an uncaught network error
      // used to leave `loading` stuck at true forever. Catch it,
      // quietly retry transient network failures, then surface a
      // real error state if it keeps failing.
      console.error("[jobs] load() failed:", err);

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

  const scheduled = jobs.filter(j => j.status === "scheduled").sort((a,b) => a.date?.localeCompare(b.date));
  const completed = jobs.filter(j => j.status === "completed").sort((a,b) => b.date?.localeCompare(a.date));
  const current   = tab === "scheduled" ? scheduled : completed;

  const statusLabel = s => s==="scheduled" ? t("jobs.status.scheduled") : s==="completed" ? t("jobs.status.completed") : t("jobs.status.cancelled");

  function openAdd() {
    setEditJob(null);
    setForm({ client_id: clients[0]?.id ?? "", title: "", date: today(), time: "09:00", duration: "2", amount: "", notes: "" });
    setAddOpen(true);
  }

  function openEdit(job) {
    setEditJob(job);
    setForm({
      client_id: job.client_id ?? job.client?.id ?? "",
      title: job.title, date: job.date, time: job.time ?? "09:00",
      duration: String(job.duration ?? 1), amount: String(job.amount ?? ""), notes: job.notes ?? "",
    });
    setAddOpen(true);
  }

  async function handleAdd() {
    if (!form.title || !form.date || !form.client_id) { Alert.alert(t("jobs.fillRequiredFields")); return; }
    setSaving(true);
    const payload = {
      client_id: form.client_id, title: form.title, date: form.date,
      time: form.time, duration: parseFloat(form.duration) || 1,
      amount: parseFloat(form.amount) || 0, notes: form.notes,
    };
    if (editJob) {
      const { data, error } = await updateJob(editJob.id, payload);
      setSaving(false);
      if (error) { Alert.alert(t("jobs.updateFailed") || "Could not update this job."); return; }
      setJobs(prev => prev.map(j => j.id === editJob.id ? data : j));
    } else {
      const { data, error } = await createJob(profile.id, { ...payload, status: "scheduled" });
      setSaving(false);
      if (error) { Alert.alert(t("jobs.addFailed")); return; }
      setJobs(prev => [data, ...prev]);
    }
    setAddOpen(false);
  }

  async function handleComplete(id) {
    Alert.alert(t("jobs.markDoneConfirmTitle"), t("jobs.markDoneConfirmMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("jobs.markDoneAction"), onPress: async () => {
        const { data } = await completeJob(id);
        if (data) setJobs(prev => prev.map(j => j.id === id ? data : j));

        const job = jobs.find(j => j.id === id);
        const client = clients.find(c => c.id === (job?.client_id ?? job?.client?.id));
        if (client?.phone && profile?.phone) {
          sendJobReminderSMS(job, client, profile);
        }

        // Job terminé → facture créée et envoyée automatiquement, sauf s'il
        // en existe déjà une pour ce job (évite les doublons).
        await autoCreateAndSendInvoice(data ?? job, client);
      }},
    ]);
  }

  async function autoCreateAndSendInvoice(job, client) {
    if (!job) return;
    try {
      const { data: existing } = await supabase
        .from("invoices").select("id").eq("job_id", job.id).maybeSingle();
      if (existing) return; // déjà facturé, on ne duplique pas

      const { data: invoice, error: invErr } = await createInvoice(profile.id, {
        client_id: job.client_id ?? job.client?.id,
        job_id: job.id,
        amount: parseFloat(job.amount) || 0,
        due_date: null,
        status: "unpaid",
      });
      if (invErr) throw invErr;

      Alert.alert(t("jobs.invoiceAutoCreatedToast") || "Invoice created automatically");

      if (client?.email && invoice) {
        const invoiceWithClient = { ...invoice, client };
        const result = await sendInvoiceEmail(invoiceWithClient, profile);
        if (result.success) {
          await supabase.from("invoices")
            .update({ reminder_count: 1, last_reminder_sent_at: new Date().toISOString() })
            .eq("id", invoice.id);
        }
      }
    } catch (err) {
      console.error("[JobsScreen] auto invoice creation failed:", err);
      Alert.alert(t("jobs.invoiceAutoCreateFailedToast") || "Job completed, but the invoice could not be created automatically — add it manually.");
    }
  }

  async function handleDelete(id) {
    Alert.alert(t("jobs.deleteConfirmTitle"), t("jobs.deleteConfirmMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: async () => {
        await deleteJob(id);
        setJobs(prev => prev.filter(j => j.id !== id));
      }},
    ]);
  }

  const getClient = j => clients.find(c => c.id === (j.client_id ?? j.client?.id)) ?? j.client;

  if (loading) return <Spinner />;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Header */}
      <View style={{ backgroundColor: T.surface, paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: T.border }}>
        <View style={[SS.spaceBetween]}>
          <Text style={{ fontSize: 22, fontWeight: "900", color: T.text, letterSpacing: -0.5 }}>{t("nav.jobs")}</Text>
          <Btn size="sm" onPress={openAdd}>+ {t("jobs.newJobShort")}</Btn>
        </View>

        {/* Tabs */}
        <View style={[SS.row, { marginTop: 14, backgroundColor: T.surface2, borderRadius: T.r.md, padding: 3 }]}>
          {[["scheduled", t("jobs.scheduledTab",{count:scheduled.length})], ["completed", t("jobs.completedTab",{count:completed.length})]].map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setTab(id)} style={{
              flex: 1, paddingVertical: 7, borderRadius: T.r.sm, alignItems: "center",
              backgroundColor: tab === id ? T.surface : "transparent",
            }}>
              <Text style={{ fontSize: 13, fontWeight: tab === id ? "700" : "400", color: tab === id ? T.text : T.muted }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loadError && (
        <TouchableOpacity onPress={()=>load()} style={{ backgroundColor:T.redBg, marginHorizontal:16, marginTop:12, padding:12, borderRadius:10 }}>
          <Text style={{ color:T.red, fontSize:13, fontWeight:"600" }}>⚠️ {t("jobs.loadErrorRetry")}</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.brand}/>}
      >
        {current.length === 0
          ? <EmptyState icon={tab === "scheduled" ? "📋" : "✅"} message={tab === "scheduled" ? t("jobs.noUpcoming") : t("jobs.noCompletedYet")}
              action={tab === "scheduled" ? <Btn size="sm" onPress={openAdd}>+ {t("jobs.addFirst")}</Btn> : null}/>
          : current.map(j => {
              const cl = getClient(j);
              return (
                <Card key={j.id} style={{ marginBottom: 10 }}>
                  <View style={SS.spaceBetween}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", marginBottom: 4 }} numberOfLines={1}>{j.title}</Text>
                      <View style={[SS.row, { gap: 6, flexWrap: "wrap" }]}>
                        <Text style={{ fontSize: 12, color: T.muted }}>📅 {fmtDate(j.date)} {j.time}</Text>
                        {cl && <Text style={{ fontSize: 12, color: T.muted }}>· 👤 {cl.name}</Text>}
                        <Text style={{ fontSize: 12, color: T.muted }}>· ⏱ {j.duration}{t("jobs.hoursShort")}</Text>
                      </View>
                      {j.notes ? <Text style={{ fontSize: 12, color: T.hint, marginTop: 4 }} numberOfLines={1}>{j.notes}</Text> : null}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      {Number(j.amount) > 0 && <Text style={{ fontSize: 16, fontWeight: "800", color: T.text }}>{fmt(j.amount)}</Text>}
                      <Badge color={STATUS_COLOR[j.status] ?? "gray"}>{statusLabel(j.status)}</Badge>
                    </View>
                  </View>
                  <View style={[SS.row, { marginTop: 12, gap: 8 }]}>
                    {j.status === "scheduled" && (
                      <Btn size="sm" variant="success" onPress={() => handleComplete(j.id)} style={{ flex: 1 }}>✓ {t("jobs.markDoneAction")}</Btn>
                    )}
                    <Btn size="sm" variant="ghost" onPress={() => openEdit(j)} style={{ flex: j.status === "scheduled" ? 0 : 1 }}>{t("common.edit")}</Btn>
                    <Btn size="sm" variant="danger" onPress={() => handleDelete(j.id)} style={{ flex: j.status === "scheduled" ? 0 : 1 }}>{t("common.delete")}</Btn>
                  </View>
                </Card>
              );
            })
        }
      </ScrollView>

      {/* Add job sheet */}
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title={t("jobs.addNewJobTitle")} height="85%">
        <Field label={t("jobs.clientLabel")}>
          <SelectPicker value={clients.find(c => c.id === form.client_id)?.name ?? ""} options={clients.map(c => c.name)} onChange={name => { const cl = clients.find(c => c.name === name); if (cl) setForm(p => ({...p, client_id: cl.id})); }}/>
        </Field>
        <Field label={t("jobs.jobTitleLabel")}><Input value={form.title ?? ""} onChangeText={v => setForm(p => ({...p, title: v}))} placeholder="e.g. Consumer unit replacement" autoFocus/></Field>
        <View style={[SS.row, { gap: 12 }]}>
          <View style={{ flex: 1 }}><Field label={t("jobs.dateLabel")}><Input value={form.date ?? ""} onChangeText={v => setForm(p => ({...p, date: v}))} placeholder="YYYY-MM-DD"/></Field></View>
          <View style={{ flex: 1 }}><Field label={t("jobs.timeLabel")}><Input value={form.time ?? ""} onChangeText={v => setForm(p => ({...p, time: v}))} placeholder="09:00"/></Field></View>
        </View>
        <View style={[SS.row, { gap: 12 }]}>
          <View style={{ flex: 1 }}><Field label={t("jobs.durationLabel")}><Input value={form.duration ?? ""} onChangeText={v => setForm(p => ({...p, duration: v}))} keyboardType="decimal-pad"/></Field></View>
          <View style={{ flex: 1 }}><Field label={t("jobs.amountLabel")}><Input value={form.amount ?? ""} onChangeText={v => setForm(p => ({...p, amount: v}))} keyboardType="decimal-pad" placeholder="0.00"/></Field></View>
        </View>
        <Field label={t("jobs.notesLabel")}><Input value={form.notes ?? ""} onChangeText={v => setForm(p => ({...p, notes: v}))} placeholder={t("jobs.notesPlaceholder")} multiline numberOfLines={3}/></Field>
        <Btn onPress={handleAdd} disabled={saving} style={{ marginTop: 8 }}>{saving ? t("jobs.saving") : t("jobs.addJobButton")}</Btn>
      </Sheet>
    </View>
  );
}