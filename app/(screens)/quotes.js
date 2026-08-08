// app/(screens)/quotes.js
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { useProfile } from "../../src/hooks/useProfile";
import { getQuotes, getClients, createQuote, updateQuote, deleteQuote } from "../../src/lib/db";
import { Card, Btn, Badge, EmptyState, Spinner, Sheet, Field, Input, SelectPicker } from "../../src/components/UI";
import { T, SS, fmt, fmtDate, today } from "../../src/styles/tokens";


const STATUS_COLOR = { draft:"gray", sent:"blue", viewed:"amber", accepted:"green", declined:"red", converted:"green" };

const LINE_TYPE_VALUES = ["labour", "material", "other"];

function calcTotals(lines) {
  const subtotal = lines.reduce((s,l) => s + (parseFloat(l.quantity)||0) * (parseFloat(l.unit_price)||0), 0);
  const matCost  = lines.filter(l=>l.type==="material").reduce((s,l) => s+(parseFloat(l.quantity)||0)*(parseFloat(l.unit_price)||0), 0);
  const total    = Math.round(subtotal * 100) / 100;
  const margin_pct = total > 0 ? Math.round(((total - matCost) / total) * 100) : 0;
  return { subtotal: total, total, vat_amount: 0, vat_rate: 0, margin_pct };
}

const EMPTY_LINE = () => ({ id: Math.random().toString(36).slice(2), description: "", type: "labour", quantity: "1", unit_price: "" });

export default function QuotesScreen() {
  const { t: tr }      = useTranslation();
  const { profile }   = useProfile();
  const [quotes,  setQuotes]  = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,     setTab]     = useState("active");
  const [sheet,   setSheet]   = useState(null); // null | "add" | quote obj
  const [lines,   setLines]   = useState([EMPTY_LINE()]);
  const [form,    setForm]    = useState({});
  const [saving,  setSaving]  = useState(false);
  const [signSheet, setSignSheet] = useState(null);
  const [signName,  setSignName]  = useState("");

  const lineTypeLabels = LINE_TYPE_VALUES.map(v => tr(`quotes.lineTypes.${v}`));

  const load = useCallback(async (refresh=false) => {
    if (!profile?.id) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    const [{ data:q }, { data:c }] = await Promise.all([getQuotes(profile.id), getClients(profile.id)]);
    setQuotes(q??[]); setClients(c??[]);
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const active   = quotes.filter(q=>["draft","sent","viewed","accepted"].includes(q.status));
  const archived = quotes.filter(q=>["declined","converted"].includes(q.status));
  const current  = tab==="active" ? active : archived;

  function openAdd() {
    setForm({ client_id: clients[0]?.id??"", title:"", notes:"", valid_until:"" });
    setLines([EMPTY_LINE()]);
    setSheet("add");
  }

  function updateLine(id, key, val) {
    setLines(prev => prev.map(l => l.id===id ? {...l,[key]:val} : l));
  }

  async function handleSave() {
    if (!form.title || !form.client_id) { Alert.alert(tr("quotes.screen.alerts.clientTitleRequired")); return; }
    const totals = calcTotals(lines);
    const line_items = lines.map(l=>({ description:l.description, type:l.type, quantity:parseFloat(l.quantity)||0, unit_price:parseFloat(l.unit_price)||0, total:Math.round((parseFloat(l.quantity)||0)*(parseFloat(l.unit_price)||0)*100)/100 }));
    setSaving(true);
    const { data, error } = await createQuote(profile.id, { ...form, ...totals, line_items, status:"draft" });
    setSaving(false);
    if (error) { Alert.alert(tr("quotes.screen.alerts.failedCreate")); return; }
    setQuotes(prev => [data, ...prev]);
    setSheet(null);
  }

  async function handleSign(quote) {
    if (!signName.trim()) { Alert.alert(tr("quotes.screen.alerts.enterClientName")); return; }
    const { data } = await updateQuote(quote.id, { status:"accepted", signed_at:new Date().toISOString(), signed_by:signName });
    if (data) setQuotes(prev=>prev.map(q=>q.id===quote.id?data:q));
    setSignSheet(null); setSignName("");
    Alert.alert(tr("quotes.screen.alerts.acceptedTitle"), tr("quotes.screen.alerts.signedByMessage", { name: signName }));
  }

  async function handleDelete(id) {
    Alert.alert(tr("quotes.deleteConfirm.title"), tr("quotes.deleteConfirm.message"),[
      {text:tr("quotes.screen.common.cancel"),style:"cancel"},
      {text:tr("quotes.screen.common.delete"),style:"destructive",onPress:async()=>{
        await deleteQuote(id);
        setQuotes(prev=>prev.filter(q=>q.id!==id));
      }}
    ]);
  }

  async function convertToJob(quote) {
    Alert.alert(tr("quotes.screen.alerts.convertTitle"), tr("quotes.screen.alerts.convertMessage"),[
      {text:tr("quotes.screen.common.cancel"),style:"cancel"},
      {text:tr("quotes.screen.common.convert"),onPress:async()=>{
        await updateQuote(quote.id, { status:"converted" });
        setQuotes(prev=>prev.map(q=>q.id===quote.id?{...q,status:"converted"}:q));
        Alert.alert(tr("quotes.screen.alerts.jobCreated"));
      }}
    ]);
  }

  if (loading) return <Spinner/>;
  const getClient = id => clients.find(c=>c.id===id);

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      {/* Stats */}
      <View style={[SS.row, { gap:10, padding:16, paddingBottom:0 }]}>
        {[
          { label:tr("quotes.screen.stats.totalQuoted"), val:fmt(quotes.reduce((s,q)=>s+Number(q.total),0)) },
          { label:tr("quotes.screen.stats.accepted"),    val:fmt(quotes.filter(q=>["accepted","converted"].includes(q.status)).reduce((s,q)=>s+Number(q.total),0)) },
          { label:tr("quotes.screen.stats.conversion"),  val:quotes.length>0?`${Math.round((quotes.filter(q=>["accepted","converted"].includes(q.status)).length/quotes.length)*100)}%`:"—" },
        ].map(m=>(
          <View key={m.label} style={{ flex:1, backgroundColor:T.surface, borderRadius:T.r.md, padding:12, borderWidth:1, borderColor:T.border }}>
            <Text style={{ fontSize:10, fontWeight:"700", color:T.muted, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>{m.label}</Text>
            <Text style={{ fontSize:18, fontWeight:"800" }}>{m.val}</Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <View style={[SS.row, { margin:16, backgroundColor:T.surface2, borderRadius:T.r.md, padding:3 }]}>
        {[
          ["active", tr("quotes.screen.tabs.activeWithCount", { count: active.length })],
          ["archived", tr("quotes.screen.tabs.archivedWithCount", { count: archived.length })],
        ].map(([id,label])=>(
          <TouchableOpacity key={id} onPress={()=>setTab(id)} style={{ flex:1, paddingVertical:7, borderRadius:T.r.sm, alignItems:"center", backgroundColor:tab===id?T.surface:"transparent" }}>
            <Text style={{ fontSize:13, fontWeight:tab===id?"700":"400", color:tab===id?T.text:T.muted }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal:16, paddingBottom:100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor={T.brand}/>}>
        {current.length===0
          ? <EmptyState icon="📋" message={tr("quotes.empty")} action={<Btn size="sm" onPress={openAdd}>{tr("quotes.screen.createQuoteBtn")}</Btn>}/>
          : current.map(q=>{
              const cl = getClient(q.client_id??q.client?.id);
              return (
                <Card key={q.id} style={{ marginBottom:10 }}>
                  <View style={SS.spaceBetween}>
                    <View style={{ flex:1 }}>
                      <Text style={{ fontSize:13, fontWeight:"700", color:T.brand, marginBottom:2 }}>{q.quote_number}</Text>
                      <Text style={{ fontSize:15, fontWeight:"600" }} numberOfLines={1}>{q.title}</Text>
                      <Text style={{ fontSize:12, color:T.muted, marginTop:2 }}>{cl?.name??""}{q.valid_until?` · ${tr("quotes.screen.validTo", { date: fmtDate(q.valid_until) })}`:""}</Text>
                    </View>
                    <View style={{ alignItems:"flex-end", gap:6 }}>
                      <Text style={{ fontSize:18, fontWeight:"800", color:T.brand }}>{fmt(q.total)}</Text>
                      <View style={[SS.row, { gap:6 }]}>
                        <Text style={{ fontSize:12, fontWeight:"700", color:q.margin_pct>25?T.green:T.amber }}>{q.margin_pct}%</Text>
                        <Badge color={STATUS_COLOR[q.status]??"gray"}>{tr(`quotes.status.${q.status}`)}</Badge>
                      </View>
                    </View>
                  </View>
                  <View style={[SS.row, { marginTop:10, gap:8, flexWrap:"wrap" }]}>
                    {["draft","sent","viewed"].includes(q.status) && <Btn size="sm" variant="success" onPress={()=>{setSignSheet(q);setSignName("");}}>✍️ {tr("quotes.screen.signBtn")}</Btn>}
                    {q.status==="accepted" && <Btn size="sm" onPress={()=>convertToJob(q)}>{tr("quotes.preview.convertToJob")}</Btn>}
                    <Btn size="sm" variant="danger" onPress={()=>handleDelete(q.id)}>{tr("quotes.screen.deleteBtn")}</Btn>
                  </View>
                </Card>
              );
            })
        }
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity onPress={openAdd} style={{ position:"absolute", bottom:24, right:20, width:56, height:56, borderRadius:28, backgroundColor:T.brand, alignItems:"center", justifyContent:"center", shadowColor:"#000", shadowOpacity:0.2, shadowRadius:8, elevation:6 }}>
        <Text style={{ fontSize:28, color:"#fff", lineHeight:32 }}>+</Text>
      </TouchableOpacity>

      {/* Add quote sheet */}
      <Sheet visible={sheet==="add"} onClose={()=>setSheet(null)} title={tr("quotes.modal.newTitle")} height="92%">
        <Field label={tr("quotes.fields.client")}><SelectPicker value={clients.find(c=>c.id===form.client_id)?.name??""} options={clients.map(c=>c.name)} onChange={name=>{const cl=clients.find(c=>c.name===name);if(cl)setForm(p=>({...p,client_id:cl.id}));}}/></Field>
        <Field label={tr("quotes.fields.quoteTitle")}><Input value={form.title??""} onChangeText={v=>setForm(p=>({...p,title:v}))} placeholder={tr("quotes.screen.quoteTitlePlaceholder")} autoFocus/></Field>
        <Field label={tr("quotes.fields.validUntil")}><Input value={form.valid_until??""} onChangeText={v=>setForm(p=>({...p,valid_until:v}))} placeholder={tr("quotes.screen.validUntilPlaceholder")}/></Field>

        <Text style={[{ fontSize:13, fontWeight:"700", color:T.muted, marginBottom:8, textTransform:"uppercase" }]}>{tr("quotes.lineItems.label")}</Text>
        {lines.map((l,i)=>(
          <View key={l.id} style={{ backgroundColor:T.surface2, borderRadius:T.r.md, padding:10, marginBottom:8 }}>
            <Input value={l.description} onChangeText={v=>updateLine(l.id,"description",v)} placeholder={tr("quotes.screen.linePlaceholder", { index: i+1 })} style={{ marginBottom:8 }}/>
            <View style={[SS.row, { gap:8 }]}>
              <View style={{ flex:2 }}>
                <SelectPicker
                  value={tr(`quotes.lineTypes.${l.type}`)}
                  options={lineTypeLabels}
                  onChange={label=>{
                    const idx = lineTypeLabels.indexOf(label);
                    updateLine(l.id, "type", LINE_TYPE_VALUES[idx] ?? l.type);
                  }}
                />
              </View>
              <View style={{ flex:1 }}><Input value={l.quantity} onChangeText={v=>updateLine(l.id,"quantity",v)} placeholder={tr("quotes.lineItems.qtyPlaceholder")} keyboardType="decimal-pad"/></View>
              <View style={{ flex:1 }}><Input value={l.unit_price} onChangeText={v=>updateLine(l.id,"unit_price",v)} placeholder={tr("quotes.lineItems.unitPricePlaceholder")} keyboardType="decimal-pad"/></View>
            </View>
            <View style={[SS.spaceBetween, { marginTop:6 }]}>
              <Text style={{ fontSize:13, color:T.muted }}>{tr("quotes.screen.lineTotal")}</Text>
              <Text style={{ fontSize:14, fontWeight:"700" }}>{fmt((parseFloat(l.quantity)||0)*(parseFloat(l.unit_price)||0))}</Text>
            </View>
          </View>
        ))}
        <Btn variant="ghost" size="sm" onPress={()=>setLines(p=>[...p,EMPTY_LINE()])} style={{ marginBottom:12 }}>{tr("quotes.lineItems.addLine")}</Btn>

        {lines.length>0 && (()=>{
          const t = calcTotals(lines);
          return (
            <View style={{ backgroundColor:T.surface2, borderRadius:T.r.md, padding:12, marginBottom:12 }}>
              <View style={SS.spaceBetween}><Text style={{ color:T.muted }}>{tr("quotes.totals.subtotal")}</Text><Text style={{ fontWeight:"700" }}>{fmt(t.subtotal)}</Text></View>
              <View style={SS.spaceBetween}><Text style={{ color:T.muted }}>{tr("quotes.screen.estMargin")}</Text><Text style={{ fontWeight:"700", color:t.margin_pct>25?T.green:T.amber }}>{t.margin_pct}%</Text></View>
              <View style={[SS.spaceBetween, { borderTopWidth:1, borderTopColor:T.border, paddingTop:8, marginTop:4 }]}><Text style={{ fontWeight:"800", fontSize:15 }}>{tr("quotes.totals.total")}</Text><Text style={{ fontWeight:"900", fontSize:18, color:T.brand }}>{fmt(t.total)}</Text></View>
            </View>
          );
        })()}
        <Field label={tr("quotes.fields.notesForClient")}><Input value={form.notes??""} onChangeText={v=>setForm(p=>({...p,notes:v}))} multiline numberOfLines={2} placeholder={tr("quotes.screen.notesPlaceholder")}/></Field>
        <Btn onPress={handleSave} disabled={saving}>{saving?tr("quotes.screen.creating"):tr("quotes.actions.createQuote")}</Btn>
      </Sheet>

      {/* Sign sheet */}
      <Sheet visible={!!signSheet} onClose={()=>setSignSheet(null)} title={tr("quotes.screen.signSheet.title")} height="45%">
        {signSheet && (
          <>
            <View style={{ backgroundColor:T.surface2, borderRadius:T.r.md, padding:12, marginBottom:16 }}>
              <Text style={{ fontWeight:"700", fontSize:14 }}>{signSheet.title}</Text>
              <Text style={{ fontSize:13, color:T.muted, marginTop:2 }}>{tr("quotes.screen.signSheet.totalLabel", { amount: fmt(signSheet.total) })}</Text>
            </View>
            <Field label={tr("quotes.screen.signSheet.fullNameLabel")}>
              <Input value={signName} onChangeText={setSignName} placeholder="Sarah Mitchell" autoFocus/>
            </Field>
            <Text style={{ fontSize:12, color:T.muted, marginBottom:12, lineHeight:18 }}>{tr("quotes.screen.signSheet.confirmText")}</Text>
            <Btn onPress={()=>handleSign(signSheet)}>✍️ {tr("quotes.preview.signature.signBtn")}</Btn>
          </>
        )}
      </Sheet>
    </View>
  );
}
