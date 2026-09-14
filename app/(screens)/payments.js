// app/(screens)/payments.js
//
// Parité avec PaymentsPage.jsx (web) : détection réelle de la connexion
// Stripe (au lieu de toujours afficher "connecté"), bouton "Connecter
// Stripe" quand ce n'est pas le cas, gestion d'erreur structurée avec
// retry, bouton de synchronisation, formulaire de coordonnées bancaires
// (IBAN/BIC) comme alternative à Stripe, copie d'ID de transaction.

import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Linking, TextInput, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { useProfile } from "../../src/hooks/useProfile";
import { getTransactions, getPayouts, getStripeConnectUrl, updateProfile } from "../../src/lib/db";
import { Card, Btn, Badge, EmptyState, Spinner, MetricCard } from "../../src/components/UI";
import { T, SS, fmt, fmtDate } from "../../src/styles/tokens";

const STATUS_COLOR = { completed:"green", pending:"amber", failed:"red", refunded:"gray", paid:"green", in_transit:"blue" };

// Validation IBAN légère (mod-97) — identique à web, juste pour attraper
// les fautes de frappe, pas une vérification bancaire complète.
function isValidIban(raw) {
  const iban = (raw || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => (ch.charCodeAt(0) - 55).toString());
  let remainder = numeric;
  while (remainder.length > 2) {
    const chunk = remainder.slice(0, 9);
    remainder = (parseInt(chunk, 10) % 97) + remainder.slice(chunk.length);
  }
  return parseInt(remainder, 10) % 97 === 1;
}

function FeeRow({ label, value, muted }) {
  return (
    <View style={[SS.spaceBetween, { paddingVertical:8, borderBottomWidth:1, borderBottomColor:T.border }]}>
      <Text style={{ fontSize:13, color:muted?T.muted:T.text }}>{label}</Text>
      <Text style={{ fontSize:14, fontWeight:muted?"400":"700", color:muted?T.muted:T.text }}>{value}</Text>
    </View>
  );
}

function StructuredError({ what, why, action, onRetry }) {
  return (
    <View style={{ padding:16, backgroundColor:T.redBg, borderRadius:T.r.md, marginBottom:20 }}>
      <Text style={{ fontWeight:"700", color:T.red, marginBottom:4 }}>{what}</Text>
      <Text style={{ fontSize:13, color:T.red, marginBottom:8 }}>{why}</Text>
      <View style={SS.spaceBetween}>
        <Text style={{ fontSize:12, color:T.red, flex:1 }}>{action}</Text>
        {onRetry && <Btn size="sm" variant="ghost" onPress={onRetry}>Réessayer</Btn>}
      </View>
    </View>
  );
}

export default function PaymentsScreen() {
  const { t }        = useTranslation();
  const insets       = useSafeAreaInsets();
  const { profile, refresh } = useProfile();
  const [transactions, setTransactions] = useState([]);
  const [payouts,      setPayouts]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [tab,          setTab]          = useState("overview");
  const [isLoading,    setIsLoading]    = useState(false);
  const [pageError,    setPageError]    = useState(null);

  const [bankForm, setBankForm] = useState({
    bank_account_holder: profile?.bank_account_holder ?? profile?.name ?? "",
    iban: profile?.iban ?? "",
    bic: profile?.bic ?? "",
  });
  const [savingBank, setSavingBank] = useState(false);

  useEffect(() => {
    setBankForm({
      bank_account_holder: profile?.bank_account_holder ?? profile?.name ?? "",
      iban: profile?.iban ?? "",
      bic: profile?.bic ?? "",
    });
  }, [profile?.bank_account_holder, profile?.iban, profile?.bic, profile?.name]);

  const statusLabel = (s) => {
    const key = `payments.status.${s}`;
    const val = t(key);
    return val === key ? s.replace("_", " ") : val;
  };

  const load = useCallback(async (refresh=false) => {
    if (!profile?.id) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    const [{ data:tx }, { data:p }] = await Promise.all([
      getTransactions(profile.id),
      getPayouts(profile.id),
    ]);
    setTransactions(tx??[]);
    setPayouts(p??[]);
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const isConnected = Boolean(profile?.stripe_customer_id || profile?.stripe_account_id);

  async function handleConnect() {
    setIsLoading(true);
    setPageError(null);
    try {
      const { data, error } = await getStripeConnectUrl(profile?.id, "vimen://payments?tab=connect");
      if (error || !data?.url) throw new Error(error?.message || "URL Stripe manquante");
      await Linking.openURL(data.url);
    } catch {
      setPageError({
        what: t("payments.errors.connectFailedWhat") || "Impossible de démarrer la connexion Stripe",
        why: t("payments.errors.connectFailedWhy") || "Le service de paiement est temporairement indisponible",
        action: t("payments.errors.connectFailedAction") || "Vérifie ta connexion et réessaie",
      });
    }
    setIsLoading(false);
  }

  async function handleSync() {
    setIsLoading(true);
    setPageError(null);
    try {
      if (refresh) await refresh();
      Alert.alert(t("payments.connect.syncSuccess") || "Synchronisation effectuée");
    } catch {
      setPageError({
        what: t("payments.errors.syncFailedWhat") || "Impossible de synchroniser le compte",
        why: t("payments.errors.syncFailedWhy") || "Le service de paiement est temporairement indisponible",
        action: t("payments.errors.syncFailedAction") || "Réessaie dans quelques instants",
      });
    }
    setIsLoading(false);
  }

  async function handleCopyId(id) {
    await Clipboard.setStringAsync(id);
    Alert.alert(t("payments.copied") || "Identifiant copié");
  }

  async function handleSaveBank() {
    const cleanIban = bankForm.iban.replace(/\s+/g, "").toUpperCase();
    if (cleanIban && !isValidIban(cleanIban)) {
      Alert.alert(t("payments.bankTransfer.invalidIban") || "Cet IBAN ne semble pas valide, vérifie-le.");
      return;
    }
    setSavingBank(true);
    const { error } = await updateProfile(profile?.clerk_id, {
      bank_account_holder: bankForm.bank_account_holder,
      iban: cleanIban,
      bic: bankForm.bic.trim().toUpperCase(),
    });
    setSavingBank(false);
    if (error) {
      Alert.alert(t("payments.bankTransfer.saveFailed") || "Échec de l'enregistrement, réessaie");
      return;
    }
    if (refresh) await refresh();
    Alert.alert(t("payments.bankTransfer.saved") || "Coordonnées bancaires enregistrées");
  }

  const completed  = transactions.filter(t=>t.status==="completed");
  const totalVol   = completed.reduce((s,t)=>s+Number(t.gross_amount),0);
  const totalNet   = completed.reduce((s,t)=>s+Number(t.net_amount),0);
  const paidOut    = payouts.filter(p=>p.status==="paid").reduce((s,p)=>s+Number(p.amount),0);
  const inTransit  = payouts.filter(p=>p.status==="in_transit").reduce((s,p)=>s+Number(p.amount),0);
  const balance    = totalNet - paidOut;

  if (loading) return <Spinner/>;

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      <View style={{ backgroundColor:T.surface, paddingTop:insets.top+8, paddingBottom:14, paddingHorizontal:20, borderBottomWidth:1, borderBottomColor:T.border }}>
        <Text style={{ fontSize:22, fontWeight:"900", color:T.text, letterSpacing:-0.5, marginBottom:14 }}>{t("payments.title")}</Text>
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

        {pageError && <StructuredError {...pageError} onRetry={handleSync} />}

        {/* OVERVIEW */}
        {tab==="overview" && (
          <>
            {!isConnected ? (
              <View style={{ backgroundColor:T.amberBg, borderRadius:T.r.lg, padding:14, marginBottom:16 }}>
                <Text style={{ fontWeight:"700", color:T.amber, marginBottom:4 }}>{t("payments.overview.notConnectedTitle")}</Text>
                <Text style={{ fontSize:13, color:T.muted, marginBottom:12 }}>{t("payments.overview.notConnectedDesc")}</Text>
                <Btn onPress={handleConnect} disabled={isLoading}>
                  {isLoading ? (t("actions.loading") || "Chargement...") : t("payments.overview.connectStripeBtn")}
                </Btn>
              </View>
            ) : (
              <View style={{ backgroundColor:T.greenBg, borderRadius:T.r.lg, padding:14, marginBottom:16, flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
                <Text style={{ fontWeight:"700", color:T.green, flex:1 }}>{t("payments.overview.connectedBanner")}</Text>
                <Badge color="green">{t("payments.status.connected")}</Badge>
              </View>
            )}

            <View style={[SS.row, { gap:10, marginBottom:10 }]}>
              <MetricCard label={t("payments.metrics.totalVolume")}   value={fmt(totalVol)}  sub={t("payments.metrics.paymentsCount", { count: completed.length })} accent/>
              <MetricCard label={t("payments.metrics.yourEarnings")}  value={fmt(totalNet)}  sub={t("payments.metrics.afterFees")}/>
            </View>
            <View style={[SS.row, { gap:10, marginBottom:16 }]}>
              <MetricCard label={t("payments.metrics.balance")}        value={fmt(balance)}   sub={t("payments.metrics.readyToPayOut")}/>
              <MetricCard label={t("payments.metrics.inTransit")}     value={fmt(inTransit)} sub={t("payments.metrics.arrivingSoon")}/>
            </View>

            <Card>
              <Text style={[{ fontSize:15, fontWeight:"700", marginBottom:12 }]}>{t("payments.overview.recentPayments")}</Text>
              {completed.length===0
                ? <EmptyState icon="💳" message={t("payments.overview.noPayments")}/>
                : completed.slice(0,5).map(tx=>(
                    <View key={tx.id} style={[SS.spaceBetween, { paddingVertical:10, borderBottomWidth:1, borderBottomColor:T.border }]}>
                      <View style={{ flex:1 }}>
                        <Text style={{ fontSize:14, fontWeight:"600" }}>{tx.client_name||"—"}</Text>
                        <Text style={{ fontSize:12, color:T.muted }}>{fmtDate(tx.paid_at||tx.created_at)}</Text>
                      </View>
                      <View style={{ alignItems:"flex-end" }}>
                        <Text style={{ fontSize:15, fontWeight:"800", color:T.green }}>{fmt(tx.net_amount)}</Text>
                        <Text style={{ fontSize:11, color:T.muted }}>{t("payments.overview.ofGross", { amount: fmt(tx.gross_amount) })}</Text>
                      </View>
                    </View>
                  ))
              }
            </Card>

            <Card style={{ marginTop:0 }}>
              <Text style={{ fontSize:15, fontWeight:"700", marginBottom:14 }}>{t("payments.feeExample.title")}</Text>
              {(() => {
                const gross=550, sf=Math.round((550*0.014+0.20)*100)/100, net=Math.round((550-sf)*100)/100;
                return (
                  <>
                    <FeeRow label={t("payments.feeExample.invoiceAmount")}        value={fmt(gross)}/>
                    <FeeRow label={t("payments.feeExample.stripeFee")} value={`−${fmt(sf)}`} muted/>
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
              : transactions.map(tx=>(
                  <TouchableOpacity key={tx.id} onLongPress={() => handleCopyId(tx.id)} activeOpacity={0.85}>
                    <Card style={{ marginBottom:8 }}>
                      <View style={SS.spaceBetween}>
                        <View style={{ flex:1 }}>
                          <Text style={{ fontSize:14, fontWeight:"700" }}>{tx.client_name||"—"}</Text>
                          <Text style={{ fontSize:12, color:T.muted, marginTop:2 }}>{tx.description||""} · {fmtDate(tx.paid_at||tx.created_at)}</Text>
                          <Text style={{ fontSize:10, color:T.hint, marginTop:2 }}>{t("payments.holdToCopyId") || "Hold to copy ID"}</Text>
                        </View>
                        <View style={{ alignItems:"flex-end", gap:4 }}>
                          <Text style={{ fontSize:16, fontWeight:"800", color:T.green }}>{fmt(tx.net_amount)}</Text>
                          <Text style={{ fontSize:11, color:T.muted }}>{t("payments.transactions.grossAmount", { amount: fmt(tx.gross_amount) })}</Text>
                          <Badge color={STATUS_COLOR[tx.status]||"gray"}>{statusLabel(tx.status)}</Badge>
                        </View>
                      </View>
                    </Card>
                  </TouchableOpacity>
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
              <Text style={{ fontSize:13, color:T.muted, lineHeight:20 }}>{t("payments.payouts.autoDescription")}</Text>
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
                  <Text style={{ fontSize:13, color:T.muted, marginTop:2 }}>
                    {isConnected ? t("payments.connect.connectedDesc") : t("payments.connect.notConnectedDesc")}
                  </Text>
                </View>
                <Badge color={isConnected ? "green" : "amber"}>
                  {isConnected ? t("payments.status.active") : t("payments.status.notConnected")}
                </Badge>
              </View>

              {isConnected ? (
                <View>
                  <Text style={{ fontSize:13, color:T.muted, marginBottom:14 }}>{t("payments.connect.connectedBody")}</Text>
                  <View style={[SS.row, { gap:8 }]}>
                    <Btn variant="ghost" size="sm" style={{ flex:1 }} onPress={()=>Linking.openURL("https://dashboard.stripe.com")}>
                      {t("payments.connect.openDashboard")}
                    </Btn>
                    <Btn size="sm" style={{ flex:1 }} onPress={handleSync} disabled={isLoading}>
                      {isLoading ? (t("actions.loading") || "Chargement...") : (t("payments.connect.syncBtn") || "Synchroniser")}
                    </Btn>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={{ fontSize:13, color:T.muted, marginBottom:16, lineHeight:20 }}>{t("payments.connect.notConnectedBody")}</Text>
                  <Btn onPress={handleConnect} disabled={isLoading}>
                    {isLoading ? "Chargement..." : t("payments.connect.connectAccountBtn")}
                  </Btn>
                </View>
              )}
            </Card>

            <Card>
              <Text style={{ fontSize:15, fontWeight:"700", marginBottom:6 }}>{t("payments.bankTransfer.title") || "Coordonnées bancaires (RIB)"}</Text>
              <Text style={{ fontSize:13, color:T.muted, marginBottom:16, lineHeight:20 }}>
                {t("payments.bankTransfer.desc") || "Pas de compte Stripe ? Renseigne ton IBAN pour que tes clients puissent te payer par virement bancaire."}
              </Text>

              <Text style={{ fontSize:12, fontWeight:"600", color:T.muted, marginBottom:4 }}>{t("payments.bankTransfer.holderLabel") || "Titulaire du compte"}</Text>
              <TextInput
                value={bankForm.bank_account_holder}
                onChangeText={v => setBankForm(f => ({ ...f, bank_account_holder: v }))}
                placeholder={t("payments.bankTransfer.holderPlaceholder") || "ex. Jean Dupont"}
                style={{ borderWidth:1, borderColor:T.border, borderRadius:T.r.md, padding:10, fontSize:14, marginBottom:12 }}
              />

              <Text style={{ fontSize:12, fontWeight:"600", color:T.muted, marginBottom:4 }}>IBAN</Text>
              <TextInput
                value={bankForm.iban}
                onChangeText={v => setBankForm(f => ({ ...f, iban: v }))}
                placeholder="FR76 3000 6000 0112 3456 7890 189"
                autoCapitalize="characters"
                style={{ borderWidth:1, borderColor:T.border, borderRadius:T.r.md, padding:10, fontSize:14, fontFamily:"monospace", letterSpacing:0.5, marginBottom:12 }}
              />

              <Text style={{ fontSize:12, fontWeight:"600", color:T.muted, marginBottom:4 }}>BIC</Text>
              <TextInput
                value={bankForm.bic}
                onChangeText={v => setBankForm(f => ({ ...f, bic: v }))}
                placeholder="BNPAFRPPXXX"
                autoCapitalize="characters"
                style={{ borderWidth:1, borderColor:T.border, borderRadius:T.r.md, padding:10, fontSize:14, marginBottom:16 }}
              />

              <Btn onPress={handleSaveBank} disabled={savingBank}>
                {savingBank ? (t("actions.loading") || "Enregistrement...") : (t("actions.save") || "Enregistrer")}
              </Btn>
            </Card>

            <Card style={{ backgroundColor:T.surface2, borderWidth:0 }}>
              <Text style={{ fontSize:15, fontWeight:"700", marginBottom:4 }}>{t("payments.connect.feeStructureTitle")}</Text>
              <Text style={{ fontSize:12, color:T.muted, marginBottom:12 }}>
                {t("payments.connect.noCommissionNote") || "Vimen doesn't charge any commission for now — you only pay Stripe's standard processing fee."}
              </Text>
              {[
                [t("payments.connect.feeRows.stripeProcessing"), "1.4% + 20p", t("payments.connect.feeRows.stripeProcessingNote")],
              ].map(([label,feeVal,note])=>(
                <View key={label} style={[SS.spaceBetween, { paddingVertical:10, borderBottomWidth:1, borderBottomColor:T.border }]}>
                  <View>
                    <Text style={{ fontSize:14, fontWeight:"500" }}>{label}</Text>
                    <Text style={{ fontSize:12, color:T.muted }}>{note}</Text>
                  </View>
                  <Text style={{ fontSize:15, fontWeight:"700" }}>{feeVal}</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
