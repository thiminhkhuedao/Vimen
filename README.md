# Vinem — Mobile (Expo)

A mobile application for booking, invoicing, and payment management designed for freelancers and small businesses across various industries — including trades & construction, beauty & wellness, and professional services.

Vinem helps independent professionals manage quotes, appointments, invoices, and payments in one place, with support for both English and French.

## Tech Stack

| | |
|---|---|
| Framework | Expo SDK 54 (managed workflow) |
| Routing | `expo-router` v6, file-based routing with typed routes enabled |
| UI | React 19.1.0 / React Native 0.81.5 |
| Authentication | Clerk (`@clerk/clerk-expo`) |
| Database | Supabase (`@supabase/supabase-js`) |
| Local Storage | `expo-secure-store` + `@react-native-async-storage/async-storage` |
| Internationalization | Custom i18n engine (`src/hooks/i18n/`), English / French |
| Currency | Euro (€) formatting through `fmt()` in `src/styles/tokens.js` |
| Build & Distribution | EAS (`eas.json`) |

---

## Requirements

- Node.js
- An [Expo](https://expo.dev) account (for EAS build/submit)
- A [Supabase](https://supabase.com) project
- A [Clerk](https://dashboard.clerk.com) account

---

## Installation

```bash
npm install
cp .env.example .env
# Add your environment variables in .env
npx expo start
```

`expo start` allows running the application on iOS, Android, or web.

You can also directly use:

```bash
npm run ios
npm run android
npm run web
```

---

## Environment Variables

All variables are prefixed with `EXPO_PUBLIC_`. These are public client-side variables intended to be embedded in the application. No backend secrets are stored inside the app.

```bash
# .env

EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# Clerk — dashboard.clerk.com
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

`.env` is ignored by Git (see `.gitignore`) and should never be committed. Only `.env.example` is version-controlled.

---

## Application Identifiers

- iOS Bundle ID / Android Package: `app.Vinem.mobile`
- Deep Link Scheme: `Vinem`
- EAS Project ID: `85787e1d-b789-4156-b10b-7f669c2df438`
- Brand Color (splash screen / adaptive icon): `#E8500A`

---

## Building with EAS

Three build profiles are configured in `eas.json`:

```bash
eas build --profile development   # Development client, internal distribution
eas build --profile preview       # Internal distribution
eas build --profile production    # Production build with automatic versioning

eas submit --profile production
```

---

# Project Structure

```
assets/
  icon.png
  splash.png
  adaptive-icon.png
  favicon.png

app/
  _layout.js                  # Root layout — ClerkProvider, Clerk → Supabase bridge
  index.js                    # Redirects users based on authentication state

  (auth)/
    _layout.js
    sign-in.js
    sign-up.js

  (tabs)/
    _layout.js                # Main tab navigation
    index.js                  # Dashboard
    jobs.js
    clients.js
    invoices.js
    marketplace.js
    settings.js
    more.js

  (screens)/
    _layout.js
    quotes.js
    payments.js
    reviews.js
    certifications.js
    referrals.js
    booking.js

src/
  components/
    UI.js                     # Reusable UI components:
                              # Buttons, Cards, Inputs, Avatars, Sheets, etc.

  hooks/
    useLanguage.js             # Language management with SecureStore persistence
    useProfile.js              # Clerk + Supabase profile management
    i18n/
      index.js                 # Translation engine
      en.js
      fr.js

  lib/
    supabase.js                # Supabase client
    db.js                      # Database operations
    notifications.js           # Email/SMS notifications through Edge Functions
    professions.js             # Industry-specific terminology
    withTimeout.js

  styles/
    tokens.js                  # Design system tokens and formatters

supabase/
  migrations/
    004_service_options.sql    # Service options database migration
```

---

# Bookable Service Options

The **Options** section in `app/(screens)/booking.js` allows professionals to create customizable bookable services.

Each service option can include:

- Title
- Description
- Price
- Image

Clients can then select predefined services from the public booking page or request a custom service.

Features implemented:

- Creating, editing, and deleting service options
- Uploading service images
- Managing booking-related data through Supabase

Database migration:

```
supabase/migrations/004_service_options.sql
```

This migration creates:

- `service_options` table
- `booking-images` storage bucket

Additional dependency:

```
expo-image-picker
```

---

# Internationalization (i18n)

Vinem uses a custom translation engine located in:

```
src/hooks/i18n/
```

It provides:

- `t()`
- `useTranslation()`
- `setLanguage()`

Supported languages:

- English 🇬🇧
- French 🇫🇷

All translation keys used across the application's screens have been automatically verified against both language dictionaries.

---

# Currency Handling

All monetary values are formatted through:

```
src/styles/tokens.js
```

using the shared `fmt()` function.

The application consistently displays prices in euros:

```
1 234,56 €
```

Changing the currency only requires updating this centralized formatting function.

---

# Technical Notes

### Reanimated Configuration

`react-native-reanimated` is intentionally not configured in `babel.config.js`.

It exists only as a transitive dependency of `react-native-gesture-handler`.

If future features require Reanimated animations:

- Install `react-native-worklets`
- Add:

```javascript
'react-native-worklets/plugin'
```

as the last Babel plugin.

---

### Managed Workflow

The `.gitignore` excludes:

```
ios/
android/
```

The project remains fully managed through Expo, without committing generated native folders.

---

# Available Scripts

```bash
npm run start      # Start Expo development server
npm run android    # Run on Android
npm run ios        # Run on iOS
npm run web        # Run in browser
```