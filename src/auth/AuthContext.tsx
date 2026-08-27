import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigError } from "../lib/supabase";
import type { AppUser, RoleName } from "../types";

type AuthContextValue = {
  session: Session | null;
  profile: AppUser | null;
  loading: boolean;
  error: string;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function roleName(value: unknown): RoleName {
  const candidate = Array.isArray(value) ? value[0]?.name : (value as {name?:unknown} | null)?.name;
  return (["Admin","Pastor","Treasurer","Secretary","Encoder","Viewer"] as const).includes(candidate as RoleName)
    ? candidate as RoleName : "Viewer";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState(supabaseConfigError || "");

  const loadProfile = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    if (!supabase || !nextSession?.user) { setProfile(null); setLoading(false); return; }
    const { data, error: profileError } = await supabase.from("users")
      .select("id,email,full_name,is_active,roles(name)")
      .eq("id", nextSession.user.id).single();
    if (profileError) {
      setProfile(null);
      setError(profileError.message.includes("0 rows")
        ? "Your account profile is not ready. Run the Supabase migrations, then sign in again."
        : `Unable to load your account: ${profileError.message}`);
    } else if (!data.is_active) {
      setProfile(null); setError("This account is inactive. Contact an administrator.");
      await supabase.auth.signOut();
    } else {
      setProfile({ id:data.id, email:data.email, fullName:data.full_name || "", role:roleName(data.roles), isActive:data.is_active });
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) { setError(sessionError.message); setLoading(false); return; }
      void loadProfile(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      queueMicrotask(() => void loadProfile(nextSession));
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) { setError(supabaseConfigError || "Supabase is unavailable."); return false; }
    setLoading(true); setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email:email.trim(), password });
    if (authError) { setError(authError.message); setLoading(false); return false; }
    await loadProfile(data.session);
    return true;
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null); setProfile(null); setError("");
  }, []);

  const value = useMemo(() => ({ session, profile, loading, error, signIn, signOut }), [session, profile, loading, error, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
