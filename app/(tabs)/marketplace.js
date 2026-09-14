// app/(tabs)/marketplace.js
//
// Parité avec MarketplacePage.jsx (web) : recherche, filtre métier, filtre
// urgent, 4 types (demand/sale/recruitment/materials), pagination, vue
// "Mes annonces" avec suppression, barre de stats, formulaire de
// publication multi-étapes avec champs spécifiques par type.
//
// NON inclus pour l'instant : upload de photos sur les annonces matériaux
// (web permet jusqu'à 3 photos) — nécessite expo-image-picker + un flow
// d'upload vers Supabase Storage qu'on n'a pas encore vérifié côté mobile.
// À faire dans un second temps si besoin.

import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useProfile } from "../../src/hooks/useProfile";
import {
  getListings, getMyListings, createListing, updateListing,
  deleteListing, expressInterest,
} from "../../src/lib/db";
import { checkRateLimit } from "../../src/lib/security";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import {
  Card, Btn, Badge, EmptyState, Spinner, Sheet, Field, Input,
  SelectPicker, Toggle, MetricCard, ConfirmSheet,
} from "../../src/components/UI";
import { T, SS, fmt } from "../../src/styles/tokens";
import { VERTICALS, getVerticalForProfession } from "../../src/lib/professions";

const PAGE_SIZE = 24;
const MATERIAL_CATEGORIES = ["Electrical", "Plumbing", "General", "Safety", "Tools", "Other"];
const MATERIAL_CONDITIONS = ["New", "Like new", "Used", "For parts"];

const PROFESSION_GROUPS = Object.values(VERTICALS)
  .filter(v => v.id !== "other")
  .map(v => ({ label: `${v.icon}  ${v.label}`, options: v.professions }))
  .concat([{ label: "Other", options: ["Other"] }]);

export default function MarketplaceScreen() {
  const insets      = useSafeAreaInsets();
  const { t }       = useTranslation();
  const { profile } = useProfile();
  const { getToken } = useAuth();

  const [view, setView]           = useState("browse"); // browse | mine
  const [listings, setListings]   = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [page, setPage]           = useState(0);
  const [hasMore, setHasMore]     = useState(true);

  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch]         = useState("");
  const [filterTrade, setFilterTrade] = useState("All trades");
  const [filterUrgent, setFilterUrgent] = useState(false);

  const [detail,    setDetail]    = useState(null);
  const [postOpen,  setPostOpen]  = useState(false);
  const [interestOpen, setInterestOpen] = useState(false);
  const [delId, setDelId]         = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [postStep,  setPostStep]  = useState(1); // 1=type, 2=details, 3=contact
  const [postType,  setPostType]  = useState("demand");
  const [postForm,  setPostForm]  = useState({});
  const [intForm,   setIntForm]   = useState({ name: "", email: "", phone: "", message: "" });
  const [error, setError] = useState(null);

  const TYPE_META = {
    demand:      { icon: "🛒", label: t("marketplace.typeDemand"),      color: T.blueBg,  text: T.blue  },
    sale:        { icon: "🏪", label: t("marketplace.typeSale"),        color: T.amberBg, text: T.amber },
    recruitment: { icon: "👷", label: t("marketplace.typeRecruitment"), color: T.greenBg, text: T.green },
    materials:   { icon: "🧰", label: t("marketplace.typeMaterials") || "Materials", color: T.purpleBg ?? T.surface2, text: T.purple ?? T.text },
  };

  function timeAgo(d) {
    const days = Math.floor((Date.now() - new Date(d)) / 86400000);
    if (days === 0) return t("marketplace.today");
    if (days === 1) return t("marketplace.yesterday");
    if (days < 7)   return t("marketplace.daysAgo", { count: days });
    return t("marketplace.weeksAgo", { count: Math.floor(days / 7) });
  }

  const load = useCallback(async (targetPage = 0, refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const filters = {
        type: typeFilter !== "all" ? typeFilter : undefined,
        trade: filterTrade !== "All trades" ? filterTrade : undefined,
        urgent: filterUrgent || undefined,
      };
      const { data, error: err } = await getListings(filters, targetPage, PAGE_SIZE);
      if (err) throw err;
      setListings(prev => (targetPage === 0 ? (data ?? []) : [...prev, ...(data ?? [])]));
      setHasMore((data ?? []).length === PAGE_SIZE);
      setPage(targetPage);
    } catch {
      setError(t("marketplace.loadErrorWhat") || "Failed to load marketplace listings");
    }
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [typeFilter, filterTrade, filterUrgent, t]);

  const loadMine = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data } = await getMyListings(profile.id);
    setMyListings(data ?? []);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    if (view === "browse") load(0);
    else loadMine();
  }, [view, load, loadMine]);

  // Filtre texte côté client, comme sur web (search ne va pas au serveur)
  const displayed = listings.filter(l =>
    !search ||
    l.title?.toLowerCase().includes(search.toLowerCase()) ||
    l.description?.toLowerCase().includes(search.toLowerCase()) ||
    l.location?.toLowerCase().includes(search.toLowerCase()) ||
    l.trade?.toLowerCase().includes(search.toLowerCase())
  );

  async function handlePost() {
    if (!postForm.title || !postForm.description || !postForm.location) {
      Alert.alert(t("marketplace.postRequiredFields") || "Please fill in title, description and location.");
      return;
    }
    if (!postForm.contact_email) {
      Alert.alert(t("marketplace.toast.requiredContact") || "Contact email is required.");
      return;
    }
    setSaving(true);
    const rateLimitMsg = await checkRateLimit("booking_request", { identifier: postForm.contact_email.trim() });
    // "booking_request" réutilisé comme catégorie générique de rate limit
    // pour les actions publiques à volume modéré côté mobile — pas besoin
    // d'une entrée LIMITS séparée juste pour ça.
    if (rateLimitMsg) { setSaving(false); Alert.alert(rateLimitMsg); return; }

    const payload = {
      type: postType,
      title: postForm.title,
      description: postForm.description,
      trade: postForm.trade ?? "All trades",
      location: postForm.location,
      urgent: !!postForm.urgent,
      budget: postForm.budget ? parseFloat(postForm.budget) : null,
      contact_name: postForm.contact_name || profile?.name || "",
      contact_email: postForm.contact_email,
      contact_phone: postForm.contact_phone || profile?.phone || "",
      contact_method: postForm.contact_method ?? "both",
      ...(postType === "demand" && {
        work_start_date: postForm.work_start_date || null,
      }),
      ...(postType === "sale" && {
        business_type: postForm.business_type || null,
        annual_revenue: postForm.annual_revenue ? parseFloat(postForm.annual_revenue) : null,
        employees: postForm.employees ? parseInt(postForm.employees, 10) : null,
      }),
      ...(postType === "recruitment" && {
        contract_type: postForm.contract_type || "Subcontracting",
        experience_req: postForm.experience_req || null,
        salary_range: postForm.salary_range || null,
      }),
      ...(postType === "materials" && {
        category: postForm.category || MATERIAL_CATEGORIES[0],
        condition: postForm.condition || MATERIAL_CONDITIONS[0],
        quantity: postForm.quantity ? parseInt(postForm.quantity, 10) : 1,
      }),
      status: "active",
    };

    const { data, error: err } = await createListing(profile?.id ?? null, payload);
    setSaving(false);
    if (err) { Alert.alert(t("marketplace.postFailed") || "Could not publish your listing."); return; }
    setListings(prev => [data, ...prev]);
    setPostOpen(false);
    setPostStep(1);
    setPostForm({});
  }

  async function handleInterest() {
    if (!intForm.name || !intForm.email) {
      Alert.alert(t("marketplace.nameEmailRequired") || "Name and email are required.");
      return;
    }
    setSaving(true);
    const rateLimitMsg = await checkRateLimit("booking_request", { identifier: intForm.email.trim() });
    if (rateLimitMsg) { setSaving(false); Alert.alert(rateLimitMsg); return; }
    await expressInterest(detail.id, { ...intForm, profile_id: profile?.id ?? null });
    setSaving(false);
    setInterestOpen(false);
    setDetail(null);
    Alert.alert(t("marketplace.interestSentTitle") || "Sent!", t("marketplace.interestSentMessage") || "The poster will get back to you.");
  }

  async function handleDelete() {
    if (!delId) return;
    const { error: err } = await deleteListing(delId);
    if (!err) {
      setMyListings(prev => prev.filter(l => l.id !== delId));
      setListings(prev => prev.filter(l => l.id !== delId));
    }
    setDelId(null);
  }

  const types = [
    ["all", t("marketplace.tabAll")],
    ["demand", t("marketplace.tabDemands")],
    ["sale", t("marketplace.tabForSale")],
    ["recruitment", t("marketplace.tabHiring")],
    ["materials", t("marketplace.tabMaterials") || "Materials"],
  ];

  const activeList = view === "browse" ? displayed : myListings;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Header */}
      <View style={{ backgroundColor: T.surface, paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: T.border }}>
        <View style={SS.spaceBetween}>
          <Text style={{ fontSize: 22, fontWeight: "900", color: T.text, letterSpacing: -0.5 }}>{t("nav.marketplace")}</Text>
          <Btn size="sm" onPress={() => { setPostForm({ contact_name: profile?.name ?? "", contact_email: profile?.email ?? "", contact_phone: profile?.phone ?? "" }); setPostStep(1); setPostOpen(true); }}>
            + {t("marketplace.postShort")}
          </Btn>
        </View>

        {/* Browse / Mine toggle */}
        <View style={[SS.row, { gap: 8, marginTop: 12 }]}>
          {[["browse", t("marketplace.viewBrowse") || "Browse"], ["mine", t("marketplace.viewMine") || "My listings"]].map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setView(id)}
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: T.r.full, backgroundColor: view === id ? T.text : T.surface2 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: view === id ? "#fff" : T.muted }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {view === "browse" && (
          <>
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder={t("marketplace.searchPlaceholder") || "Search listings..."}
              style={{ marginTop: 12 }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              <View style={SS.row}>
                {types.map(([id, label]) => (
                  <TouchableOpacity key={id} onPress={() => setTypeFilter(id)}
                    style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: T.r.full, marginRight: 8, backgroundColor: typeFilter === id ? T.brand : T.surface2 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: typeFilter === id ? "#fff" : T.muted }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={[SS.row, { gap: 10, marginTop: 10, alignItems: "center" }]}>
              <View style={{ flex: 1 }}>
                <SelectPicker
                  value={filterTrade}
                  options={[{ label: t("marketplace.anyNotSpecified") || "Any trade", options: ["All trades"] }, ...PROFESSION_GROUPS]}
                  onChange={setFilterTrade}
                />
              </View>
              <View style={[SS.row, { gap: 6 }]}>
                <Text style={{ fontSize: 12, color: T.muted }}>🔥 {t("marketplace.urgent")}</Text>
                <Toggle value={filterUrgent} onValueChange={setFilterUrgent} />
              </View>
            </View>
          </>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => view === "browse" ? load(0, true) : loadMine()} tintColor={T.brand} />}
      >
        {view === "browse" && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <MetricCard label={t("marketplace.stats.activeDemands") || "Demands"} value={listings.filter(l => l.type === "demand").length} />
            <MetricCard label={t("marketplace.stats.businessesForSale") || "For sale"} value={listings.filter(l => l.type === "sale").length} />
            <MetricCard label={t("marketplace.stats.recruitmentPosts") || "Hiring"} value={listings.filter(l => l.type === "recruitment").length} />
            <MetricCard label={t("marketplace.stats.materialsForSale") || "Materials"} value={listings.filter(l => l.type === "materials").length} />
          </View>
        )}

        {error && (
          <View style={{ padding: 14, backgroundColor: "#FEF2F2", borderRadius: 10, marginBottom: 14 }}>
            <Text style={{ color: "#DC2626", fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {loading ? (
          <Spinner />
        ) : activeList.length === 0 ? (
          <EmptyState
            icon="🗂️"
            message={view === "browse" ? t("marketplace.noneYet") : (t("marketplace.noneMine") || "You haven't posted anything yet.")}
            action={<Btn size="sm" onPress={() => setPostOpen(true)}>{t("marketplace.postFirst")}</Btn>}
          />
        ) : (
          activeList.map(l => {
            const meta = TYPE_META[l.type] ?? TYPE_META.demand;
            return (
              <TouchableOpacity key={l.id} onPress={() => (view === "browse" ? setDetail(l) : null)} activeOpacity={0.85}>
                <Card style={{ marginBottom: 10 }}>
                  <View style={[SS.row, { marginBottom: 8, gap: 6 }]}>
                    <View style={{ backgroundColor: meta.color, borderRadius: T.r.full, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: meta.text }}>{meta.icon} {meta.label}</Text>
                    </View>
                    {l.urgent && <Badge color="red">🔥 {t("marketplace.urgent")}</Badge>}
                    {l.status === "closed" && <Badge color="gray">{t("marketplace.closed") || "Closed"}</Badge>}
                    <Text style={{ fontSize: 11, color: T.hint, marginLeft: "auto" }}>{timeAgo(l.created_at)}</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", marginBottom: 4 }} numberOfLines={2}>{l.title}</Text>
                  <Text style={{ fontSize: 13, color: T.muted, marginBottom: 10 }} numberOfLines={2}>{l.description}</Text>
                  <View style={[SS.row, { gap: 8, flexWrap: "wrap" }]}>
                    {l.trade && <Text style={{ fontSize: 12, color: T.muted }}>{getVerticalForProfession(l.trade).icon} {l.trade}</Text>}
                    {l.location && <Text style={{ fontSize: 12, color: T.muted }}>📍 {l.location}</Text>}
                    {l.budget && <Text style={{ fontSize: 13, fontWeight: "700", color: T.brand, marginLeft: "auto" }}>{fmt(l.budget)}</Text>}
                    {l.salary_range && <Text style={{ fontSize: 13, fontWeight: "700", color: T.brand, marginLeft: "auto" }}>{l.salary_range}</Text>}
                    {l.views != null && <Text style={{ fontSize: 11, color: T.hint }}>👁 {l.views}</Text>}
                  </View>
                  {view === "mine" && (
                    <View style={[SS.row, { gap: 8, marginTop: 12 }]}>
                      <Btn
                        size="sm"
                        variant="ghost"
                        style={{ flex: 1 }}
                        onPress={() => updateListing(l.id, { status: l.status === "active" ? "closed" : "active" }).then(loadMine)}
                      >
                        {l.status === "active" ? (t("marketplace.close") || "Close") : (t("marketplace.reopen") || "Reopen")}
                      </Btn>
                      <Btn size="sm" variant="danger" style={{ flex: 1 }} onPress={() => setDelId(l.id)}>
                        {t("marketplace.delete") || "Delete"}
                      </Btn>
                    </View>
                  )}
                </Card>
              </TouchableOpacity>
            );
          })
        )}

        {view === "browse" && hasMore && !search && !loading && activeList.length > 0 && (
          <Btn variant="ghost" onPress={() => load(page + 1)} style={{ marginTop: 4 }}>
            {t("marketplace.loadMore") || "Load more"}
          </Btn>
        )}
      </ScrollView>

      {/* Listing detail sheet */}
      <Sheet visible={!!detail && !interestOpen} onClose={() => setDetail(null)} title={TYPE_META[detail?.type]?.icon + " " + (TYPE_META[detail?.type]?.label ?? "")} height="85%">
        {detail && (
          <>
            <Text style={{ fontSize: 18, fontWeight: "800", marginBottom: 8, letterSpacing: -0.3 }}>{detail.title}</Text>
            <View style={[SS.row, { gap: 10, marginBottom: 14, flexWrap: "wrap" }]}>
              {detail.trade    && <Text style={{ fontSize: 12, color: T.muted }}>{getVerticalForProfession(detail.trade).icon} {detail.trade}</Text>}
              {detail.location && <Text style={{ fontSize: 12, color: T.muted }}>📍 {detail.location}</Text>}
            </View>
            <Text style={{ fontSize: 14, color: T.muted, lineHeight: 22, marginBottom: 16 }}>{detail.description}</Text>
            {detail.budget         && <View style={[SS.spaceBetween, { marginBottom: 8 }]}><Text style={{ color: T.muted }}>{t("marketplace.budgetLabel")}</Text><Text style={{ fontWeight: "700", fontSize: 15, color: T.brand }}>{fmt(detail.budget)}</Text></View>}
            {detail.salary_range   && <View style={[SS.spaceBetween, { marginBottom: 8 }]}><Text style={{ color: T.muted }}>{t("marketplace.salaryRateLabel")}</Text><Text style={{ fontWeight: "700", fontSize: 15, color: T.brand }}>{detail.salary_range}</Text></View>}
            {detail.contract_type  && <View style={[SS.spaceBetween, { marginBottom: 8 }]}><Text style={{ color: T.muted }}>{t("marketplace.contractLabel")}</Text><Text style={{ fontWeight: "600" }}>{detail.contract_type}</Text></View>}
            {detail.annual_revenue && <View style={[SS.spaceBetween, { marginBottom: 8 }]}><Text style={{ color: T.muted }}>{t("marketplace.annualRevenueLabel")}</Text><Text style={{ fontWeight: "700" }}>{fmt(detail.annual_revenue)}</Text></View>}
            {detail.category       && <View style={[SS.spaceBetween, { marginBottom: 8 }]}><Text style={{ color: T.muted }}>{t("marketplace.categoryLabel") || "Category"}</Text><Text style={{ fontWeight: "600" }}>{detail.category}</Text></View>}
            {detail.condition      && <View style={[SS.spaceBetween, { marginBottom: 8 }]}><Text style={{ color: T.muted }}>{t("marketplace.conditionLabel") || "Condition"}</Text><Text style={{ fontWeight: "600" }}>{detail.condition}</Text></View>}
            {detail.quantity       && <View style={[SS.spaceBetween, { marginBottom: 8 }]}><Text style={{ color: T.muted }}>{t("marketplace.quantityLabel") || "Quantity"}</Text><Text style={{ fontWeight: "600" }}>{detail.quantity}</Text></View>}
            <View style={{ marginTop: 20 }}>
              <Btn fullWidth onPress={() => { setIntForm({ name: profile?.name ?? "", email: profile?.email ?? "", phone: profile?.phone ?? "", message: "" }); setInterestOpen(true); }}>
                ✋ {t("marketplace.imInterested")}
              </Btn>
            </View>
          </>
        )}
      </Sheet>

      {/* Interest sheet */}
      <Sheet visible={interestOpen} onClose={() => setInterestOpen(false)} title={t("marketplace.expressInterestTitle")} height="75%">
        <Field label={t("marketplace.yourNameLabel")}><Input value={intForm.name} onChangeText={v => setIntForm(p => ({ ...p, name: v }))} autoFocus /></Field>
        <Field label={t("marketplace.emailLabel")}><Input value={intForm.email} onChangeText={v => setIntForm(p => ({ ...p, email: v }))} keyboardType="email-address" autoCapitalize="none" /></Field>
        <Field label={t("marketplace.phoneLabel")}><Input value={intForm.phone} onChangeText={v => setIntForm(p => ({ ...p, phone: v }))} keyboardType="phone-pad" /></Field>
        <Field label={t("marketplace.messageLabel")}><Input value={intForm.message} onChangeText={v => setIntForm(p => ({ ...p, message: v }))} placeholder={t("marketplace.messagePlaceholder")} multiline numberOfLines={3} /></Field>
        <Btn onPress={handleInterest} disabled={saving} style={{ marginTop: 8 }}>{saving ? t("marketplace.sending") : t("marketplace.sendInterest")}</Btn>
      </Sheet>

      {/* Post listing sheet — multi-étapes comme le web */}
      <Sheet visible={postOpen} onClose={() => { setPostOpen(false); setPostStep(1); }} title={t("marketplace.postAListingTitle")} height="92%">
        {postStep === 1 && (
          <>
            <View style={[SS.row, { gap: 8, marginBottom: 20, flexWrap: "wrap" }]}>
              {Object.entries(TYPE_META).map(([id, meta]) => (
                <TouchableOpacity key={id} onPress={() => setPostType(id)} style={{
                  width: "47%", padding: 14, borderRadius: T.r.md, alignItems: "center",
                  borderWidth: postType === id ? 2 : 1,
                  borderColor: postType === id ? T.brand : T.border,
                  backgroundColor: postType === id ? T.brandLight : T.surface,
                }}>
                  <Text style={{ fontSize: 22 }}>{meta.icon}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", marginTop: 6, color: postType === id ? T.brand : T.muted }}>{meta.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Btn fullWidth onPress={() => setPostStep(2)}>{t("common.next") || "Next →"}</Btn>
          </>
        )}

        {postStep === 2 && (
          <>
            <Field label={t("marketplace.titleRequired")}><Input value={postForm.title ?? ""} onChangeText={v => setPostForm(p => ({ ...p, title: v }))} placeholder={t("marketplace.titlePlaceholder")} autoFocus /></Field>
            <Field label={t("marketplace.descriptionRequired")}><Input value={postForm.description ?? ""} onChangeText={v => setPostForm(p => ({ ...p, description: v }))} placeholder={t("marketplace.descriptionPlaceholder")} multiline numberOfLines={3} /></Field>
            <Field label={t("marketplace.professionLabel")}>
              <SelectPicker value={postForm.trade ?? "All trades"} options={[{ label: t("marketplace.anyNotSpecified"), options: ["All trades"] }, ...PROFESSION_GROUPS]} onChange={v => setPostForm(p => ({ ...p, trade: v }))} />
            </Field>
            <Field label={t("marketplace.locationRequired")}><Input value={postForm.location ?? ""} onChangeText={v => setPostForm(p => ({ ...p, location: v }))} placeholder="e.g. Rouen (76)" /></Field>

            {postType !== "recruitment" && postType !== "materials" && (
              <Field label={postType === "sale" ? t("marketplace.askingPriceLabel") : t("marketplace.budgetFieldLabel")}>
                <Input value={postForm.budget ?? ""} onChangeText={v => setPostForm(p => ({ ...p, budget: v }))} keyboardType="decimal-pad" placeholder="0" />
              </Field>
            )}

            {postType === "demand" && (
              <Field label={t("marketplace.workStartLabel") || "Preferred start date"}>
                <Input value={postForm.work_start_date ?? ""} onChangeText={v => setPostForm(p => ({ ...p, work_start_date: v }))} placeholder="YYYY-MM-DD" />
              </Field>
            )}

            {postType === "sale" && (
              <>
                <Field label={t("marketplace.businessTypeLabel") || "Business type"}><Input value={postForm.business_type ?? ""} onChangeText={v => setPostForm(p => ({ ...p, business_type: v }))} /></Field>
                <Field label={t("marketplace.annualRevenueLabel")}><Input value={postForm.annual_revenue ?? ""} onChangeText={v => setPostForm(p => ({ ...p, annual_revenue: v }))} keyboardType="decimal-pad" /></Field>
                <Field label={t("marketplace.employeesLabel") || "Employees"}><Input value={postForm.employees ?? ""} onChangeText={v => setPostForm(p => ({ ...p, employees: v }))} keyboardType="number-pad" /></Field>
              </>
            )}

            {postType === "recruitment" && (
              <>
                <Field label={t("marketplace.contractLabel")}>
                  <SelectPicker value={postForm.contract_type ?? "Subcontracting"} options={["Subcontracting", "Full-time", "Part-time", "Temporary"]} onChange={v => setPostForm(p => ({ ...p, contract_type: v }))} />
                </Field>
                <Field label={t("marketplace.experienceLabel") || "Experience required"}><Input value={postForm.experience_req ?? ""} onChangeText={v => setPostForm(p => ({ ...p, experience_req: v }))} /></Field>
                <Field label={t("marketplace.salaryDayRateLabel")}><Input value={postForm.salary_range ?? ""} onChangeText={v => setPostForm(p => ({ ...p, salary_range: v }))} placeholder="e.g. €200–250/day" /></Field>
              </>
            )}

            {postType === "materials" && (
              <>
                <Field label={t("marketplace.categoryLabel") || "Category"}>
                  <SelectPicker value={postForm.category ?? MATERIAL_CATEGORIES[0]} options={MATERIAL_CATEGORIES} onChange={v => setPostForm(p => ({ ...p, category: v }))} />
                </Field>
                <Field label={t("marketplace.conditionLabel") || "Condition"}>
                  <SelectPicker value={postForm.condition ?? MATERIAL_CONDITIONS[0]} options={MATERIAL_CONDITIONS} onChange={v => setPostForm(p => ({ ...p, condition: v }))} />
                </Field>
                <Field label={t("marketplace.quantityLabel") || "Quantity"}><Input value={postForm.quantity ?? "1"} onChangeText={v => setPostForm(p => ({ ...p, quantity: v }))} keyboardType="number-pad" /></Field>
                <Field label={t("marketplace.askingPriceLabel")}><Input value={postForm.budget ?? ""} onChangeText={v => setPostForm(p => ({ ...p, budget: v }))} keyboardType="decimal-pad" /></Field>
              </>
            )}

            <View style={[SS.row, { gap: 6, marginVertical: 12, alignItems: "center" }]}>
              <Text style={{ fontSize: 13, color: T.muted }}>🔥 {t("marketplace.markUrgent") || "Mark as urgent"}</Text>
              <Toggle value={!!postForm.urgent} onValueChange={v => setPostForm(p => ({ ...p, urgent: v }))} />
            </View>

            <View style={[SS.row, { gap: 10 }]}>
              <Btn variant="ghost" style={{ flex: 1 }} onPress={() => setPostStep(1)}>{t("common.back") || "← Back"}</Btn>
              <Btn style={{ flex: 1 }} onPress={() => setPostStep(3)}>{t("common.next") || "Next →"}</Btn>
            </View>
          </>
        )}

        {postStep === 3 && (
          <>
            <Field label={t("marketplace.yourNameLabel")}><Input value={postForm.contact_name ?? ""} onChangeText={v => setPostForm(p => ({ ...p, contact_name: v }))} /></Field>
            <Field label={t("marketplace.yourEmailRequired")}><Input value={postForm.contact_email ?? ""} onChangeText={v => setPostForm(p => ({ ...p, contact_email: v }))} keyboardType="email-address" autoCapitalize="none" /></Field>
            <Field label={t("marketplace.phoneLabel")}><Input value={postForm.contact_phone ?? ""} onChangeText={v => setPostForm(p => ({ ...p, contact_phone: v }))} keyboardType="phone-pad" /></Field>
            <Field label={t("marketplace.contactMethodLabel") || "Preferred contact method"}>
              <SelectPicker value={postForm.contact_method ?? "both"} options={["both", "email", "phone"]} onChange={v => setPostForm(p => ({ ...p, contact_method: v }))} />
            </Field>
            <View style={[SS.row, { gap: 10, marginTop: 8 }]}>
              <Btn variant="ghost" style={{ flex: 1 }} onPress={() => setPostStep(2)}>{t("common.back") || "← Back"}</Btn>
              <Btn style={{ flex: 1 }} onPress={handlePost} disabled={saving}>
                {saving ? t("marketplace.posting") : `🚀 ${t("marketplace.postListingButton")}`}
              </Btn>
            </View>
          </>
        )}
      </Sheet>

      <ConfirmSheet
        visible={!!delId}
        onClose={() => setDelId(null)}
        onConfirm={handleDelete}
        title={t("marketplace.deleteConfirmTitle") || "Delete this listing?"}
        message={t("marketplace.deleteConfirmMessage") || "This can't be undone."}
        confirmLabel={t("marketplace.delete") || "Delete"}
        danger
      />
    </View>
  );
}
