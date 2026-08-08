// app/(screens)/payments.js
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { useProfile } from "../../src/hooks/useProfile";
import { getTransactions, getPayouts } from "../../src/lib/db";
import { Card, Btn, Badge, EmptyState, Spinner, MetricCard } from "../../src/components/UI";
import { T, SS, fmt, fmtDate } from "../../src/styles/tokens";

const STATUS_COLOR = { completed:"green", pending:"amber", failed:"red", refunded:"gray", paid:"green", in_transit:"blue" };

function FeeRow({ label, value, muted }) {
  return (
    <View style={[SS.spaceBetween, { paddingVertical:8, borderBottomWidth:1, borderBottomColor:T.border }]}>
      <Text style={{ fontSize:13, color:muted?T.muted:T.text }}>{label}</Text>
      <Text style={{ fontSize:14, fontWeight:muted?"400":"700", color:muted?T.muted:T.text }}>{value}</Text>
    </View>
  );
}

export default function PaymentsScreen() {
  const { t }        = useTranslation();
  const insets       = useSafeAreaInsets();
  const { profile }  = useProfile();
  const [transactions, setTransactions] = useState([]);
  const [payouts,      setPayouts]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [tab,          setTab]          = useState("overview");

  // The homemade i18n engine doesn't support a `defaultValue` option like
  // react-i18next did — it falls back English → the raw key itself, never
  // to an arbitrary caller-supplied string. So the fallback to a
  // human-readable status (e.g. "in_transit" → "in transit") is done here
  // manually: if the lookup returned the key unchanged, nothing was found
  // for either language and we use the derived fallback instead.
  const statusLabel = (s) => {
    const key = `payments.status.${s}`;
    const val = t(key);
    return val === key ? s.replace("_", " ") : val;
  };

  const load = useCallback(async (refresh=false) => {
    if (!profile?.id) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    const [{ data:t }, { data:p }] = await Promise.all([
      getTransactions(profile.id),
      getPayouts(profile.id),
    ]);
    setTransactions(t??[]);
    setPayouts(p??[]);
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const completed  = transactions.filter(t=>t.status==="completed");
  const totalVol   = completed.reduce((s,t)=>s+Number(t.gross_amount),0);
  const totalNet   = completed.reduce((s,t)=>s+Number(t.net_amount),0);
  const totalFees  = completed.reduce((s,t)=>s+Number(t.platform_fee)+Number(t.stripe_fee),0);
  const paidOut    = payouts.filter(p=>p.status==="paid").reduce((s,p)=>s+Number(p.amount),0);
  const inTransit  = payouts.filter(p=>p.status==="in_transit").reduce((s,p)=>s+Number(p.amount),0);
  const balance    = totalNet - paidOut;

  if (loading) return <Spinner/>;

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      {/* Header */}
      <View style={{ backgroundColor:T.surface, paddingTop:insets.top+8, paddingBottom:14, paddingHorizontal:20, borderBottomWidth:1, borderBottomColor:T.border }}>
        <Text style={{ fontSize:22, fontWeight:"900", color:T.text, letterSpacing:-0.5, marginBottom:14 }}>{t("payments.title")}</Text>
        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={SS.row}>
            {[["overview",t("payments.tabs.overview")],["transactions",t("payments.tabs.transactions")],["payouts",t("payments.tabs.payouts")],["connect",t("payments.tabs.account")]].map(([id,label])=>(
              <TouchableOpacity key={id} onPress={()=>setTab(id)}
                style={{ paddingHorizontal:14, paddingVertical:7, borderRadius:T.r.full, marginRight:8, backgroundColor:tab===id?T.brand:T.surface2 }}>
                <Text style={{ fontSize:13, fontWeight:"600", color:tab===id?"#fff":T.muted }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:insets.bottom+90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor={T.brand}/>}>

        {/* OVERVIEW */}
        {tab==="overview" && (
          <>
            {/* Connected banner */}
            <View style={{ backgroundColor:T.greenBg, borderRadius:T.r.lg, padding:14, marginBottom:16, flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
              <Text style={{ fontWeight:"700", color:T.green, flex:1 }}>{t("payments.overview.activeBanner")}</Text>
              <Badge color="green">{t("payments.overview.connected")}</Badge>
            </View>

            {/* Metrics 2×2 */}
            <View style={[SS.row, { gap:10, marginBottom:10 }]}>
              <MetricCard label={t("payments.metrics.totalVolume")}   value={fmt(totalVol)}  sub={t("payments.metrics.paymentsCount", { count: completed.length })} accent/>
              <MetricCard label={t("payments.metrics.yourEarnings")}  value={fmt(totalNet)}  sub={t("payments.metrics.afterFees")}/>
            </View>
            <View style={[SS.row, { gap:10, marginBottom:16 }]}>
              <MetricCard label={t("payments.metrics.balance")}        value={fmt(balance)}   sub={t("payments.metrics.readyToPayOut")}/>
              <MetricCard label={t("payments.metrics.inTransit")}     value={fmt(inTransit)} sub={t("payments.metrics.arrivingSoon")}/>
            </View>

            {/* Recent transactions */}
            <Card>
              <Text style={[{ fontSize:15, fontWeight:"700", marginBottom:12 }]}>{t("payments.overview.recentPayments")}</Text>
              {completed.length===0
                ? <EmptyState icon="💳" message={t("payments.overview.noPayments")}/>
                : completed.slice(0,5).map(t=>(
                    <View key={t.id} style={[SS.spaceBetween, { paddingVertical:10, borderBottomWidth:1, borderBottomColor:T.border }]}>
                      <View style={{ flex:1 }}>
                        <Text style={{ fontSize:14, fontWeight:"600" }}>{t.client_name||"—"}</Text>
                        <Text style={{ fontSize:12, color:T.muted }}>{fmtDate(t.paid_at||t.created_at)}</Text>
                      </View>
                      <View style={{ alignItems:"flex-end" }}>
                        <Text style={{ fontSize:15, fontWeight:"800", color:T.green }}>{fmt(t.net_amount)}</Text>
                        <Text style={{ fontSize:11, color:T.muted }}>{t("payments.overview.ofGross", { amount: fmt(t.gross_amount) })}</Text>
                      </View>
                    </View>
                  ))
              }
            </Card>

            {/* Fee explainer */}
            <Card style={{ marginTop:0 }}>
              <Text style={{ fontSize:15, fontWeight:"700", marginBottom:14 }}>{t("payments.feeExample.title")}</Text>
              {(() => {
                const gross=550, sf=Math.round((550*0.014+0.20)*100)/100, pf=Math.round(550*0.02*100)/100, net=Math.round((550-sf-pf)*100)/100;
                return (
                  <>
                    <FeeRow label={t("payments.feeExample.invoiceAmount")}        value={fmt(gross)}/>
                    <FeeRow label={t("payments.feeExample.stripeFee")} value={`−${fmt(sf)}`} muted/>
                    <FeeRow label={t("payments.feeExample.VinemPayFee")}       value={`−${fmt(pf)}`} muted/>
                    <View style={[SS.spaceBetween, { paddingTop:10 }]}>
                      <Text style={{ fontSize:15, fontWeight:"800" }}>{t("payments.feeExample.youReceive")}</Text>
                      <Text style={{ fontSize:18, fontWeight:"900", color:T.green }}>{fmt(net)}</Text>
                    </View>
                  </>
                );
              })()}
            </Card>
          </>
        )}

        {/* TRANSACTIONS */}
        {tab==="transactions" && (
          <>
            {/* Summary */}
            <View style={[SS.row, { gap:10, marginBottom:16 }]}>
              <View style={{ flex:1, backgroundColor:T.surface, borderRadius:T.r.md, padding:14, borderWidth:1, borderColor:T.border }}>
                <Text style={{ fontSize:10, fontWeight:"700", color:T.muted, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>{t("payments.transactions.gross")}</Text>
                <Text style={{ fontSize:18, fontWeight:"800" }}>{fmt(totalVol)}</Text>
              </View>
              <View style={{ flex:1, backgroundColor:T.greenBg, borderRadius:T.r.md, padding:14 }}>
                <Text style={{ fontSize:10, fontWeight:"700", color:T.green, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>{t("payments.transactions.netToYou")}</Text>
                <Text style={{ fontSize:18, fontWeight:"800", color:T.green }}>{fmt(totalNet)}</Text>
              </View>
            </View>
            {transactions.length===0
              ? <EmptyState icon="💳" message={t("payments.transactions.empty")}/>
              : transactions.map(t=>(
                  <Card key={t.id} style={{ marginBottom:8 }}>
                    <View style={SS.spaceBetween}>
                      <View style={{ flex:1 }}>
                        <Text style={{ fontSize:14, fontWeight:"700" }}>{t.client_name||"—"}</Text>
                        <Text style={{ fontSize:12, color:T.muted, marginTop:2 }}>{t.description||""} · {fmtDate(t.paid_at||t.created_at)}</Text>
                      </View>
                      <View style={{ alignItems:"flex-end", gap:4 }}>
                        <Text style={{ fontSize:16, fontWeight:"800", color:T.green }}>{fmt(t.net_amount)}</Text>
                        <Text style={{ fontSize:11, color:T.muted }}>{t("payments.transactions.grossAmount", { amount: fmt(t.gross_amount) })}</Text>
                        <Badge color={STATUS_COLOR[t.status]||"gray"}>{statusLabel(t.status)}</Badge>
                      </View>
                    </View>
                  </Card>
                ))
            }
          </>
        )}

        {/* PAYOUTS */}
        {tab==="payouts" && (
          <>
            <View style={[SS.row, { gap:10, marginBottom:16 }]}>
              <MetricCard label={t("payments.metrics.balance")} value={fmt(balance)} sub={t("payments.payouts.ready")} accent/>
              <MetricCard label={t("payments.metrics.inTransit")} value={fmt(inTransit)} sub={t("payments.payouts.twoDays")}/>
              <MetricCard label={t("payments.payouts.paidOut")} value={fmt(paidOut)} sub={t("payments.payouts.total")}/>
            </View>
            <Card style={{ marginBottom:16, backgroundColor:T.surface2, borderWidth:0 }}>
              <Text style={{ fontSize:14, fontWeight:"700", marginBottom:6 }}>{t("payments.payouts.autoTitle")}</Text>
              <Text style={{ fontSize:13, color:T.muted, lineHeight:20 }}>
                {t("payments.payouts.autoDescription")}
              </Text>
            </Card>
            {payouts.length===0
              ? <EmptyState icon="🏦" message={t("payments.payouts.empty")}/>
              : payouts.map(p=>(
                  <Card key={p.id} style={{ marginBottom:8 }}>
                    <View style={SS.spaceBetween}>
                      <View>
                        <Text style={{ fontSize:14, fontWeight:"700" }}>{fmt(p.amount)}</Text>
                        <Text style={{ fontSize:12, color:T.muted, marginTop:2 }}>
                          {t("payments.payouts.summary", { count: p.transaction_count, last4: p.bank_last4 })}
                        </Text>
                        {p.arrival_date && <Text style={{ fontSize:12, color:T.muted }}>{t("payments.payouts.arrives", { date: fmtDate(p.arrival_date) })}</Text>}
                      </View>
                      <Badge color={STATUS_COLOR[p.status]||"gray"}>{statusLabel(p.status)}</Badge>
                    </View>
                  </Card>
                ))
            }
          </>
        )}

        {/* CONNECT */}
        {tab==="connect" && (
          <>
            <Card>
              <View style={[SS.row, { gap:14, marginBottom:16 }]}>
                <View style={{ width:48, height:48, borderRadius:T.r.md, backgroundColor:"#635BFF", alignItems:"center", justifyContent:"center" }}>
                  <Text style={{ fontSize:24 }}>💳</Text>
                </View>
                <View style={{ flex:1 }}>
                  <Text style={{ fontSize:15, fontWeight:"700" }}>{t("payments.connect.stripeConnect")}</Text>
                  <Text style={{ fontSize:13, color:T.muted, marginTop:2 }}>{t("payments.connect.description")}</Text>
                </View>
                <Badge color="green">{t("payments.connect.active")}</Badge>
              </View>
              <Btn variant="ghost" onPress={()=>Linking.openURL("https://dashboard.stripe.com")}>
                {t("payments.connect.openDashboard")}
              </Btn>
            </Card>
            <Card style={{ backgroundColor:T.surface2, borderWidth:0 }}>
              <Text style={{ fontSize:15, fontWeight:"700", marginBottom:12 }}>{t("payments.connect.feeStructureTitle")}</Text>
              {[
                [t("payments.connect.feeRows.stripeProcessing"), "1.4% + 20p", t("payments.connect.feeRows.stripeProcessingNote")],
                [t("payments.connect.feeRows.VinemPay"), "2.0%", t("payments.connect.feeRows.VinemPayNote")],
                [t("payments.connect.feeRows.total"), "~3.4%", t("payments.connect.feeRows.totalNote")],
              ].map(([label,fee,note])=>(
                <View key={label} style={[SS.spaceBetween, { paddingVertical:10, borderBottomWidth:1, borderBottomColor:T.border }]}>
                  <View>
                    <Text style={{ fontSize:14, fontWeight:"500" }}>{label}</Text>
                    <Text style={{ fontSize:12, color:T.muted }}>{note}</Text>
                  </View>
                  <Text style={{ fontSize:15, fontWeight:"700" }}>{fee}</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
