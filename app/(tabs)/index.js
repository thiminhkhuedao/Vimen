// app/(tabs)/index.js — Dashboard, wired to real Supabase data
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StatusBar, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useProfile } from "../../src/hooks/useProfile";
import { getJobs, getInvoices, getClients, getBookingRequests } from "../../src/lib/db";
import { withTimeout } from "../../src/lib/withTimeout";
import { getVerticalForProfession, getTerms } from "../../src/lib/professions";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { Avatar, Spinner, EmptyState } from "../../src/components/UI";
import { T, SS, fmt, fmtDate } from "../../src/styles/tokens";

const MAX_RETRIES = 2;

export default function DashboardScreen() {
  const insets       = useSafeAreaInsets();
  const router        = useRouter();
  const { t }          = useTranslation();
  const { profile, loading: profileLoading } = useProfile();
  const [jobs,      setJobs]      = useState([]);
  const [invoices,  setInvoices]  = useState([]);
  const [clients,   setClients]   = useState([]);
  const [bookings,  setBookings]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async (refresh = false, attempt = 0) => {
    if (!profile?.id) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    setLoadError(null);

    try {
      const [{ data: j }, { data: i }, { data: c }, { data: b }] = await withTimeout(
        Promise.all([
          getJobs(profile.id), getInvoices(profile.id), getClients(profile.id), getBookingRequests(profile.id),
        ]),
        8000,
        "dashboard load"
      );
      setJobs(j ?? []);
      setInvoices(i ?? []);
      setClients(c ?? []);
      setBookings(b ?? []);
      if (refresh) setRefreshing(false); else setLoading(false);

    } catch (err) {
      // Covers both thrown network errors AND requests that hung
      // long enough to trip withTimeout — either way, loading no
      // longer gets stuck forever.
      console.error("[dashboard] load() failed:", err);

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

  if (profileLoading || (loading && !refreshing)) return <Spinner/>;

  const vertical  = getVerticalForProfession(profile?.trade);
  const terms     = getTerms(profile?.trade);
  const firstName = (profile?.name || t("dashboard.thereFallback")).split(" ")[0];

  const paid      = invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+Number(i.amount),0);
  const unpaid    = invoices.filter(i=>i.status==="unpaid").reduce((s,i)=>s+Number(i.amount),0);
  const upcoming  = jobs.filter(j=>j.status==="scheduled").sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  const completed = jobs.filter(j=>j.status==="completed").sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const pending   = bookings.filter(b=>b.status==="pending");
  const getClient = j => clients.find(c=>c.id===(j.client_id??j.client?.id)) ?? j.client;

  async function shareBookingPage() {
    const url = `https://Vinem.app/b/${profile?.booking_slug || "yourname"}`;
    await Share.share({ message: t("booking.shareMessage", { url }), url });
  }

  const bookingPlural = terms.bookingPlural.toLowerCase();

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      <StatusBar barStyle="dark-content"/>

      {loadError && (
        <TouchableOpacity onPress={()=>load()} style={{ backgroundColor:T.redBg, marginHorizontal:16, marginTop:insets.top+8, padding:12, borderRadius:10 }}>
          <Text style={{ color:T.red, fontSize:13, fontWeight:"600" }}>⚠️ {t("dashboard.loadErrorRetry")}</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={{ paddingTop:insets.top+8, paddingBottom:insets.bottom+90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor={T.brand}/>}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", paddingHorizontal:20, marginBottom:20 }}>
          <View>
            <Text style={{ fontSize:26, fontWeight:"900", color:T.text, letterSpacing:-0.8 }}>{t("dashboard.greeting", { name: firstName })}</Text>
            <Text style={{ fontSize:13, color:T.muted, marginTop:4 }}>
              {vertical.icon} {profile?.trade || "—"} · {profile?.plan==="pro" ? t("dashboard.planPro") : t("dashboard.planFree")}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/(tabs)/settings")}>
            <Avatar name={profile?.name || "?"} size={46}/>
          </TouchableOpacity>
        </View>

        {/* Pending bookings alert */}
        {pending.length > 0 && (
          <TouchableOpacity onPress={() => router.push("/(screens)/booking")}
            style={{ marginHorizontal:16, marginBottom:14, backgroundColor:T.brandLight, borderRadius:14, padding:14, borderWidth:1, borderColor:"rgba(232,80,10,0.2)", flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
            <View style={{ flex:1, marginRight:10 }}>
              <Text style={{ fontWeight:"700", color:T.brand, fontSize:14 }}>
                {t("dashboard.newRequests", { count: pending.length, type: pending.length===1 ? t("dashboard.requestSingular") : t("dashboard.requestPlural") })}
              </Text>
              <Text style={{ fontSize:12, color:T.muted, marginTop:2 }} numberOfLines={1}>{pending.map(b=>b.customer_name).join(", ")}</Text>
            </View>
            <Text style={{ color:T.brand, fontSize:20 }}>›</Text>
          </TouchableOpacity>
        )}

        {/* Metrics 2x2 */}
        <View style={{ paddingHorizontal:16 }}>
          <View style={{ flexDirection:"row", gap:10, marginBottom:10 }}>
            <MetricCard label={t("dashboard.earned")} value={fmt(paid)} sub={t("dashboard.thisMonth")} accent/>
            <MetricCard label={t("dashboard.outstanding")} value={fmt(unpaid)} sub={t("dashboard.unpaid", { count: invoices.filter(i=>i.status==="unpaid").length })}/>
          </View>
          <View style={{ flexDirection:"row", gap:10, marginBottom:20 }}>
            <MetricCard label={terms.bookingPlural} value={String(upcoming.length)} sub={t("dashboard.scheduled")}/>
            <MetricCard label={t("dashboard.clients")} value={String(clients.length)} sub={t("dashboard.total")}/>
          </View>
        </View>

        {/* Upcoming jobs/appointments */}
        <SectionCard title={t("dashboard.upcoming", { jobs: bookingPlural })} action={t("common.viewAll")} onPress={() => router.push("/(tabs)/jobs")}>
          {upcoming.length === 0
            ? <EmptyState icon="📋" message={t("dashboard.noUpcoming", { jobs: bookingPlural })}/>
            : upcoming.slice(0,3).map(j => {
                const cl = getClient(j);
                const d  = j.date ? new Date(j.date) : null;
                return (
                  <View key={j.id} style={{ flexDirection:"row", alignItems:"center", paddingVertical:12, borderBottomWidth:1, borderBottomColor:T.border }}>
                    <View style={{ width:46, height:46, borderRadius:12, backgroundColor:T.brandLight, alignItems:"center", justifyContent:"center", marginRight:14 }}>
                      <Text style={{ fontSize:16, fontWeight:"900", color:T.brand, lineHeight:18 }}>{d ? d.getDate() : "—"}</Text>
                      <Text style={{ fontSize:8, fontWeight:"800", color:T.brand }}>{d ? d.toLocaleString("en-GB",{month:"short"}).toUpperCase() : ""}</Text>
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={{ fontSize:14, fontWeight:"700", color:T.text }} numberOfLines={1}>{j.title}</Text>
                      <Text style={{ fontSize:12, color:T.muted, marginTop:2 }}>{cl?.name ?? "—"} · {j.time}</Text>
                    </View>
                    <Text style={{ fontSize:15, fontWeight:"800", color:T.text }}>{Number(j.amount)>0 ? fmt(j.amount) : "—"}</Text>
                  </View>
                );
              })
          }
        </SectionCard>

        {/* Recent activity */}
        <SectionCard title={t("dashboard.recentActivity")} action={t("dashboard.invoicesLink")} onPress={() => router.push("/(tabs)/invoices")}>
          {completed.length === 0
            ? <EmptyState icon="✅" message={t("dashboard.noActivity")}/>
            : completed.slice(0,3).map(j => {
                const cl  = getClient(j);
                const inv = invoices.find(i=>i.job_id===j.id);
                return (
                  <View key={j.id} style={{ flexDirection:"row", alignItems:"center", paddingVertical:12, borderBottomWidth:1, borderBottomColor:T.border }}>
                    <View style={{ width:36, height:36, borderRadius:18, backgroundColor:T.greenBg, alignItems:"center", justifyContent:"center", marginRight:12 }}>
                      <Text style={{ fontSize:16 }}>✓</Text>
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={{ fontSize:14, fontWeight:"600" }} numberOfLines={1}>{j.title}</Text>
                      <Text style={{ fontSize:12, color:T.muted, marginTop:1 }}>{cl?.name ?? "—"} · {fmtDate(j.date)}</Text>
                    </View>
                    <View style={{ backgroundColor:inv?.status==="paid"?T.greenBg:T.amberBg, borderRadius:20, paddingHorizontal:10, paddingVertical:3 }}>
                      <Text style={{ fontSize:11, fontWeight:"700", color:inv?.status==="paid"?T.green:T.amber }}>{inv?.status ?? t("dashboard.noInvoiceLabel")}</Text>
                    </View>
                  </View>
                );
              })
          }
        </SectionCard>

        {/* Booking page banner */}
        <TouchableOpacity onPress={() => router.push("/(screens)/booking")}
          style={{ marginHorizontal:16, marginBottom:16, backgroundColor:"#0F0E0D", borderRadius:16, padding:20, flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
          <View style={{ flex:1 }}>
            <Text style={{ fontWeight:"800", color:"#fff", fontSize:15, marginBottom:4 }}>{t("dashboard.bookingLive")}</Text>
            <Text style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }} numberOfLines={1}>Vinem.app/b/{profile?.booking_slug || "yourname"}</Text>
          </View>
          <TouchableOpacity onPress={shareBookingPage} style={{ backgroundColor:T.brand, borderRadius:10, paddingHorizontal:16, paddingVertical:10, marginLeft:12 }}>
            <Text style={{ color:"#fff", fontWeight:"700", fontSize:13 }}>{t("common.share")}</Text>
          </TouchableOpacity>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <View style={{ flex:1, backgroundColor:T.surface, borderRadius:14, borderWidth:accent?0:1, borderColor:T.border, borderLeftWidth:accent?3:1, borderLeftColor:accent?T.brand:T.border, padding:16, shadowColor:"#000", shadowOpacity:0.04, shadowRadius:4, elevation:2 }}>
      <Text style={{ fontSize:10, fontWeight:"700", color:T.muted, textTransform:"uppercase", letterSpacing:0.6, marginBottom:8 }}>{label}</Text>
      <Text style={{ fontSize:24, fontWeight:"900", color:T.text, letterSpacing:-0.5 }}>{value}</Text>
      <Text style={{ fontSize:11, color:T.hint, marginTop:4 }}>{sub}</Text>
    </View>
  );
}

function SectionCard({ title, action, onPress, children }) {
  return (
    <View style={{ marginHorizontal:16, marginBottom:14, backgroundColor:T.surface, borderRadius:16, borderWidth:1, borderColor:T.border, padding:18, shadowColor:"#000", shadowOpacity:0.04, shadowRadius:4, elevation:2 }}>
      <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <Text style={{ fontSize:15, fontWeight:"800", color:T.text }}>{title}</Text>
        <TouchableOpacity onPress={onPress}><Text style={{ fontSize:13, fontWeight:"600", color:T.brand }}>{action}</Text></TouchableOpacity>
      </View>
      {children}
    </View>
  );
}
