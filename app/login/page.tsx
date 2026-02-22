"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const handleLogin = async () => {
    if (!email) {
      alert("Mets ton email 🙂");
      return;
    }

    setSending(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: "https://scory-three.vercel.app/auth/callback",
      },
    });

    setSending(false);

    if (error) alert("Erreur : " + error.message);
    else alert("Vérifie ton email pour te connecter !");
  };

  return (
    <main style={{ padding: 40 }}>
      <h1>Connexion à SCORY</h1>

      <input
        type="email"
        placeholder="Ton email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: 10, marginTop: 20, display: "block" }}
      />

      <button
        onClick={handleLogin}
        disabled={sending}
        style={{ marginTop: 20, padding: "10px 20px" }}
      >
        {sending ? "Envoi..." : "Se connecter"}
      </button>
    </main>
  );
}
