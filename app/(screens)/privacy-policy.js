// app/(screens)/privacy-policy.js
//
// Contenu identique à src/pages/PrivacyPolicyPage.jsx (web) — même texte,
// mêmes placeholders [À COMPLÉTER] à remplir en même temps que la version
// web (une seule fois les deux, pas deux mises à jour séparées à retenir).

import { ScrollView, View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { T } from "../../src/styles/tokens";

const CONTENT = {
  fr: {
    title: "Politique de confidentialité",
    updated: "Dernière mise à jour : [À COMPLÉTER — date de publication]",
    intro: `Cette politique s'applique à l'application web Vimen et à l'application mobile Vimen (iOS/Android), ci-après « le Service ». Elle décrit quelles données nous collectons, pourquoi, avec qui elles sont partagées, et quels droits tu as sur elles.

Le responsable de traitement est [À COMPLÉTER — raison sociale, forme juridique, SIRET, adresse]. Pour toute question, contacte-nous à [À COMPLÉTER — email dédié].`,
    sections: [
      { h: "1. À qui s'applique cette politique", b: `Vimen s'adresse à deux catégories de personnes : les professionnels (« Pro ») qui créent un compte pour gérer clients, rendez-vous, devis et factures ; et les clients des Pros (« Clients finaux ») qui interagissent via une page publique (réservation, devis, avis), souvent sans jamais créer de compte.` },
      { h: "2. Données que nous collectons", b: `Compte (via Clerk) : nom, email, mot de passe (jamais stocké par nous, géré par Clerk), infos Google si connexion Google.

Profil professionnel : nom, métier, bio, tarif horaire, email et téléphone pro, photo, coordonnées bancaires (IBAN, BIC, titulaire, banque) pour les versements, identifiants Stripe, préférences de notification, devise, lien de réservation, jeton de notification push.

Données de tes clients : nom, email, téléphone, adresse, notes que tu saisis toi-même — tu es responsable de traitement pour ces données.

Réservations et devis publics : nom, email, téléphone, date/créneau, signature électronique du Client final.

Avis publics, données marketplace, formulaire de contact et parrainage.

Données techniques : adresse IP (limitation de requêtes), navigation standard.` },
      { h: "3. Pourquoi nous traitons ces données", b: `Exécution du contrat (gérer ton compte, traiter les paiements, permettre les réservations), intérêt légitime (sécurité, prévention des abus, réponse à tes messages), consentement (notifications push), obligation légale (comptabilité).` },
      { h: "4. Avec qui nous partageons ces données", b: `Clerk (authentification), Supabase (hébergement base de données), Stripe (paiements et versements), Resend (envoi d'emails), Google (connexion, si utilisée). Nous ne vendons aucune donnée.

Certains de ces prestataires sont basés aux États-Unis ; ces transferts sont encadrés par [À COMPLÉTER — clauses contractuelles types ou équivalent].` },
      { h: "5. Durée de conservation", b: `Données de compte : conservées tant que le compte est actif. Données de facturation : conservées [À COMPLÉTER, généralement 10 ans en France]. Le reste : le temps nécessaire à la finalité concernée.` },
      { h: "6. Sécurité", b: `Chiffrement en transit (HTTPS), contrôle d'accès strict en base (chaque Pro n'accède qu'à ses propres données), limitation du nombre de requêtes, mots de passe jamais stockés par nos soins.` },
      { h: "7. Tes droits", b: `Accès, rectification, effacement, portabilité, opposition, retrait du consentement. Utilise le bouton "Exporter mes données" ou "Supprimer mon compte" dans Paramètres → Confidentialité & Sécurité, ou contacte [À COMPLÉTER — email]. Tu peux aussi saisir la CNIL (www.cnil.fr).` },
      { h: "8. Cookies", b: `L'application mobile n'utilise pas de cookies. Le site web utilise des cookies strictement nécessaires à son fonctionnement (session d'authentification). [À COMPLÉTER si outil d'analytics utilisé.]` },
      { h: "9. Application mobile", b: `L'app demande l'autorisation d'envoyer des notifications push, modifiable à tout moment dans les réglages de ton appareil. [À COMPLÉTER si d'autres permissions sont demandées.]` },
      { h: "10. Mineurs", b: `Le Service n'est pas destiné aux personnes de moins de 16 ans.` },
      { h: "11. Modifications", b: `Nous pouvons mettre à jour cette politique. En cas de changement substantiel, nous t'en informerons avant son entrée en vigueur.` },
      { h: "12. Contact", b: `[À COMPLÉTER — raison sociale, adresse postale, email dédié à la confidentialité]` },
    ],
  },
  en: {
    title: "Privacy Policy",
    updated: "Last updated: [TO COMPLETE — publication date]",
    intro: `This policy applies to the Vimen web app and the Vimen mobile app (iOS/Android), referred to as "the Service." It describes what data we collect, why, who we share it with, and what rights you have over it.

The data controller is [TO COMPLETE — company name, legal form, SIRET, address]. For any question, contact us at [TO COMPLETE — dedicated email].`,
    sections: [
      { h: "1. Who this policy applies to", b: `Vimen serves two categories of people: Professionals ("Pro") who create an account to manage clients, appointments, quotes and invoices; and the Pro's End Clients, who interact via a public page (booking, quote, reviews), often without ever creating an account.` },
      { h: "2. Data we collect", b: `Account (via Clerk): name, email, password (never stored by us, managed by Clerk), Google info if signing in with Google.

Professional profile: name, trade, bio, hourly rate, professional email and phone, photo, bank details (IBAN, BIC, account holder, bank name) for payouts, Stripe identifiers, notification preferences, currency, booking link, push notification token.

Your clients' data: name, email, phone, address, notes you enter yourself — you are the data controller for this data.

Public bookings and quotes: name, email, phone, date/time, End Client's electronic signature.

Public reviews, marketplace data, contact form and referrals.

Technical data: IP address (rate limiting), standard browsing data.` },
      { h: "3. Why we process this data", b: `Contract performance (managing your account, processing payments, enabling bookings), legitimate interest (security, abuse prevention, replying to your messages), consent (push notifications), legal obligation (accounting).` },
      { h: "4. Who we share this data with", b: `Clerk (authentication), Supabase (database hosting), Stripe (payments and payouts), Resend (email delivery), Google (sign-in, if used). We do not sell any data.

Some of these providers are based in the United States; these transfers are governed by [TO COMPLETE — Standard Contractual Clauses or equivalent].` },
      { h: "5. Data retention", b: `Account data: kept as long as the account is active. Billing data: kept [TO COMPLETE, typically 10 years in France]. Everything else: for as long as necessary for its purpose.` },
      { h: "6. Security", b: `Encryption in transit (HTTPS), strict database access control (each Pro only accesses their own data), rate limiting, passwords never stored by us.` },
      { h: "7. Your rights", b: `Access, rectification, erasure, portability, objection, withdrawal of consent. Use the "Export my data" or "Delete my account" buttons in Settings → Privacy & Security, or contact [TO COMPLETE — email]. You may also file a complaint with your local data protection authority (in France, the CNIL — www.cnil.fr).` },
      { h: "8. Cookies", b: `The mobile app does not use cookies. The website uses cookies strictly necessary for its operation (authentication session). [TO COMPLETE if an analytics tool is used.]` },
      { h: "9. Mobile app", b: `The app requests permission to send push notifications, which you can change anytime in your device settings. [TO COMPLETE if other permissions are requested.]` },
      { h: "10. Children", b: `The Service is not intended for individuals under 16 years of age.` },
      { h: "11. Changes", b: `We may update this policy. In the event of a material change, we will notify you before it takes effect.` },
      { h: "12. Contact", b: `[TO COMPLETE — company name, postal address, dedicated privacy email]` },
    ],
  },
};

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lang } = useTranslation();
  const c = CONTENT[lang] || CONTENT.fr;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 20, backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: T.text }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: "800" }}>{c.title}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        <Text style={{ fontSize: 12, color: T.hint, marginBottom: 20 }}>{c.updated}</Text>
        <Text style={{ fontSize: 14, color: T.muted, lineHeight: 21, marginBottom: 24 }}>{c.intro}</Text>
        {c.sections.map(s => (
          <View key={s.h} style={{ marginBottom: 22 }}>
            <Text style={{ fontSize: 15, fontWeight: "800", marginBottom: 8 }}>{s.h}</Text>
            <Text style={{ fontSize: 13.5, color: T.text, lineHeight: 20 }}>{s.b}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}