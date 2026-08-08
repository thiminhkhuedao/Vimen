// src/lib/professions.js

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
    profileFields: ["hourly_rate", "certifications", "insurance"],
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
    profileFields: ["service_menu", "portfolio_images", "qualifications"],
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
    profileFields: ["bar_number", "professional_body", "gdpr_statement"],
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
