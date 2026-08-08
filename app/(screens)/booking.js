// app/(screens)/booking.js
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl, Share, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useProfile } from "../../src/hooks/useProfile";
import {
  getBookingRequests, updateBookingStatus,
  getServiceOptions, createServiceOption, updateServiceOption, deleteServiceOption, uploadOptionImage,
} from "../../src/lib/db";
import { Card, Btn, Badge, Avatar, EmptyState, Spinner, Sheet, ConfirmSheet, Field, Input, Toggle } from "../../src/components/UI";
import { T, SS, fmtDate, fmt } from "../../src/styles/tokens";
import * as WebBrowser from "expo-web-browser";
import { getVerticalColor, getVerticalForProfession } from "../../src/lib/professions";
import { useTranslation } from "../../src/hooks/i18n/index.js";

export default function BookingScreen() {
  const insets      = useSafeAreaInsets();
  const { profile, setProfile } = useProfile();
  const { t } = useTranslation();
  const verticalColor= getVerticalColor(profile?.trade);
  const vertical      = getVerticalForProfession(profile?.trade);
  const [bookings,  setBookings]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [tab,       setTab]       = useState("requests"); // requests | preview | options | settings
  const [settSheet, setSettSheet] = useState(false);
  const [form,      setForm]      = useState({});
  const [saving,    setSaving]    = useState(false);
  const [opening,   setOpening]   = useState(false);

  // ── Bookable options (catalogue) ──────────────────────
  const [options,        setOptions]        = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionSheet,    setOptionSheet]    = useState(null); // null | "add" | option object being edited
  const [optionForm,     setOptionForm]     = useState({ title:"", description:"", price:"", active:true });
  const [pickedImageUri, setPickedImageUri] = useState(null); // local URI, not yet uploaded
  const [savingOption,   setSavingOption]   = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState(null);

  const STATUS_COLOR = { pending:"amber", accepted:"green", declined:"gray" };

  const load = useCallback(async (refresh=false) => {
    if (!profile?.id) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    const { data } = await getBookingRequests(profile.id);
    setBookings(data??[]);
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [profile?.id]);

  const loadOptions = useCallback(async () => {
    if (!profile?.id) return;
    setOptionsLoading(true);
    const { data } = await getServiceOptions(profile.id);
    setOptions(data??[]);
    setOptionsLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (profile) setForm({ bio:profile.bio||"", hourly_rate:String(profile.hourly_rate||""), booking_slug:profile.booking_slug||"" }); }, [profile]);
  useEffect(() => { if (tab==="options" && profile?.id) loadOptions(); }, [tab, profile?.id, loadOptions]);

  const pending  = bookings.filter(b=>b.status==="pending");
  const accepted = bookings.filter(b=>b.status==="accepted");
  const declined = bookings.filter(b=>b.status==="declined");
  const bookingUrl = `https://Vinem.app/b/${profile?.booking_slug||t("booking.slugPlaceholder")}`;

  async function respond(id, status) {
    const { data, error } = await updateBookingStatus(id, status);
    if (error) { Alert.alert(t("booking.alerts.updateFailed")); return; }
    setBookings(prev => prev.map(b => b.id===id ? data : b));
  }

  async function shareLink() {
    await Share.share({ message:t("booking.shareMessage", { url: bookingUrl }), url:bookingUrl });
  }

  // Opens the REAL public booking page (the same PublicBookingPage.jsx that
  // serves yourdomain.com/b/:slug to anonymous web visitors) inside an
  // in-app browser. This intentionally does not re-implement the page's
  // layout here — that would drift out of sync with the real page over
  // time. What the tradesperson sees here is byte-for-byte what a client
  // sees when they tap the shared link. This also means the bookable
  // options managed below only ever get PICKED from that real web page —
  // this screen just manages the catalogue.
  async function openPreview() {
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(bookingUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: T.brand,
      });
    } catch {
      Alert.alert(t("booking.alerts.previewFailedTitle"), t("booking.alerts.previewFailedMsg"));
    } finally {
      setOpening(false);
    }
  }

  // ── Options (catalogue) handlers ──────────────────────
  function openAddOption() {
    setOptionForm({ title:"", description:"", price:"", active:true });
    setPickedImageUri(null);
    setOptionSheet("add");
  }

  function openEditOption(opt) {
    setOptionForm({ title:opt.title||"", description:opt.description||"", price:String(opt.price??""), active:opt.active });
    setPickedImageUri(null); // existing image_url is shown from `opt` until a new one is picked
    setOptionSheet(opt);
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPickedImageUri(result.assets[0].uri);
    }
  }

  async function saveOption() {
    if (!optionForm.title.trim()) { Alert.alert(t("booking.options.alerts.titleRequired")); return; }
    setSavingOption(true);

    let image_url = typeof optionSheet === "object" ? optionSheet.image_url : undefined;
    if (pickedImageUri) {
      setUploadingImage(true);
      const { data: uploadedUrl, error: uploadError } = await uploadOptionImage(profile.id, pickedImageUri);
      setUploadingImage(false);
      if (uploadError) { setSavingOption(false); Alert.alert(t("booking.options.alerts.imageUploadFailed")); return; }
      image_url = uploadedUrl;
    }

    const payload = {
      title: optionForm.title.trim(),
      description: optionForm.description.trim() || null,
      price: optionForm.price ? Number(optionForm.price) : null,
      active: optionForm.active,
      ...(image_url !== undefined ? { image_url } : {}),
    };

    const isEdit = typeof optionSheet === "object";
    const { data, error } = isEdit
      ? await updateServiceOption(optionSheet.id, payload)
      : await createServiceOption(profile.id, payload);

    setSavingOption(false);
    if (error) { Alert.alert(t("booking.options.alerts.saveFailed")); return; }

    setOptions(prev => isEdit ? prev.map(o => o.id===data.id ? data : o) : [data, ...prev]);
    setOptionSheet(null);
    setPickedImageUri(null);
  }

  async function confirmDeleteOption() {
    if (!deleteTarget) return;
    const { error } = await deleteServiceOption(deleteTarget.id);
    if (error) { Alert.alert(t("booking.options.alerts.deleteFailed")); setDeleteTarget(null); return; }
    setOptions(prev => prev.filter(o => o.id!==deleteTarget.id));
    setDeleteTarget(null);
    setOptionSheet(null);
  }

  if (loading) return <Spinner/>;

  const TABS = [
    ["requests", pending.length>0 ? t("booking.tabs.requestsWithCount",{count:pending.length}) : t("booking.tabs.requests")],
    ["preview", t("booking.tabs.preview")],
    ["options", t("booking.tabs.options")],
    ["settings", t("booking.tabs.settings")],
  ];

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      <View style={{ backgroundColor:T.surface, paddingTop:insets.top+8, paddingBottom:14, paddingHorizontal:20, borderBottomWidth:1, borderBottomColor:T.border }}>
        <View style={[SS.spaceBetween, { marginBottom:14 }]}>
          <Text style={{ fontSize:22, fontWeight:"900", color:T.text, letterSpacing:-0.5 }}>{t("booking.title")}</Text>
          <Btn size="sm" onPress={shareLink}>📤 {t("booking.sharePage")}</Btn>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={[SS.row, { backgroundColor:T.surface2, borderRadius:T.r.md, padding:3 }]}>
            {TABS.map(([id,label])=>(
              <TouchableOpacity key={id} onPress={()=>setTab(id)} style={{ paddingVertical:7, paddingHorizontal:16, borderRadius:T.r.sm, alignItems:"center", backgroundColor:tab===id?T.surface:"transparent" }}>
                <Text style={{ fontSize:13, fontWeight:tab===id?"700":"400", color:tab===id?T.text:T.muted }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:insets.bottom+90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor={T.brand}/>}>

        {/* REQUESTS */}
        {tab==="requests" && (
          <>
            {/* Booking URL card */}
            <TouchableOpacity onPress={openPreview}
              style={{ backgroundColor:T.black, borderRadius:T.r.lg, padding:16, marginBottom:14, flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
              <View style={{ flex:1 }}>
                <Text style={{ fontWeight:"700", color:"#fff", marginBottom:2 }}>{t("booking.pageLive")} ✨</Text>
                <Text style={{ fontSize:12, color:"rgba(255,255,255,0.45)" }} numberOfLines={1}>{bookingUrl}</Text>
              </View>
              <Btn variant="white" size="sm" onPress={shareLink}>{t("booking.share")}</Btn>
            </TouchableOpacity>

            {bookings.length===0 && <EmptyState icon="📅" message={t("booking.emptyState")}/>}

            {pending.length>0 && (
              <>
                <Text style={{ fontSize:12, fontWeight:"700", color:T.amber, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>{t("booking.status.pendingHeader",{count:pending.length})}</Text>
                {pending.map(b=><BookingCard key={b.id} b={b} t={t} statusColor={STATUS_COLOR} onAccept={()=>respond(b.id,"accepted")} onDecline={()=>respond(b.id,"declined")}/>)}
              </>
            )}
            {accepted.length>0 && (
              <>
                <Text style={{ fontSize:12, fontWeight:"700", color:T.green, textTransform:"uppercase", letterSpacing:0.5, marginTop:8, marginBottom:10 }}>{t("booking.status.acceptedHeader",{count:accepted.length})}</Text>
                {accepted.map(b=><BookingCard key={b.id} b={b} t={t} statusColor={STATUS_COLOR}/>)}
              </>
            )}
            {declined.length>0 && (
              <>
                <Text style={{ fontSize:12, fontWeight:"700", color:T.hint, textTransform:"uppercase", letterSpacing:0.5, marginTop:8, marginBottom:10 }}>{t("booking.status.declinedHeader",{count:declined.length})}</Text>
                {declined.map(b=><BookingCard key={b.id} b={b} t={t} statusColor={STATUS_COLOR}/>)}
              </>
            )}
          </>
        )}

        {/* PREVIEW */}
        {tab==="preview" && (
          <Card>
            <View style={[SS.row, { gap:14, paddingBottom:16, borderBottomWidth:1, borderBottomColor:T.border, marginBottom:16 }]}>
              <Avatar name={profile?.name||"?"} size={56}/>
              <View style={{ flex:1 }}>
                <Text style={{ fontSize:18, fontWeight:"800", letterSpacing:-0.3 }}>{profile?.name}</Text>
                <View style={{ marginTop:4 }}>
                  <View style={{ backgroundColor:verticalColor.bg, borderRadius:999, paddingHorizontal:10, paddingVertical:3, alignSelf:"flex-start" }}>
                    <Text style={{ fontSize:13, fontWeight:"600", color:verticalColor.text }}>
                      {vertical.icon} {profile?.trade}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <Text style={{ fontSize:14, color:T.muted, lineHeight:21, marginBottom:20 }}>
              {t("booking.preview.description")}
            </Text>

            <View style={{ backgroundColor:T.surface2, borderRadius:T.r.md, padding:12, marginBottom:18 }}>
              <Text style={{ fontSize:12, color:T.muted, fontFamily:"monospace" }} numberOfLines={1}>{bookingUrl}</Text>
            </View>

            <Btn onPress={openPreview} disabled={opening} style={{ justifyContent:"center" }}>
              {opening ? t("booking.preview.opening") : `👁 ${t("booking.preview.viewLive")}`}
            </Btn>
            <Btn variant="ghost" onPress={shareLink} style={{ marginTop:10, justifyContent:"center" }}>
              📤 {t("booking.preview.shareLink")}
            </Btn>
          </Card>
        )}

        {/* OPTIONS (catalogue) */}
        {tab==="options" && (
          <>
            <Text style={{ fontSize:15, fontWeight:"700", marginBottom:4 }}>{t("booking.options.title")}</Text>
            <Text style={{ fontSize:13, color:T.muted, marginBottom:16, lineHeight:19 }}>{t("booking.options.subtitle")}</Text>

            <Btn onPress={openAddOption} style={{ marginBottom:16, justifyContent:"center" }}>{t("booking.options.addBtn")}</Btn>

            {optionsLoading ? (
              <Spinner/>
            ) : options.length===0 ? (
              <EmptyState icon="🖼️" message={t("booking.options.emptyMessage")}
                action={<Btn size="sm" onPress={openAddOption}>{t("booking.options.emptyAction")}</Btn>}/>
            ) : (
              options.map(opt => (
                <Card key={opt.id} onPress={()=>openEditOption(opt)} style={{ marginBottom:10, padding:0, overflow:"hidden" }}>
                  <View style={[SS.row, { alignItems:"stretch" }]}>
                    {opt.image_url ? (
                      <Image source={{ uri:opt.image_url }} style={{ width:84, height:84 }}/>
                    ) : (
                      <View style={{ width:84, height:84, backgroundColor:T.surface2, alignItems:"center", justifyContent:"center" }}>
                        <Text style={{ fontSize:24 }}>🖼️</Text>
                      </View>
                    )}
                    <View style={{ flex:1, padding:12, justifyContent:"center" }}>
                      <View style={[SS.spaceBetween]}>
                        <Text style={{ fontSize:14, fontWeight:"700", flex:1, marginRight:8 }} numberOfLines={1}>{opt.title}</Text>
                        {!opt.active && <Badge color="gray">{t("booking.options.hiddenBadge")}</Badge>}
                      </View>
                      {opt.description && <Text style={{ fontSize:12, color:T.muted, marginTop:2 }} numberOfLines={2}>{opt.description}</Text>}
                      {opt.price != null && <Text style={{ fontSize:15, fontWeight:"800", color:T.brand, marginTop:4 }}>{fmt(opt.price)}</Text>}
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {/* PAGE SETTINGS */}
        {tab==="settings" && (
          <Card>
            <Text style={{ fontSize:15, fontWeight:"700", marginBottom:16 }}>{t("booking.pageSettings.title")}</Text>
            <Field label={t("booking.pageSettings.slug")}>
              <Input value={form.booking_slug??""} onChangeText={v=>setForm(p=>({...p,booking_slug:v}))} autoCapitalize="none" placeholder={t("booking.slugPlaceholder")}/>
            </Field>
            <Field label={t("booking.pageSettings.bio")}>
              <Input value={form.bio??""} onChangeText={v=>setForm(p=>({...p,bio:v}))} multiline numberOfLines={3} placeholder={t("booking.pageSettings.bioPlaceholder")}/>
            </Field>
            <Field label={t("booking.pageSettings.hourlyRate")}>
              <Input value={form.hourly_rate??""} onChangeText={v=>setForm(p=>({...p,hourly_rate:v}))} keyboardType="decimal-pad"/>
            </Field>
            <View style={{ backgroundColor:T.surface2, borderRadius:T.r.md, padding:12, marginBottom:14 }}>
              <Text style={{ fontSize:13, color:T.muted }}>{t("booking.pageSettings.yourPage")} <Text style={{ color:T.brand, fontWeight:"600" }}>Vinem.app/b/{form.booking_slug||t("booking.slugPlaceholder")}</Text></Text>
            </View>
            <Btn onPress={()=>Alert.alert(t("booking.alerts.saved"))} disabled={saving}>{saving?t("booking.pageSettings.saving"):t("booking.pageSettings.save")}</Btn>
          </Card>
        )}
      </ScrollView>

      {/* Add/Edit option sheet */}
      <Sheet visible={!!optionSheet} onClose={()=>{ setOptionSheet(null); setPickedImageUri(null); }}
        title={typeof optionSheet==="object" ? t("booking.options.sheet.editTitle") : t("booking.options.sheet.addTitle")} height="88%">
        <Text style={{ fontSize:13, fontWeight:"500", color:T.muted, marginBottom:8 }}>{t("booking.options.sheet.imageLabel")}</Text>
        <TouchableOpacity onPress={pickImage} style={{ marginBottom:16 }}>
          {(pickedImageUri || (typeof optionSheet==="object" && optionSheet.image_url)) ? (
            <View>
              <Image source={{ uri: pickedImageUri || optionSheet.image_url }} style={{ width:"100%", height:160, borderRadius:T.r.md, backgroundColor:T.surface2 }}/>
              <View style={{ position:"absolute", bottom:8, right:8, backgroundColor:"rgba(0,0,0,0.6)", paddingHorizontal:10, paddingVertical:6, borderRadius:T.r.sm }}>
                <Text style={{ color:"#fff", fontSize:12, fontWeight:"600" }}>{t("booking.options.sheet.changePhoto")}</Text>
              </View>
            </View>
          ) : (
            <View style={{ width:"100%", height:120, borderRadius:T.r.md, backgroundColor:T.surface2, alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:T.border, borderStyle:"dashed" }}>
              <Text style={{ fontSize:24, marginBottom:4 }}>🖼️</Text>
              <Text style={{ fontSize:13, fontWeight:"600", color:T.muted }}>{t("booking.options.sheet.addPhoto")}</Text>
            </View>
          )}
        </TouchableOpacity>

        <Field label={t("booking.options.sheet.titleLabel")}>
          <Input value={optionForm.title} onChangeText={v=>setOptionForm(p=>({...p,title:v}))}
            placeholder={t("booking.options.sheet.titlePlaceholder")} autoFocus/>
        </Field>
        <Field label={t("booking.options.sheet.descriptionLabel")}>
          <Input value={optionForm.description} onChangeText={v=>setOptionForm(p=>({...p,description:v}))}
            placeholder={t("booking.options.sheet.descriptionPlaceholder")} multiline numberOfLines={3}/>
        </Field>
        <Field label={t("booking.options.sheet.priceLabel")}>
          <Input value={optionForm.price} onChangeText={v=>setOptionForm(p=>({...p,price:v}))} keyboardType="decimal-pad"/>
        </Field>

        <View style={[SS.spaceBetween, { paddingVertical:14, borderBottomWidth:1, borderBottomColor:T.border, marginBottom:16 }]}>
          <Text style={{ fontSize:14, fontWeight:"500" }}>{t("booking.options.sheet.activeLabel")}</Text>
          <Toggle value={optionForm.active} onValueChange={v=>setOptionForm(p=>({...p,active:v}))}/>
        </View>

        <Btn onPress={saveOption} disabled={savingOption} style={{ justifyContent:"center" }}>
          {uploadingImage ? t("booking.options.sheet.uploading") : savingOption ? t("booking.options.sheet.saving") : t("booking.options.sheet.saveBtn")}
        </Btn>

        {typeof optionSheet === "object" && (
          <Btn variant="danger" onPress={()=>setDeleteTarget(optionSheet)} style={{ marginTop:10, justifyContent:"center" }}>
            {t("booking.options.sheet.deleteBtn")}
          </Btn>
        )}
      </Sheet>

      {/* Delete confirm */}
      <ConfirmSheet
        visible={!!deleteTarget}
        onClose={()=>setDeleteTarget(null)}
        onConfirm={confirmDeleteOption}
        title={t("booking.options.alerts.deleteConfirmTitle")}
        message={t("booking.options.alerts.deleteConfirmMessage")}
        confirmLabel={t("booking.options.sheet.deleteBtn")}
      />
    </View>
  );
}

function BookingCard({ b, onAccept, onDecline, t, statusColor }) {
  const isPending = b.status==="pending";
  return (
    <Card style={{ marginBottom:10 }}>
      <View style={[SS.spaceBetween, { marginBottom:8 }]}>
        <View style={{ flex:1 }}>
          <Text style={{ fontSize:15, fontWeight:"700" }}>{b.customer_name}</Text>
          <Text style={{ fontSize:12, color:T.muted, marginTop:2 }}>{b.customer_email}{b.customer_phone?` · ${b.customer_phone}`:""}</Text>
        </View>
        <Badge color={statusColor[b.status]||"gray"}>{t(`booking.status.${b.status}`)}</Badge>
      </View>
      {b.preferred_date && <Text style={{ fontSize:13, color:T.muted, marginBottom:6 }}>📅 {t("booking.card.preferred")}: {fmtDate(b.preferred_date)}</Text>}

      {/* Selected catalogue option, if the client picked one */}
      {b.selected_option_id && b.service_option?.title && (
        <View style={{ backgroundColor:T.brandLight, borderRadius:T.r.md, padding:10, marginBottom:10, flexDirection:"row", alignItems:"center", gap:10 }}>
          {b.service_option.image_url && <Image source={{ uri:b.service_option.image_url }} style={{ width:36, height:36, borderRadius:6 }}/>}
          <View style={{ flex:1 }}>
            <Text style={{ fontSize:13, fontWeight:"700", color:T.brand }}>{b.service_option.title}</Text>
            {b.service_option.price != null && <Text style={{ fontSize:12, color:T.brand }}>{fmt(b.service_option.price)}</Text>}
          </View>
        </View>
      )}

      {/* Custom request — client's own image, description, and budget */}
      {b.is_custom_request && (
        <View style={{ backgroundColor:T.surface2, borderRadius:T.r.md, padding:10, marginBottom:10 }}>
          <Text style={{ fontSize:11, fontWeight:"700", color:T.muted, textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>{t("booking.customRequestLabel")}</Text>
          {b.custom_image_url && <Image source={{ uri:b.custom_image_url }} style={{ width:"100%", height:140, borderRadius:T.r.md, marginBottom:8 }}/>}
          {b.custom_description && <Text style={{ fontSize:13, color:T.text, marginBottom:6 }}>{b.custom_description}</Text>}
          {b.custom_budget != null && <Text style={{ fontSize:13, fontWeight:"700", color:T.brand }}>{t("booking.customBudgetLabel")}: {fmt(b.custom_budget)}</Text>}
        </View>
      )}

      {b.notes && (
        <View style={{ backgroundColor:T.surface2, borderRadius:T.r.md, padding:10, marginBottom:10 }}>
          <Text style={{ fontSize:13, color:T.text }}>{b.notes}</Text>
        </View>
      )}
      <Text style={{ fontSize:11, color:T.hint, marginBottom: isPending?10:0 }}>{t("booking.card.received")} {fmtDate(b.created_at)}</Text>
      {isPending && (
        <View style={[SS.row, { gap:8 }]}>
          <Btn size="sm" variant="success" onPress={onAccept} style={{ flex:1, justifyContent:"center" }}>✓ {t("booking.card.accept")}</Btn>
          <Btn size="sm" variant="danger"  onPress={onDecline} style={{ flex:1, justifyContent:"center" }}>✕ {t("booking.card.decline")}</Btn>
        </View>
      )}
    </Card>
  );
}
