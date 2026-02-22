"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";

type League = { id: string; name: string; join_code: string };
type Episode = { id: string; number: number; air_date: string | null; lock_at: string | null };
type Candidate = { id: string; name: string; status: string };
type Season = { id: string; name: string; is_active: boolean };

export default function PronoPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [leagues, setLeagues] = useState<League[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");

  const [saving, setSaving] = useState(false);

  const selectedEpisode = useMemo(
    () => episodes.find((e) => e.id === selectedEpisodeId) ?? null,
    [episodes, selectedEpisodeId]
  );

  const isLocked = useMemo(() => {
    if (!selectedEpisode?.lock_at) return false;
    return new Date(selectedEpisode.lock_at).getTime() <= Date.now();
  }, [selectedEpisode]);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session?.user) {
        window.location.href = "/login";
        return;
      }

      setUserId(session.user.id);

      // 1) Saison active
      const { data: season, error: seasonErr } = await supabase
        .from("seasons")
        .select("id,name,is_active")
        .eq("is_active", true)
        .maybeSingle<Season>();

      if (seasonErr || !season) {
        alert("Aucune saison active (ou erreur). Va sur /admin pour en créer une.");
        setLoading(false);
        return;
      }

      // 2) Mes ligues
      const { data: lm, error: lmErr } = await supabase
        .from("league_members")
        .select("leagues(id,name,join_code)")
        .eq("user_id", session.user.id);

      if (lmErr) {
        alert("Erreur ligues: " + lmErr.message);
        setLoading(false);
        return;
      }

      const myLeagues = (lm ?? []).map((r: any) => r.leagues).filter(Boolean) as League[];
      setLeagues(myLeagues);
      if (myLeagues[0]) setSelectedLeagueId(myLeagues[0].id);

      // 3) Episodes
      const { data: eps, error: epsErr } = await supabase
        .from("episodes")
        .select("id,number,air_date,lock_at")
        .eq("season_id", season.id)
        .order("number", { ascending: true });

      if (epsErr) {
        alert("Erreur épisodes: " + epsErr.message);
        setLoading(false);
        return;
      }

      setEpisodes(eps ?? []);
      if (eps?.[0]) setSelectedEpisodeId(eps[0].id);

      // 4) Candidats (actifs)
      const { data: cands, error: candsErr } = await supabase
        .from("candidates")
        .select("id,name,status")
        .eq("season_id", season.id)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (candsErr) {
        alert("Erreur candidats: " + candsErr.message);
        setLoading(false);
        return;
      }

      setCandidates(cands ?? []);
      if (cands?.[0]) setSelectedCandidateId(cands[0].id);

      setLoading(false);
    };

    init();
  }, []);

  // Charger mon prono existant quand league/episode change
  useEffect(() => {
    const loadMyPrediction = async () => {
      if (!userId || !selectedLeagueId || !selectedEpisodeId) return;

      const { data, error } = await supabase
        .from("predictions")
        .select("eliminated_candidate_id")
        .eq("user_id", userId)
        .eq("league_id", selectedLeagueId)
        .eq("episode_id", selectedEpisodeId)
        .maybeSingle();

      if (!error && data?.eliminated_candidate_id) {
        setSelectedCandidateId(data.eliminated_candidate_id);
      }
    };

    loadMyPrediction();
  }, [userId, selectedLeagueId, selectedEpisodeId]);

  const savePrediction = async () => {
    if (!userId) return;
    if (!selectedLeagueId || !selectedEpisodeId || !selectedCandidateId) {
      alert("Choisis ligue + épisode + candidat.");
      return;
    }

    if (isLocked) {
      alert("⛔ Pronos fermés (lock_at dépassé).");
      return;
    }

    setSaving(true);

    // Upsert = crée ou remplace mon prono pour (league,episode,user)
    const { error } = await supabase.from("predictions").upsert(
      {
        league_id: selectedLeagueId,
        episode_id: selectedEpisodeId,
        user_id: userId,
        eliminated_candidate_id: selectedCandidateId,
      },
      { onConflict: "league_id,episode_id,user_id" }
    );

    setSaving(false);

    if (error) {
      alert("Erreur prono: " + error.message);
      return;
    }

    alert("✅ Prono enregistré !");
  };

  if (loading) return <p style={{ padding: 40 }}>Chargement...</p>;

  return (
    <main style={{ padding: 40, maxWidth: 800 }}>
      <h1>SCORY — Pronostic (éliminé)</h1>

      <p>
        <a href="/app">← Retour</a>
      </p>

      <div style={{ marginTop: 20 }}>
        <label><b>Ligue</b></label>
        <br />
        <select
          value={selectedLeagueId}
          onChange={(e) => setSelectedLeagueId(e.target.value)}
          style={{ padding: 10, marginTop: 6, width: 320 }}
        >
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.join_code})
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 20 }}>
        <label><b>Épisode</b></label>
        <br />
        <select
          value={selectedEpisodeId}
          onChange={(e) => setSelectedEpisodeId(e.target.value)}
          style={{ padding: 10, marginTop: 6, width: 320 }}
        >
          {episodes.map((ep) => (
            <option key={ep.id} value={ep.id}>
              Episode {ep.number} — air: {ep.air_date ?? "-"} — lock: {ep.lock_at ?? "-"}
            </option>
          ))}
        </select>
        {selectedEpisode && (
          <p style={{ marginTop: 8 }}>
            Statut : {isLocked ? "⛔ Fermé" : "✅ Ouvert"}
          </p>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <label><b>Qui est éliminé ?</b></label>
        <br />
        <select
          value={selectedCandidateId}
          onChange={(e) => setSelectedCandidateId(e.target.value)}
          style={{ padding: 10, marginTop: 6, width: 320 }}
          disabled={isLocked}
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={savePrediction}
        disabled={saving || isLocked}
        style={{ marginTop: 20, padding: "10px 20px" }}
      >
        {saving ? "Enregistrement..." : "Valider mon prono"}
      </button>

      <p style={{ marginTop: 20, fontSize: 14 }}>
        Règle : tu peux modifier ton prono jusqu’au <b>lock_at</b>.
      </p>
    </main>
  );
}
