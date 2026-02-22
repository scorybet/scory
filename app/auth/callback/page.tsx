"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        window.location.href = "/login";
        return;
      }

      window.location.href = "/app";
    };

    run();
  }, []);

  return (
    <main style={{ padding: 40 }}>
      <p>Connexion en cours…</p>
    </main>
  );
}