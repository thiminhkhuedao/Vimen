// src/hooks/useProfile.js — Clerk auth (mobile)
import { useEffect, useState, useCallback } from "react";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { getProfile, createProfile } from "../lib/db";
import { withTimeout } from "../lib/withTimeout";

const MAX_RETRIES = 2;

export function useProfile() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (!isLoaded) return; // Clerk itself still initializing

    if (!isSignedIn || !user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    async function load(attempt = 0) {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchErr } = await withTimeout(getProfile(user.id), 8000, "getProfile");
        if (cancelled) return;

        if (fetchErr?.code === "PGRST116" || !data) {
          // First login on this device — create profile row from Clerk data
          const name  = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Tradesperson";
          const email = user.primaryEmailAddress?.emailAddress ?? "";
          const trade = user.unsafeMetadata?.profession ?? "";

          const { data: created, error: createErr } = await withTimeout(
            createProfile(user.id, { name, email, trade }), 8000, "createProfile"
          );
          if (cancelled) return;

          if (createErr) {
            setError(createErr);
            setLoading(false);
            return;
          }
          setProfile(created);
        } else if (fetchErr) {
          setError(fetchErr);
        } else {
          setProfile(data);
        }

        setLoading(false);

      } catch (err) {
        console.error("[useProfile] load() failed:", err);

        const isTransient = (err instanceof TypeError && /fetch/i.test(err.message))
          || /timed out/i.test(err.message);

        if (isTransient && attempt < MAX_RETRIES && !cancelled) {
          const delay = 600 * (attempt + 1);
          setTimeout(() => { if (!cancelled) load(attempt + 1); }, delay);
          return;
        }

        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      }
    }

    load();

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, user?.id]);

  // Rafraîchissement manuel — utilisé après une action qui modifie le
  // profil côté serveur (connexion Stripe, sauvegarde IBAN, etc.) pour
  // que l'UI reflète l'état à jour sans devoir remonter tout l'écran.
  // Volontairement simple (pas de retry/cancellation comme le chargement
  // initial) : un échec ici peut juste être retenté par l'utilisateur.
  const refresh = useCallback(async () => {
    if (!user) return;
    const { data, error: fetchErr } = await getProfile(user.id);
    if (!fetchErr && data) setProfile(data);
    return { data, error: fetchErr };
  }, [user]);

  return { profile, setProfile, loading, error, refresh };
}