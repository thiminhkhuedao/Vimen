// app/(screens)/referrals.js
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, Share, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { useProfile } from "../../src/hooks/useProfile";
import { getReferrals, createReferral } from "../../src/lib/db";
import { Card, Btn, Badge, EmptyState, Spinner, Sheet, Field, Input } from "../../src/components/UI";
import { T, SS, fmtDate } from "../../src/styles/tokens";

const STATUS_COLOR = { pending:"gray", signed_up:"blue", qualified:"amber", rewarded:"green" };

export default function ReferralsScreen() {
  const { t }        = useTranslation();
  const insets      = useSafeAreaInsets();
  const { profile } = useProfile();
  const [referrals, setReferrals] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [sheet,     setSheet]     = useState(false);
  const [form,      setForm]      = useState({ name:"", email:"" });
  const [saving,    setSaving]    = useState(false);

  const myCode = `TRD-${(profile?.name||"USER").replace(/\s/g,"").slice(0,4).toUpperCase()}${(profile?.id||"0000").slice(0,4).toUpperCase()}`;
  const referralUrl = `https://Vinem.app/signup?ref=${myCode}`;

  const load = useCallback(async (refresh=false) => {
    if (!profile?.id) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    const { data } = await getReferrals(profile.id);
    setReferrals(data??[]);
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const rewarded = referrals.filter(r=>r.status==="rewarded").length;

  async function shareLink() {
    await Share.share({
      message: t("referrals.screen.alerts.shareMessage", { url: referralUrl }),
      url: referralUrl,
    });
  }

  async function sendReferral() {
    if (!form.email) { Alert.alert(t("referrals.screen.alerts.emailRequired")); return; }
    setSaving(true);
    const { data, error } = await createReferral(profile.id, form.email, form.name);
    setSaving(false);
    if (error) { Alert.alert(t("referrals.screen.alerts.failedToSend")); return; }
    setReferrals(prev=>[data,...prev]);
    setSheet(false);
    setForm({ name:"", email:"" });
    Alert.alert(t("referrals.screen.alerts.sentTitle"), t("referrals.screen.alerts.sentMessage", { email: form.email }));
  }

  if (loading) return <Spinner/>;

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      <View style={{ backgroundColor:T.surface, paddingTop:insets.top+8, paddingBottom:14, paddingHorizontal:20, borderBottomWidth:1, borderBottomColor:T.border }}>
        <View style={SS.spaceBetween}>
          <Text style={{ fontSize:22, fontWeight:"900", color:T.text, letterSpacing:-0.5 }}>{t("referrals.title")}</Text>
          <Btn size="sm" onPress={()=>setSheet(true)}>{t("referrals.referSomeoneBtn")}</Btn>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:insets.bottom+90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor={T.brand}/>}>

        {/* Stats */}
        <View style={[SS.row, { gap:10, marginBottom:14 }]}>
          {[
            { label:t("referrals.screen.stats.rewarded"),   val:rewarded,          bg:T.greenBg, color:T.green },
            { label:t("referrals.screen.stats.monthsFree"), val:`${rewarded*2}`,   bg:T.brandLight, color:T.brand },
            { label:t("referrals.screen.stats.totalSent"),  val:referrals.length,  bg:T.surface2, color:T.muted },
          ].map(m=>(
            <View key={m.label} style={{ flex:1, backgroundColor:m.bg, borderRadius:T.r.md, padding:12 }}>
              <Text style={{ fontSize:10, fontWeight:"700", color:m.color, textTransform:"uppercase", letterSpacing:0.5 }}>{m.label}</Text>
              <Text style={{ fontSize:22, fontWeight:"800", color:m.color }}>{m.val}</Text>
            </View>
          ))}
        </View>

        {/* Share card */}
        <Card style={{ marginBottom:14 }}>
          <Text style={{ fontSize:15, fontWeight:"700", marginBottom:6 }}>{t("referrals.linkCard.title")}</Text>
          <Text style={{ fontSize:13, color:T.muted, marginBottom:14, lineHeight:20 }}>
            {t("referrals.screen.linkCard.bodyPrefix")}<Text style={{ fontWeight:"700", color:T.brand }}>{t("referrals.screen.linkCard.boldPhrase")}</Text>{t("referrals.screen.linkCard.bodySuffix")}
          </Text>
          <View style={{ backgroundColor:T.surface2, borderRadius:T.r.md, padding:12, marginBottom:12 }}>
            <Text style={{ fontSize:12, color:T.muted, fontFamily:"monospace" }} numberOfLines={1}>{referralUrl}</Text>
          </View>
          <View style={[SS.row, { gap:8 }]}>
            <Btn style={{ flex:1, justifyContent:"center" }} onPress={shareLink}>📤 {t("referrals.screen.linkCard.shareLinkBtn")}</Btn>
            <Btn variant="ghost" style={{ flex:1, justifyContent:"center" }} onPress={()=>setSheet(true)}>✉️ {t("referrals.screen.linkCard.sendInviteBtn")}</Btn>
          </View>
        </Card>

        {/* How it works */}
        <Card style={{ backgroundColor:T.surface2, borderWidth:0, marginBottom:14 }}>
          <Text style={{ fontSize:14, fontWeight:"700", marginBottom:10 }}>{t("referrals.screen.howItWorks.title")}</Text>
          {["1","2","3","4"].map((num,i)=>(
            <View key={num} style={[SS.row, { paddingVertical:10, borderBottomWidth:i<3?1:0, borderBottomColor:T.border, gap:12 }]}>
              <View style={{ width:26, height:26, borderRadius:13, backgroundColor:T.brand, alignItems:"center", justifyContent:"center" }}>
                <Text style={{ color:"#fff", fontSize:12, fontWeight:"800" }}>{i+1}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={{ fontSize:14, fontWeight:"600" }}>{t(`referrals.screen.howItWorks.step${num}.title`)}</Text>
                <Text style={{ fontSize:12, color:T.muted, marginTop:2 }}>{t(`referrals.screen.howItWorks.step${num}.desc`)}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Referrals list */}
        <Text style={{ fontSize:12, fontWeight:"700", color:T.muted, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>{t("referrals.screen.yourReferralsCount", { count: referrals.length })}</Text>
        {referrals.length===0
          ? <EmptyState icon="🎁" message={t("referrals.screen.emptyMessage")} action={<Btn size="sm" onPress={()=>setSheet(true)}>{t("referrals.table.referFirst")}</Btn>}/>
          : referrals.map(r=>(
              <Card key={r.id} style={{ marginBottom:8 }}>
                <View style={SS.spaceBetween}>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontSize:14, fontWeight:"700" }}>{r.referred_name||r.referred_email||"—"}</Text>
                    <Text style={{ fontSize:12, color:T.muted, marginTop:2 }}>{r.referred_email}</Text>
                    <Text style={{ fontSize:11, color:T.hint, marginTop:2 }}>{t("referrals.screen.codeLabel", { code: r.referral_code })}</Text>
                  </View>
                  <View style={{ alignItems:"flex-end", gap:6 }}>
                    <Badge color={STATUS_COLOR[r.status]||"gray"}>{t(`referrals.status.${r.status}`)}</Badge>
                    {r.status==="rewarded" && <Text style={{ fontSize:12, fontWeight:"700", color:T.green }}>{t("referrals.screen.rewardMonthsShort", { count: r.reward_months })}</Text>}
                  </View>
                </View>
              </Card>
            ))
        }
      </ScrollView>

      <Sheet visible={sheet} onClose={()=>setSheet(false)} title={t("referrals.modal.title")} height="55%">
        <Text style={{ fontSize:13, color:T.muted, marginBottom:16, lineHeight:20 }}>
          {t("referrals.screen.sheet.intro")}
        </Text>
        <Field label={t("referrals.modal.theirNameLabel")}>
          <Input value={form.name} onChangeText={v=>setForm(p=>({...p,name:v}))} placeholder="Pete Larkin" autoFocus/>
        </Field>
        <Field label={t("referrals.modal.theirEmailLabel")}>
          <Input value={form.email} onChangeText={v=>setForm(p=>({...p,email:v}))} keyboardType="email-address" autoCapitalize="none" placeholder="pete@plumbing.co.uk"/>
        </Field>
        <View style={{ backgroundColor:T.brandLight, borderRadius:T.r.md, padding:12, marginBottom:14 }}>
          <Text style={{ fontSize:13, color:T.brand, lineHeight:20 }}>
            🎁 {t("referrals.screen.sheet.giftNote")}
          </Text>
        </View>
        <Btn onPress={sendReferral} disabled={saving}>{saving?t("referrals.screen.sheet.sending"):t("referrals.screen.sheet.sendInviteBtn")}</Btn>
      </Sheet>
    </View>
  );
}
