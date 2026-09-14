// app/(screens)/terms-of-service.js
//
// Contenu identique à src/pages/TermsOfServicePage.jsx (web) — même
// texte, mêmes placeholders [À COMPLÉTER] à remplir en même temps que
// la version web.

import { ScrollView, View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { T } from "../../src/styles/tokens";

const CONTENT = {
  fr: {
    title: "Conditions Générales d'Utilisation",
    updated: "Dernière mise à jour : [À COMPLÉTER — date de publication]",
    intro: `Les présentes CGU régissent l'accès et l'utilisation de l'application web et mobile Vimen (« le Service »), éditée par [À COMPLÉTER — raison sociale, forme juridique, SIRET, adresse].

En créant un compte ou en utilisant le Service, tu acceptes d'être lié par ces CGU. Si tu n'es pas d'accord, n'utilise pas le Service.`,
    sections: [
      { h: "1. Description du Service", b: `Vimen est une plateforme permettant aux professionnels indépendants (« Pro ») de gérer leurs clients, rendez-vous, devis, factures et paiements, et de proposer une page de réservation publique à leurs propres clients (« Clients finaux »).` },
      { h: "2. Création de compte", b: `Tu dois avoir au moins 18 ans et la capacité juridique de contracter. Tu es responsable de l'exactitude des informations fournies et de la confidentialité de tes identifiants. Un compte est personnel et ne doit pas être partagé. Nous nous réservons le droit de suspendre ou résilier un compte en cas de violation de ces CGU.` },
      { h: "3. Abonnement et facturation", b: `Le Service est actuellement entièrement gratuit — aucun abonnement payant n'est proposé pour le moment. Si des plans payants sont introduits à l'avenir, ces CGU seront mises à jour et tu en seras informé avant tout changement.` },
      { h: "4. Paiements et versements (Stripe)", b: `Les paiements et versements sont traités par Stripe, notre prestataire de paiement — en les utilisant, tu acceptes aussi les conditions de Stripe. Tu es seul responsable de déclarer et payer les impôts et cotisations applicables à tes revenus. Vimen ne prélève actuellement aucune commission sur ces paiements. En cas de litige, rétrofacturation ou fraude, les fonds concernés peuvent être temporairement suspendus le temps de l'investigation.` },
      { h: "5. Ta responsabilité concernant les données de tes clients", b: `Quand tu enregistres des informations sur tes propres clients dans Vimen, tu agis en tant que responsable de traitement au sens du RGPD pour ces données : base légale, information de tes clients, réponse à leurs demandes de droits. Vimen agit comme sous-traitant technique pour l'hébergement, voir notre Politique de confidentialité.` },
      { h: "6. Page de réservation publique et devis", b: `Tu es responsable de l'exactitude des informations affichées sur ta page publique. Les devis signés électroniquement par un Client final constituent un accord entre toi et ce client — Vimen n'est pas partie à cet accord et n'en garantit ni l'exécution ni le contenu.` },
      { h: "7. Avis", b: `Les avis doivent refléter une expérience réelle — faux avis interdits, y compris sur ton propre profil. Nous pouvons retirer un avis frauduleux, diffamatoire ou contraire à ces CGU. Tu peux masquer un avis te concernant, mais pas en modifier le contenu ni le statut de vérification.` },
      { h: "8. Marketplace", b: `Les annonces doivent être exactes et légales. Vimen ne garantit pas la conclusion d'une transaction et n'est pas partie aux accords entre utilisateurs. Nous pouvons retirer toute annonce non conforme.` },
      { h: "9. Programme de parrainage", b: `[À COMPLÉTER — conditions exactes : récompense, délai, éligibilité, droit de Vimen de modifier ou mettre fin au programme.]` },
      { h: "10. Utilisation acceptable", b: `Interdiction d'utiliser le Service à des fins illégales, de contourner nos mesures de sécurité, d'extraire massivement des données (scraping), de publier du contenu diffamatoire ou portant atteinte à des tiers, ou d'usurper une identité. Toute violation peut entraîner la suspension ou résiliation immédiate du compte.` },
      { h: "11. Propriété intellectuelle", b: `Le Service, sa marque, son design et son code appartiennent à Vimen. Tu conserves la propriété de ton propre contenu (photos, descriptions, annonces) mais nous accordes une licence non-exclusive pour l'afficher dans le cadre du Service.` },
      { h: "12. Disponibilité du Service", b: `Nous nous efforçons d'assurer une disponibilité continue, sans garantie absolue. Interruptions possibles pour maintenance, mise à jour ou force majeure, avec préavis raisonnable lorsque possible.` },
      { h: "13. Limitation de responsabilité", b: `Le Service est fourni « en l'état ». Vimen n'est pas responsable des litiges entre un Pro et ses propres Clients finaux. La responsabilité de Vimen, si engagée, est limitée [À COMPLÉTER]. Cette limitation ne s'applique pas en cas de faute lourde ou intentionnelle, ni où la loi l'interdit.` },
      { h: "14. Résiliation", b: `Tu peux supprimer ton compte à tout moment depuis Paramètres → Confidentialité & Sécurité. Nous pouvons suspendre ou résilier ton accès en cas de violation, non-paiement ou inactivité prolongée [À COMPLÉTER], avec notification préalable sauf urgence (fraude, sécurité). Les dispositions sur la propriété intellectuelle, la responsabilité et le droit applicable survivent à la résiliation.` },
      { h: "15. Modifications des CGU", b: `Nous pouvons modifier ces CGU. En cas de changement substantiel, nous t'en informerons avant leur entrée en vigueur. La poursuite de l'utilisation vaut acceptation des nouvelles CGU.` },
      { h: "16. Droit applicable et juridiction", b: `Ces CGU sont soumises au droit français. Tout litige relève de la compétence des tribunaux de [À COMPLÉTER — ville du siège social], sous réserve des règles impératives de protection des consommateurs.` },
      { h: "17. Contact", b: `[À COMPLÉTER — raison sociale, adresse postale, email de contact]` },
    ],
  },
  en: {
    title: "Terms of Service",
    updated: "Last updated: [TO COMPLETE — publication date]",
    intro: `These Terms govern access to and use of the Vimen web and mobile application ("the Service"), operated by [TO COMPLETE — company name, legal form, SIRET, address].

By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.`,
    sections: [
      { h: "1. Description of the Service", b: `Vimen is a platform enabling independent professionals ("Pro") to manage their clients, appointments, quotes, invoices, and payments, and to offer a public booking page to their own clients ("End Clients").` },
      { h: "2. Account creation", b: `You must be at least 18 years old and have the legal capacity to contract. You are responsible for the accuracy of your information and the confidentiality of your credentials. An account is personal and must not be shared. We reserve the right to suspend or terminate an account for violating these Terms.` },
      { h: "3. Subscription and billing", b: `The Service is currently entirely free — no paid plan is offered at this time. If paid plans are introduced in the future, these Terms will be updated and you will be notified before any change takes effect.` },
      { h: "4. Payments and payouts (Stripe)", b: `Payments and payouts are processed by Stripe — by using this feature, you also agree to Stripe's terms. You are solely responsible for declaring and paying taxes on your income. Vimen does not currently charge any commission on these payments. In case of a dispute, chargeback, or fraud, relevant funds may be temporarily held pending investigation.` },
      { h: "5. Your responsibility regarding your clients' data", b: `When you record information about your own clients in Vimen, you act as the data controller under GDPR: legal basis, informing your clients, responding to their rights requests. Vimen acts as a technical data processor for hosting, see our Privacy Policy.` },
      { h: "6. Public booking page and quotes", b: `You are responsible for the accuracy of information on your public page. Quotes electronically signed by an End Client form an agreement between you and that client — Vimen is not a party to it and does not guarantee its performance or content.` },
      { h: "7. Reviews", b: `Reviews must reflect a genuine experience — fake reviews prohibited, including on your own profile. We may remove fraudulent, defamatory, or non-compliant reviews. You may hide a review about you, but not edit its content or verification status.` },
      { h: "8. Marketplace", b: `Listings must be accurate and lawful. Vimen does not guarantee a transaction will occur and is not a party to agreements between users. We may remove non-compliant listings.` },
      { h: "9. Referral program", b: `[TO COMPLETE — exact terms: reward, timeframe, eligibility, Vimen's right to modify or end the program.]` },
      { h: "10. Acceptable use", b: `No illegal use, circumventing security measures, scraping, posting defamatory or infringing content, or impersonation. Violations may result in suspension or immediate termination.` },
      { h: "11. Intellectual property", b: `The Service, its brand, design, and code belong to Vimen. You retain ownership of your own content (photos, descriptions, listings) but grant us a non-exclusive license to display it as part of the Service.` },
      { h: "12. Service availability", b: `We strive for continuous availability without absolute guarantee. Interruptions possible for maintenance, updates, or force majeure, with reasonable notice when possible.` },
      { h: "13. Limitation of liability", b: `The Service is provided "as is." Vimen is not liable for disputes between a Pro and their own End Clients. Vimen's liability, where established, is limited to [TO COMPLETE]. This does not apply to gross or intentional misconduct, or where prohibited by law.` },
      { h: "14. Termination", b: `You may delete your account anytime from Settings → Privacy & Security. We may suspend or terminate access for violations, non-payment, or prolonged inactivity [TO COMPLETE], with prior notice except in urgent cases (fraud, security). Provisions on IP, liability, and governing law survive termination.` },
      { h: "15. Changes to these Terms", b: `We may modify these Terms. We'll notify you of material changes before they take effect. Continued use constitutes acceptance of the new Terms.` },
      { h: "16. Governing law and jurisdiction", b: `These Terms are governed by French law. Disputes fall under the jurisdiction of the courts of [TO COMPLETE — city of registered office], subject to mandatory consumer protection rules.` },
      { h: "17. Contact", b: `[TO COMPLETE — company name, postal address, contact email]` },
    ],
  },
};

export default function TermsOfServiceScreen() {
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