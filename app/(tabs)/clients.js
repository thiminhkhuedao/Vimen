// app/(tabs)/clients.js
import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, Alert, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useProfile } from "../../src/hooks/useProfile";
import { getClients, getJobs, getInvoices, createClient, updateClient, deleteClient } from "../../src/lib/db";
import { withTimeout } from "../../src/lib/withTimeout";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { Card, Btn, Badge, Avatar, EmptyState, Spinner, Sheet, Field, Input } from "../../src/components/UI";
import { T, SS, fmt, fmtDate } from "../../src/styles/tokens";

const MAX_RETRIES = 2;

export default function ClientsScreen() {
  const insets      = useSafeAreaInsets();
  const router      = useRouter();
  const { t }       = useTranslation();
  const { profile } = useProfile();
  const [clients,  setClients]  = useState([]);
  const [jobs,     setJobs]     = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [loadError,setLoadError] = useState(null);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null); // client obj for detail
  const [formOpen, setFormOpen] = useState(false);
  const [editClient,setEditClient] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState({});
  const fv = k => v => setForm(p => ({...p, [k]: v}));

  const load = useCallback(async (refresh = false, attempt = 0) => {
    if (!profile?.id) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    setLoadError(null);

    try {
      const [{ data:c }, { data:j }, { data:i }] = await withTimeout(
        Promise.all([
          getClients(profile.id), getJobs(profile.id), getInvoices(profile.id),
        ]),
        8000,
        "clients load"
      );
      setClients(c ?? []); setJobs(j ?? []); setInvoices(i ?? []);
      if (refresh) setRefreshing(false); else setLoading(false);

    } catch (err) {
      // Same class of bug as index.js: an uncaught network error here
      // used to leave `loading` stuck at true forever. Now we catch
      // it, quietly retry a couple of times for transient network
      // failures, and otherwise surface a real error state.
      console.error("[clients] load() failed:", err);

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

  const AV_COLORS = ["#E8500A","#1A7F4B","#7C3AED","#0369A1","#B45309","#BE185D","#0F766E","#C2410C"];
  const filtered = clients.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email||"").toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setEditClient(null);
    setForm({ name:"", email:"", phone:"", address:"", notes:"" });
    setFormOpen(true);
  }
  function openEdit(c) {
    setEditClient(c);
    setForm({ name:c.name, email:c.email||"", phone:c.phone||"", address:c.address||"", notes:c.notes||"" });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.name) { Alert.alert(t("clients.nameRequired")); return; }
    setSaving(true);
    if (editClient) {
      const { data, error } = await updateClient(editClient.id, form);
      if (error) { Alert.alert(t("clients.updateFailed")); setSaving(false); return; }
      setClients(prev => prev.map(c => c.id === editClient.id ? data : c));
      if (selected?.id === editClient.id) setSelected(data);
    } else {
      const { data, error } = await createClient(profile.id, form);
      if (error) { Alert.alert(t("clients.addFailed")); setSaving(false); return; }
      setClients(prev => [...prev, data]);
    }
    setSaving(false);
    setFormOpen(false);
  }

  function handleDelete(c) {
    Alert.alert(t("clients.deleteConfirmTitle",{name:c.name}), t("clients.deleteConfirmMessage"), [
      { text:t("common.cancel"), style:"cancel" },
      { text:t("common.delete"), style:"destructive", onPress: async () => {
        await deleteClient(c.id);
        setClients(prev => prev.filter(x => x.id !== c.id));
        setSelected(null);
      }},
    ]);
  }

  const clientJobs     = selected ? jobs.filter(j => (j.client_id??j.client?.id) === selected.id) : [];
  const clientInvoices = selected ? invoices.filter(i => (i.client_id??i.client?.id) === selected.id) : [];
  const clientRevenue  = clientInvoices.filter(i => i.status==="paid").reduce((s,i) => s+Number(i.amount), 0);

  if (loading) return <Spinner />;

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      {/* Header */}
      <View style={{ backgroundColor:T.surface, paddingTop:insets.top+8, paddingBottom:14, paddingHorizontal:20, borderBottomWidth:1, borderBottomColor:T.border }}>
        <View style={[SS.spaceBetween, { marginBottom:12 }]}>
          <Text style={{ fontSize:22, fontWeight:"900", color:T.text, letterSpacing:-0.5 }}>{t("nav.clients")}</Text>
          <Btn size="sm" onPress={openAdd}>+ {t("common.add")}</Btn>
        </View>
        <TextInput
          style={{ backgroundColor:T.surface2, borderRadius:T.r.md, paddingHorizontal:14, paddingVertical:10, fontSize:14, color:T.text }}
          placeholder={t("clients.searchPlaceholder")} placeholderTextColor={T.hint}
          value={search} onChangeText={setSearch}
        />
      </View>

      {loadError && (
        <TouchableOpacity onPress={()=>load()} style={{ backgroundColor:T.redBg, marginHorizontal:16, marginTop:12, padding:12, borderRadius:10 }}>
          <Text style={{ color:T.red, fontSize:13, fontWeight:"600" }}>⚠️ {t("clients.loadErrorRetry")}</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={{ padding:16, paddingBottom:insets.bottom+90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor={T.brand}/>}
      >
        {filtered.length === 0
          ? <EmptyState icon="👥" message={t("clients.noneYet")} action={<Btn size="sm" onPress={openAdd}>+ {t("clients.addFirst")}</Btn>}/>
          : filtered.map((c, idx) => {
              const jobCount = jobs.filter(j=>(j.client_id??j.client?.id)===c.id).length;
              const revenue  = invoices.filter(i=>(i.client_id??i.client?.id)===c.id&&i.status==="paid").reduce((s,i)=>s+Number(i.amount),0);
              return (
                <TouchableOpacity key={c.id} onPress={()=>setSelected(c)} activeOpacity={0.82}>
                  <Card style={{ marginBottom:10 }}>
                    <View style={SS.row}>
                      <Avatar name={c.name} size={42} index={idx}/>
                      <View style={{ flex:1, marginLeft:12 }}>
                        <Text style={{ fontSize:15, fontWeight:"700" }}>{c.name}</Text>
                        <Text style={{ fontSize:12, color:T.muted }} numberOfLines={1}>{c.email}</Text>
                        <Text style={{ fontSize:12, color:T.muted }}>{c.phone}</Text>
                      </View>
                      <View style={{ alignItems:"flex-end", gap:4 }}>
                        <Text style={{ fontSize:14, fontWeight:"800", color:T.brand }}>{fmt(revenue)}</Text>
                        <Text style={{ fontSize:11, color:T.muted }}>{t("clients.jobsCount",{count:jobCount})}</Text>
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
        }
      </ScrollView>

      {/* Client detail sheet */}
      <Sheet visible={!!selected} onClose={()=>setSelected(null)} title={t("clients.clientSheetTitle")} height="80%">
        {selected && (
          <>
            <View style={[SS.row, { marginBottom:20, gap:14 }]}>
              <Avatar name={selected.name} size={52} index={clients.indexOf(selected)}/>
              <View style={{ flex:1 }}>
                <Text style={{ fontSize:18, fontWeight:"800" }}>{selected.name}</Text>
                <Text style={{ fontSize:13, color:T.muted }}>{t("clients.jobsAndEarned",{count:clientJobs.length,earned:fmt(clientRevenue)})}</Text>
              </View>
            </View>
            {[["✉️", selected.email],["📞", selected.phone],["📍", selected.address],["📝", selected.notes]].map(([icon,val])=>val?(
              <View key={icon} style={[SS.row, { paddingVertical:8, borderBottomWidth:1, borderBottomColor:T.border, gap:10 }]}>
                <Text>{icon}</Text><Text style={{ fontSize:13, color:T.muted, flex:1 }}>{val}</Text>
              </View>
            ):null)}
            <View style={[SS.row, { marginTop:16, gap:8 }]}>
              <Btn style={{ flex:1 }} variant="ghost" onPress={()=>{ setSelected(null); setTimeout(()=>openEdit(selected),300); }}>{t("common.edit")}</Btn>
              <Btn style={{ flex:1 }} variant="danger" onPress={()=>handleDelete(selected)}>{t("common.delete")}</Btn>
            </View>

            {clientJobs.length > 0 && (
              <>
                <Text style={{ fontSize:13, fontWeight:"700", color:T.muted, textTransform:"uppercase", letterSpacing:0.5, marginTop:20, marginBottom:10 }}>{t("clients.jobHistory")}</Text>
                {clientJobs.map(j => (
                  <View key={j.id} style={[SS.spaceBetween, { paddingVertical:8, borderBottomWidth:1, borderBottomColor:T.border }]}>
                    <View style={{ flex:1 }}>
                      <Text style={{ fontSize:13, fontWeight:"600" }}>{j.title}</Text>
                      <Text style={{ fontSize:12, color:T.muted }}>{fmtDate(j.date)}</Text>
                    </View>
                    <View style={{ alignItems:"flex-end", gap:4 }}>
                      {Number(j.amount)>0 && <Text style={{ fontSize:13, fontWeight:"700" }}>{fmt(j.amount)}</Text>}
                      <Badge color={j.status==="completed"?"green":"amber"}>{j.status}</Badge>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </Sheet>

      {/* Add / Edit sheet */}
      <Sheet visible={formOpen} onClose={()=>setFormOpen(false)} title={editClient?t("clients.editClient"):t("clients.addClient")} height="80%">
        <Field label={t("clients.fullNameRequired")}><Input value={form.name??""} onChangeText={fv("name")} placeholder="Sarah Mitchell" autoFocus/></Field>
        <Field label={t("clients.emailLabel")}><Input value={form.email??""} onChangeText={fv("email")} keyboardType="email-address" autoCapitalize="none"/></Field>
        <Field label={t("clients.phoneLabel")}><Input value={form.phone??""} onChangeText={fv("phone")} keyboardType="phone-pad"/></Field>
        <Field label={t("clients.addressLabel")}><Input value={form.address??""} onChangeText={fv("address")} placeholder="14 Elm Street, Brighton"/></Field>
        <Field label={t("clients.notesLabel")}><Input value={form.notes??""} onChangeText={fv("notes")} multiline numberOfLines={3}/></Field>
        <Btn onPress={handleSave} disabled={saving} style={{ marginTop:8 }}>{saving?t("clients.saving"):editClient?t("common.saveChanges"):t("clients.addClient")}</Btn>
      </Sheet>
    </View>
  );
}