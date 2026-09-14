// src/lib/professions.js

function tOrFallback(t, key, fallback, options) {
  return t ? t(key, { defaultValue: fallback, ...options }) : fallback;
}

export const VERTICALS = {
  trades: {
    id: "trades",
    label: "Trade & construction",
    icon: "🔧",
    color: { bg: "#FFF0EB", text: "#E8500A" },
    professions: [
      "Electrician", "Plumber", "Builder", "HVAC Engineer", "Decorator",
      "Roofer", "Carpenter", "Glazier", "Landscaper", "Plasterer", "Tiler", "Welder",
    ],
    // Terminology overrides for this vertical
    terms: {
      client: "Client",
      booking: "Job",
      bookingPlural: "Jobs",
      credential: "Certification",
      credentialPlural: "Certifications",
      credentialExamples: [
        { name: "18th Edition Wiring Regulations", body: "NICEIC / City & Guilds" },
        { name: "NICEIC Approved Contractor",       body: "NICEIC" },
        { name: "Gas Safe Registered",               body: "Gas Safe Register" },
        { name: "EV Charging Installation (C&G 2919)", body: "City & Guilds" },
        { name: "IPAF Powered Access Licence",       body: "IPAF" },
        { name: "CSCS Card (Electrotechnical)",      body: "CSCS" },
        { name: "Asbestos Awareness",                 body: "UKATA" },
        { name: "First Aid at Work",                  body: "HSE" },
        { name: "Part P Building Regulations",       body: "NAPIT / NICEIC" },
        { name: "BPEC Gas Central Heating",          body: "BPEC" },
      ],
      rateLabel: "Hourly rate",
      serviceLabel: "Job type",
    },
    // Which extra profile fields matter for this vertical
    profileFields: [
      { key: "insurance_provider", label: "Public liability insurer", type: "text", placeholder: "e.g. Simply Business" },
      { key: "insurance_amount",   label: "Cover amount",             type: "text", placeholder: "e.g. €2,000,000" },
      { key: "vat_registered",     label: "VAT registered",           type: "boolean" },
    ],
  },

  beauty: {
    id: "beauty",
    label: "Beauty & wellness",
    icon: "💅",
    color: { bg: "#FDF2F8", text: "#BE185D" },
    professions: [
      "Hairdresser", "Nail Technician", "Spa Therapist", "Massage Therapist",
      "Beautician", "Barber", "Makeup Artist", "Lash Technician", "Personal Trainer",
    ],
    terms: {
      client: "Client",
      booking: "Appointment",
      bookingPlural: "Appointments",
      credential: "Qualification",
      credentialPlural: "Qualifications",
      credentialExamples: [
        { name: "NVQ Level 2 Hairdressing",       body: "City & Guilds" },
        { name: "NVQ Level 3 Hairdressing",       body: "City & Guilds" },
        { name: "CIBTAC Beauty Therapy",          body: "CIBTAC" },
        { name: "Insured Lash Technician",        body: "Public liability insurer" },
        { name: "Level 3 Nail Technology",        body: "VTCT / NVQ" },
        { name: "Level 3 Massage Therapy",        body: "VTCT" },
        { name: "First Aid at Work",              body: "HSE" },
        { name: "Personal Training Level 3",      body: "REPs / CIMSPA" },
      ],
      rateLabel: "Price per service",
      serviceLabel: "Service",
    },
    profileFields: [
      {
        key: "service_menu", label: "Service menu", type: "list",
        itemFields: [
          { key: "name",     label: "Service name", type: "text",   placeholder: "e.g. Gel manicure" },
          { key: "duration", label: "Duration (min)", type: "text", placeholder: "45" },
          { key: "price",    label: "Price (€)",      type: "text", placeholder: "35" },
        ],
      },
      { key: "instagram_handle", label: "Instagram handle", type: "text", placeholder: "@yoursalon" },
    ],
  },

  professional: {
    id: "professional",
    label: "Professional services",
    icon: "⚖️",
    color: { bg: "#EFF6FF", text: "#1D4ED8" },
    professions: [
      "Lawyer", "Notary", "Accountant", "Consultant", "Therapist / Psychologist",
      "Architect", "Financial Advisor", "Tax Advisor", "Surveyor",
    ],
    terms: {
      client: "Client",
      booking: "Consultation",
      bookingPlural: "Consultations",
      credential: "Professional registration",
      credentialPlural: "Professional registrations",
      credentialExamples: [
        { name: "Bar Number — Ordre des Avocats",          body: "Ordre des Avocats" },
        { name: "Chambre des Notaires registration",       body: "Chambre des Notaires" },
        { name: "Professional Indemnity Insurance",        body: "Insurer" },
        { name: "GDPR / Data Protection Certification",    body: "CNIL compliant" },
        { name: "Expert-comptable registration",           body: "Ordre des Experts-Comptables" },
        { name: "Chartered status",                          body: "Professional body" },
      ],
      rateLabel: "Consultation rate",
      serviceLabel: "Consultation type",
    },
    profileFields: [
      { key: "bar_number",        label: "Bar number / registration ID", type: "text", placeholder: "e.g. Ordre des Avocats de Rouen — 12345" },
      { key: "professional_body", label: "Professional body",            type: "text", placeholder: "e.g. Ordre des Avocats" },
      {
        key: "gdpr_accepted", label: "GDPR-compliant client data handling", type: "boolean",
        helpText: "Confirms client information is stored and processed in line with GDPR — shown on your booking page.",
      },
    ],
  },

  other: {
    id: "other",
    label: "Other services",
    icon: "📋",
    color: { bg: "#F2F0EC", text: "#6B6460" },
    professions: ["Other"],
    terms: {
      client: "Client",
      booking: "Booking",
      bookingPlural: "Bookings",
      credential: "Certification",
      credentialPlural: "Certifications",
      credentialExamples: [],
      rateLabel: "Rate",
      serviceLabel: "Service",
    },
    profileFields: [],
  },
};


export const ALL_PROFESSIONS = Object.values(VERTICALS).flatMap(v =>
  v.professions.map(p => ({ profession: p, vertical: v.id }))
);


export function getVerticalForProfession(profession) {
  if (!profession) return VERTICALS.other;
  const match = ALL_PROFESSIONS.find(p => p.profession === profession);
  return match ? VERTICALS[match.vertical] : VERTICALS.other;
}

export function getTerms(profession) {
  return getVerticalForProfession(profession).terms;
}

export function getVerticalColor(profession) {
  return getVerticalForProfession(profession).color;
}

function translateField(field, keyPath, t) {
  const path = `${keyPath}.${field.key}`;
  const out = {
    ...field,
    label: tOrFallback(t, `professions.fields.${path}.label`, field.label),
  };
  if (field.placeholder) {
    out.placeholder = tOrFallback(t, `professions.fields.${path}.placeholder`, field.placeholder);
  }
  if (field.helpText) {
    out.helpText = tOrFallback(t, `professions.fields.${path}.helpText`, field.helpText);
  }
  if (field.itemFields) {
    out.itemFields = field.itemFields.map(sf => translateField(sf, `${path}.items`, t));
  }
  return out;
}

// Manquait complètement côté mobile — importée dans settings.js mais
// jamais exportée ici, ce qui fait planter l'écran dès l'ouverture de
// l'onglet Compte (getProfileFields is not a function).
export function getProfileFields(profession, t) {
  const vertical = getVerticalForProfession(profession);
  const raw = vertical.profileFields ?? [];
  if (!t) return raw;
  return raw.map(f => translateField(f, vertical.id, t));
}
