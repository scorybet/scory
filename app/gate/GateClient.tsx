"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function GateClient() {
  const sp = useSearchParams();
  const nextPath = sp.get("next") || "/";

  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr("");
    setLoading(true);

    const res = await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass }),
    });

    setLoading(false);

    if (!res.ok) {
      setErr("Mot de passe incorrect");
      return;
    }

    window.location.href = nextPath;
  };

  return (
    <main style={{ padding: 40, maxWidth: 420, margin: "0 auto" }}>
      <h1>SCORY — Accès privé</h1>
      <p style={{ opacity: 0.8, marginTop: 8 }}>Entre le mot de passe du site.</p>

      <input
        type="password"
        placeholder="Mot de passe"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        style={{
          padding: 10,
          marginTop: 16,
          width: "100%",
          borderRadius: 12,
          border: "1px solid #ddd",
        }}
      />

      <button
        onClick={submit}
        disabled={loading}
        style={{
          marginTop: 12,
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid #ddd",
          background: "white",
          cursor: "pointer",
          width: "100%",
        }}
      >
        {loading ? "..." : "Entrer"}
      </button>

      {err && <p style={{ color: "red", marginTop: 10 }}>{err}</p>}
    </main>
  );
}