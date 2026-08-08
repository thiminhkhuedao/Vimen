// app/(screens)/reviews.js
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { useProfile } from "../../src/hooks/useProfile";
import { getReviews, getJobs, getClients } from "../../src/lib/db";
import { Card, Btn, Badge, EmptyState, Spinner, Sheet, Field, Input } from "../../src/components/UI";
import { T, SS, fmtDate } from "../../src/styles/tokens";

function Stars({ rating, size=16 }) {
  return (
    <View style={SS.row}>
      {[1,2,3,4,5].map(n=>(
        <Text key={n} style={{ fontSize:size, color:n<=rating?"#F59E0B":"#E5E3DE" }}>★</Text>
      ))}
    </View>
  );
}

export default function ReviewsScreen() {
  const { t }        = useTranslation();
  const insets      = useSafeAreaInsets();
  const { profile } = useProfile();
  const [reviews,  setReviews]  = useState([]);
  const [jobs,     setJobs]     = useState([]);
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [reqSheet, setReqSheet] = useState(false);
  const [addSheet, setAddSheet] = useState(false);
  const [selJob,   setSelJob]   = useState("");
  const [form,     setForm]     = useState({ client_name:"", rating:5, title:"", body:"" });

  const load = useCallback(async (refresh=false) => {
    if (!profile?.id) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    const [{ data:r }, { data:j }, { data:c }] = await Promise.all([
      getReviews(profile.id), getJobs(profile.id), getClients(profile.id),
    ]);
    setReviews(r??[]);
    setJobs((j??[]).filter(jb=>jb.status==="completed"));
    setClients(c??[]);
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const avgRating = reviews.length>0 ? (reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1) : "—";
  const verified  = reviews.filter(r=>r.verified).length;

  function sendRequest() {
    const job = jobs.find(j=>j.id===selJob);
    if (!job) { Alert.alert(t("reviews.toast.selectCompletedJob")); return; }
    const cl = clients.find(c=>c.id===(job.client_id??job.client?.id));
    Alert.alert(t("reviews.screen.alerts.requestSentTitle"), t("reviews.screen.alerts.requestSentMessage", { name: cl?.name ?? t("reviews.fallback.client") }));
    setReqSheet(false);
  }

  function addManual() {
    if (!form.client_name) { Alert.alert(t("reviews.screen.alerts.clientNameRequired")); return; }
    setReviews(prev=>[{
      id: Math.random().toString(36).slice(2),
      profile_id: profile?.id,
      client_name: form.client_name,
      rating: form.rating,
      title: form.title,
      body: form.body,
      verified: true,
      google_review_clicked: false,
      created_at: new Date().toISOString(),
    }, ...prev]);
    setAddSheet(false);
    setForm({ client_name:"", rating:5, title:"", body:"" });
  }

  if (loading) return <Spinner/>;

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      <View style={{ backgroundColor:T.surface, paddingTop:insets.top+8, paddingBottom:14, paddingHorizontal:20, borderBottomWidth:1, borderBottomColor:T.border }}>
        <View style={SS.spaceBetween}>
          <Text style={{ fontSize:22, fontWeight:"900", color:T.text, letterSpacing:-0.5 }}>{t("reviews.title")}</Text>
          <View style={SS.row}>
            <Btn size="sm" variant="ghost" onPress={()=>setAddSheet(true)} style={{ marginRight:8 }}>{t("reviews.screen.addBtn")}</Btn>
            <Btn size="sm" onPress={()=>setReqSheet(true)}>📱 {t("reviews.screen.requestBtn")}</Btn>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:insets.bottom+90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor={T.brand}/>}>

        {/* Rating summary */}
        <Card style={{ marginBottom:12 }}>
          <View style={SS.row}>
            <View style={{ alignItems:"center", marginRight:24 }}>
              <Text style={{ fontSize:48, fontWeight:"900", color:T.text, letterSpacing:-2 }}>{avgRating}</Text>
              <Stars rating={Math.round(Number(avgRating)||0)} size={18}/>
              <Text style={{ fontSize:12, color:T.muted, marginTop:4 }}>{t("reviews.stats.reviewsCount", { count: reviews.length })}</Text>
            </View>
            <View style={{ flex:1 }}>
              {[5,4,3,2,1].map(star=>{
                const count = reviews.filter(r=>r.rating===star).length;
                const pct   = reviews.length>0?(count/reviews.length)*100:0;
                return (
                  <View key={star} style={[SS.row, { gap:6, marginBottom:4 }]}>
                    <Text style={{ fontSize:11, color:T.muted, width:8 }}>{star}</Text>
                    <Text style={{ color:"#F59E0B", fontSize:11 }}>★</Text>
                    <View style={{ flex:1, height:5, backgroundColor:T.surface3, borderRadius:3 }}>
                      <View style={{ height:"100%", width:`${pct}%`, backgroundColor:"#F59E0B", borderRadius:3 }}/>
                    </View>
                    <Text style={{ fontSize:11, color:T.muted, width:14 }}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </Card>

        {/* Stats */}
        <View style={[SS.row, { gap:10, marginBottom:12 }]}>
          <View style={{ flex:1, backgroundColor:T.greenBg, borderRadius:T.r.md, padding:12 }}>
            <Text style={{ fontSize:10, fontWeight:"700", color:T.green, textTransform:"uppercase", letterSpacing:0.5 }}>{t("reviews.screen.stats.verified")}</Text>
            <Text style={{ fontSize:22, fontWeight:"800", color:T.green }}>{verified}</Text>
          </View>
          <View style={{ flex:1, backgroundColor:T.blueBg, borderRadius:T.r.md, padding:12 }}>
            <Text style={{ fontSize:10, fontWeight:"700", color:T.blue, textTransform:"uppercase", letterSpacing:0.5 }}>{t("reviews.list.onGoogleBadge")}</Text>
            <Text style={{ fontSize:22, fontWeight:"800", color:T.blue }}>{reviews.filter(r=>r.google_review_clicked).length}</Text>
          </View>
          <View style={{ flex:1, backgroundColor:T.amberBg, borderRadius:T.r.md, padding:12 }}>
            <Text style={{ fontSize:10, fontWeight:"700", color:T.amber, textTransform:"uppercase", letterSpacing:0.5 }}>{t("reviews.screen.stats.pending")}</Text>
            <Text style={{ fontSize:22, fontWeight:"800", color:T.amber }}>{jobs.length - reviews.length > 0 ? jobs.length - reviews.length : 0}</Text>
          </View>
        </View>

        {/* Google CTA */}
        <TouchableOpacity onPress={()=>Linking.openURL("https://business.google.com")}
          style={{ backgroundColor:T.blueBg, borderRadius:T.r.lg, padding:14, marginBottom:16, flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
          <View>
            <Text style={{ fontWeight:"700", color:T.blue }}>🔍 {t("reviews.screen.googleCta.title")}</Text>
            <Text style={{ fontSize:12, color:T.muted, marginTop:2 }}>{t("reviews.screen.googleCta.desc")}</Text>
          </View>
          <Text style={{ color:T.blue, fontSize:18 }}>→</Text>
        </TouchableOpacity>

        {/* Reviews list */}
        {reviews.length===0
          ? <EmptyState icon="⭐" message={t("reviews.list.empty")} action={<Btn size="sm" onPress={()=>setReqSheet(true)}>{t("reviews.screen.requestFirstBtn")}</Btn>}/>
          : reviews.map(r=>(
              <Card key={r.id} style={{ marginBottom:10 }}>
                <View style={[SS.spaceBetween, { marginBottom:8 }]}>
                  <View style={SS.row}>
                    <View style={{ width:36, height:36, borderRadius:18, backgroundColor:T.brand, alignItems:"center", justifyContent:"center", marginRight:10 }}>
                      <Text style={{ color:"#fff", fontSize:13, fontWeight:"700" }}>{(r.client_name||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)}</Text>
                    </View>
                    <View>
                      <Text style={{ fontWeight:"700", fontSize:14 }}>{r.client_name}</Text>
                      <Text style={{ fontSize:11, color:T.muted }}>{fmtDate(r.created_at)}</Text>
                    </View>
                  </View>
                  <Stars rating={r.rating} size={14}/>
                </View>
                {r.title && <Text style={{ fontWeight:"600", fontSize:13, marginBottom:4 }}>{r.title}</Text>}
                {r.body  && <Text style={{ fontSize:13, color:T.muted, lineHeight:20 }}>{r.body}</Text>}
                <View style={[SS.row, { marginTop:10, gap:8 }]}>
                  {r.verified && <Badge color="green">{t("reviews.list.verifiedBadge")}</Badge>}
                  {r.google_review_clicked && <Badge color="blue">{t("reviews.list.onGoogleBadge")}</Badge>}
                </View>
              </Card>
            ))
        }
      </ScrollView>

      {/* Request review sheet */}
      <Sheet visible={reqSheet} onClose={()=>setReqSheet(false)} title={t("reviews.requestModal.title")} height="55%">
        <Text style={{ fontSize:13, color:T.muted, marginBottom:16, lineHeight:20 }}>
          {t("reviews.screen.requestSheet.intro")}
        </Text>
        <Field label={t("reviews.requestModal.completedJobLabel")}>
          <View style={{ borderWidth:1, borderColor:T.borderMed, borderRadius:T.r.md, padding:12 }}>
            <ScrollView style={{ maxHeight:140 }}>
              {jobs.map(j=>{
                const cl = clients.find(c=>c.id===(j.client_id??j.client?.id));
                return (
                  <TouchableOpacity key={j.id} onPress={()=>setSelJob(j.id)}
                    style={{ padding:10, borderRadius:T.r.md, backgroundColor:selJob===j.id?T.brandLight:"transparent", marginBottom:4 }}>
                    <Text style={{ fontWeight:"600", color:selJob===j.id?T.brand:T.text }}>{j.title}</Text>
                    <Text style={{ fontSize:12, color:T.muted }}>{cl?.name??""}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Field>
        <Btn onPress={sendRequest} style={{ marginTop:8 }}>{t("reviews.requestModal.sendSmsBtn")}</Btn>
      </Sheet>

      {/* Add manual review sheet */}
      <Sheet visible={addSheet} onClose={()=>setAddSheet(false)} title={t("reviews.screen.addSheet.title")} height="75%">
        <Field label={t("reviews.manualModal.clientNameLabel")}><Input value={form.client_name} onChangeText={v=>setForm(p=>({...p,client_name:v}))} placeholder="Sarah Mitchell" autoFocus/></Field>
        <Field label={t("reviews.manualModal.ratingLabel")}>
          <View style={[SS.row, { gap:8 }]}>
            {[1,2,3,4,5].map(n=>(
              <TouchableOpacity key={n} onPress={()=>setForm(p=>({...p,rating:n}))}>
                <Text style={{ fontSize:32, color:n<=form.rating?"#F59E0B":"#E5E3DE" }}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>
        <Field label={t("reviews.screen.addSheet.titleLabel")}><Input value={form.title} onChangeText={v=>setForm(p=>({...p,title:v}))} placeholder={t("reviews.screen.addSheet.titlePlaceholder")}/></Field>
        <Field label={t("reviews.screen.addSheet.reviewLabel")}><Input value={form.body} onChangeText={v=>setForm(p=>({...p,body:v}))} multiline numberOfLines={3} placeholder={t("reviews.screen.addSheet.reviewPlaceholder")}/></Field>
        <Btn onPress={addManual} style={{ marginTop:8 }}>{t("reviews.manualModal.addReviewBtn")}</Btn>
      </Sheet>
    </View>
  );
}