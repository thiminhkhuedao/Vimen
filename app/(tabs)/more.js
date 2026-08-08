// app/(tabs)/more.js — "More" tab linking to all extra screens
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "../../src/hooks/i18n/index.js";

import { useAuth } from "@clerk/clerk-expo";
import { useProfile } from "../../src/hooks/useProfile";
import { getProfessionLabel } from "../../src/lib/professions.js";
import { T, SS } from "../../src/styles/tokens";

function getSections(t) {
  return [
    {
      title: t("more.sections.businessTools"),
      items: [
        { label:t("more.items.quotes.label"),      icon:"📝", desc:t("more.items.quotes.desc"),      route:"/(screens)/quotes"    },
        { label:t("more.items.payments.label"),    icon:"💳", desc:t("more.items.payments.desc"),    route:"/(screens)/payments"  },
        { label:t("more.items.marketplace.label"), icon:"🛒", desc:t("more.items.marketplace.desc"), route:"/(tabs)/marketplace"  },
      ],
    },
    {
      title: t("more.sections.growth"),
      items: [
        { label:t("more.items.reviews.label"),   icon:"⭐", desc:t("more.items.reviews.desc"),   route:"/(screens)/reviews"   },
        { label:t("more.items.referrals.label"), icon:"🎁", desc:t("more.items.referrals.desc"), route:"/(screens)/referrals" },
        { label:t("more.items.booking.label"),   icon:"📅", desc:t("more.items.booking.desc"),   route:"/(screens)/booking"   },
      ],
    },
    {
      title: t("more.sections.compliance"),
      items: [
        { label:t("more.items.certifications.label"), icon:"🏅", desc:t("more.items.certifications.desc"), route:"/(screens)/certifications" },
      ],
    },
  ];
}

export default function MoreScreen() {
  const { t }     = useTranslation();
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const { signOut } = useAuth();
  const { profile } = useProfile();

  const SECTIONS = getSections(t);

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      <View style={{ backgroundColor:T.surface, paddingTop:insets.top+8, paddingBottom:16, paddingHorizontal:20, borderBottomWidth:1, borderBottomColor:T.border }}>
        <Text style={{ fontSize:22, fontWeight:"900", color:T.text, letterSpacing:-0.5 }}>{t("more.title")}</Text>
        {profile && (
          <View style={[SS.row, { marginTop:14, gap:12 }]}>
            <View style={{ width:44, height:44, borderRadius:22, backgroundColor:T.brand, alignItems:"center", justifyContent:"center" }}>
              <Text style={{ color:"#fff", fontSize:16, fontWeight:"700" }}>
                {(profile.name||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize:15, fontWeight:"700" }}>{profile.name}</Text>
              <Text style={{ fontSize:13, color:T.muted }}>{getProfessionLabel(profile.trade, t)} · {profile.plan==="pro"?t("more.plan.pro"):t("more.plan.free")}</Text>
            </View>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:insets.bottom+90 }}>
        {SECTIONS.map(section=>(
          <View key={section.title} style={{ marginBottom:20 }}>
            <Text style={{ fontSize:11, fontWeight:"700", color:T.muted, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8, marginLeft:4 }}>
              {section.title}
            </Text>
            <View style={{ backgroundColor:T.surface, borderRadius:T.r.lg, borderWidth:1, borderColor:T.border, overflow:"hidden" }}>
              {section.items.map((item, idx)=>(
                <TouchableOpacity key={item.label} onPress={()=>router.push(item.route)}
                  activeOpacity={0.7}
                  style={{ flexDirection:"row", alignItems:"center", padding:16, borderBottomWidth:idx<section.items.length-1?1:0, borderBottomColor:T.border }}>
                  <View style={{ width:40, height:40, borderRadius:T.r.md, backgroundColor:T.surface2, alignItems:"center", justifyContent:"center", marginRight:14 }}>
                    <Text style={{ fontSize:20 }}>{item.icon}</Text>
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontSize:15, fontWeight:"600", color:T.text }}>{item.label}</Text>
                    <Text style={{ fontSize:12, color:T.muted, marginTop:1 }}>{item.desc}</Text>
                  </View>
                  <Text style={{ fontSize:18, color:T.hint }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Sign out */}
        <TouchableOpacity onPress={()=>Alert.alert(t("more.signOut.confirmTitle"),"",[ {text:t("more.signOut.cancel"),style:"cancel"}, {text:t("more.signOut.confirm"),style:"destructive",onPress:signOut} ])}
          style={{ backgroundColor:T.redBg, borderRadius:T.r.lg, padding:16, alignItems:"center", borderWidth:1, borderColor:`${T.red}30` }}>
          <Text style={{ color:T.red, fontWeight:"700", fontSize:15 }}>{t("more.signOut.button")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}