"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";

type Season = { id: string; name: string; is_active: boolean; winner_lock_at: string | null };
type Candidate = { id: string; name: string; status: string };
type Episode = {
  id: string;
  number: number;
  air_date: string | null;
  lock_at: string | null;
  eliminated_candidate_id: string | null;
};

export default function AdminPage() {
  const [loading, setLoading] = useState(true);

  const [season, setSeason] = useState<Season | null>(null);

  // Add season
  const [seasonName, setSeasonName] = useState("Top Chef - Saison 2026");

  // winner lock
  const [winnerLockAt, setWinnerLockAt] = useState<string>(""); // datetime-local
  const [savingWinnerLock, setSavingWinnerLock] = useState(false);

  // Add candidate
  const [candidateName, setCandidateName] = useState("");

  // Add episode
  const [episodeNumber, setEpisodeNumber] = useState<number>(1);
  const [airDate, setAirDate] = useState<string>(""); // YYYY-MM-DD
  const [lockAt, setLockAt] = useState<string>(""); // datetime-local

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  // Results editor
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("");
  const [selectedEliminatedId, setSelectedEliminatedId] = useState<string>("");

  const [qualifiedSet, setQualifiedSet] = useState<Set<string>>(new Set());
  const [savingElim, setSavingElim] = useState(false);

  const selectedEpisode = useMemo(
    () => episodes.find((e) => e.id === selectedEpisodeId) ?? null,
    [episodes, selectedEpisodeId]
  );

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        window.location.href = "/login";
        return;
      }
      await loadActiveSeason();
      setLoading(false);
    };
    init();
  }, []);

  const loadActiveSeason = async () => {
    const { data, error } = await supabase
      .from("seasons")
      .select("id,name,is_active,winner_lock_at")
      .eq("is_active", true)
      .maybeSingle<Season>();

    if (error) {
      alert("Erreur seasons: " + error.message);
      return;
    }

    setSeason(data ?? null);

    // populate winnerLockAt input from season (format datetime-local)
    if (data?.winner_lock_at) {
      // convert ISO to yyyy-MM-ddTHH:mm for input
      const d = new Date(data.winner_lock_at);
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}`;
      setWinnerLockAt(local);
    } else {
      setWinnerLockAt("");
    }

    if (data?.id) {
      await refreshCandidates(data.id);
      await refreshEpisodes(data.id);
    } else {
      setCandidates([]);
      setEpisodes([]);
      setSelectedEpisodeId("");
    }
  };

  const refreshCandidates = async (seasonId: string) => {
    const { data, error } = await supabase
      .from("candidates")
      .select("id,name,status")
      .eq("season_id", seasonId)
      .order("created_at", { ascending: true });

    if (!error && data) setCandidates(data);
  };

  const refreshEpisodes = async (seasonId: string) => {
    const { data, error } = await supabase
      .from("episodes")
      .select("id,number,air_date,lock_at,eliminated_candidate_id")
      .eq("season_id", seasonId)
      .order("number", { ascending: true });

    if (!error && data) {
      setEpisodes(data as Episode[]);
      if (!selectedEpisodeId && data[0]) setSelectedEpisodeId(data[0].id);
    }
  };

  const createActiveSeason = async () => {
    const name = seasonName.trim();
    if (!name) return alert("Nom de saison requis");

    await supabase.from("seasons").update({ is_active: false }).eq("is_active", true);

    const { data, error } = await supabase
      .from("seasons")
      .insert({ name, is_active: true })
      .select("id,name,is_active,winner_lock_at")
      .single();

    if (error) return alert("Erreur création saison: " + error.message);

    setSeason(data);
    setCandidates([]);
    setEpisodes([]);
    setSelectedEpisodeId("");
    setWinnerLockAt("");
    alert("✅ Saison active créée");
  };

  const saveWinnerLockAt = async () => {
    if (!season) return alert("Crée une saison active d’abord.");
    setSavingWinnerLock(true);

    const iso = winnerLockAt ? new Date(winnerLockAt).toISOString() : null;

    const { error } = await supabase
      .from("seasons")
      .update({ winner_lock_at: iso })
      .eq("id", season.id);

    setSavingWinnerLock(false);

    if (error) return alert("Erreur winner_lock_at: " + error.message);

    alert("✅ Date limite du Grand Gagnant enregistrée");
    await loadActiveSeason();
  };

  const addCandidate = async () => {
    if (!season) return alert("Crée une saison active d’abord.");
    const name = candidateName.trim();
    if (!name) return alert("Nom du candidat requis");

    const { error } = await supabase.from("candidates").insert({
      season_id: season.id,
      name,
      status: "active",
    });

    if (error) return alert("Erreur candidat: " + error.message);

    setCandidateName("");
    await refreshCandidates(season.id);
  };

  const deleteCandidate = async (id: string) => {
    if (!season) return;
    if (!confirm("Supprimer ce candidat ?")) return;

    const { error } = await supabase.from("candidates").delete().eq("id", id);

    if (error) return alert("Erreur suppression : " + error.message);

    await refreshCandidates(season.id);
  };

  const addEpisode = async () => {
    if (!season) return alert("Crée une saison active d’abord.");
    if (!episodeNumber || episodeNumber < 1) return alert("Numéro d’épisode invalide");

    const payload: any = {
      season_id: season.id,
      number: episodeNumber,
    };

    if (airDate) payload.air_date = airDate;
    if (lockAt) payload.lock_at = new Date(lockAt).toISOString();

    const { error } = await supabase.from("episodes").insert(payload);

    if (error) return alert("Erreur épisode: " + error.message);

    setEpisodeNumber((n) => n + 1);
    setAirDate("");
    setLockAt("");
    await refreshEpisodes(season.id);
  };

  const deleteEpisode = async (id: string) => {
    if (!season) return;
    if (!confirm("Supprimer cet épisode ?")) return;

    const { error } = await supabase.from("episodes").delete().eq("id", id);

    if (error) return alert("Erreur suppression : " + error.message);

    await refreshEpisodes(season.id);
  };

  // ----------- Results (eliminated + qualified list) -----------
  const loadEpisodeResults = async (episodeId: string) => {
    const ep = episodes.find((e) => e.id === episodeId);
    setSelectedEliminatedId(ep?.eliminated_candidate_id ?? "");

    const { data, error } = await supabase
      .from("episode_qualified")
      .select("candidate_id")
      .eq("episode_id", episodeId);

    if (error) {
      alert("Erreur chargement qualifiés: " + error.message);
      setQualifiedSet(new Set());
      return;
    }

    setQualifiedSet(new Set((data ?? []).map((r: any) => String(r.candidate_id))));
  };

  useEffect(() => {
    if (!selectedEpisodeId) return;
    loadEpisodeResults(selectedEpisodeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEpisodeId]);

  const toggleQualified = async (candidateId: string) => {
    if (!selectedEpisodeId) return;

    const already = qualifiedSet.has(candidateId);

    if (!already && selectedEliminatedId && candidateId === selectedEliminatedId) {
      alert("L'éliminé ne peut pas être qualifié 🙂");
      return;
    }

    const next = new Set(qualifiedSet);
    if (already) next.delete(candidateId);
    else next.add(candidateId);
    setQualifiedSet(next);

    if (already) {
      const { error } = await supabase
        .from("episode_qualified")
        .delete()
        .eq("episode_id", selectedEpisodeId)
        .eq("candidate_id", candidateId);

      if (error) alert("Erreur delete qualifié: " + error.message);
    } else {
      const { error } = await supabase.from("episode_qualified").insert({
        episode_id: selectedEpisodeId,
        candidate_id: candidateId,
      });

      if (error) alert("Erreur insert qualifié: " + error.message);
    }
  };

  const saveEliminated = async () => {
    if (!selectedEpisodeId) return;

    setSavingElim(true);

    if (selectedEliminatedId) {
      await supabase
        .from("episode_qualified")
        .delete()
        .eq("episode_id", selectedEpisodeId)
        .eq("candidate_id", selectedEliminatedId);

      const next = new Set(qualifiedSet);
      next.delete(selectedEliminatedId);
      setQualifiedSet(next);
    }

    const { error } = await supabase
      .from("episodes")
      .update({ eliminated_candidate_id: selectedEliminatedId || null })
      .eq("id", selectedEpisodeId);

    setSavingElim(false);

    if (error) return alert("Erreur save éliminé: " + error.message);

    if (season) await refreshEpisodes(season.id);
    alert("✅ Résultat enregistré");
  };

  const setAllQualifiedExceptEliminated = async () => {
    if (!selectedEpisodeId) return;
    if (!confirm("Ajouter tous les candidats ACTIFS comme qualifiés (sauf l'éliminé) ?")) return;

    const all = candidates
      .filter((c) => c.status === "active")
      .map((c) => c.id)
      .filter((id) => !selectedEliminatedId || id !== selectedEliminatedId);

    await supabase.from("episode_qualified").delete().eq("episode_id", selectedEpisodeId);

    const rows = all.map((candidate_id) => ({
      episode_id: selectedEpisodeId,
      candidate_id,
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from("episode_qualified").insert(rows);
      if (error) return alert("Erreur set qualifiés: " + error.message);
    }

    setQualifiedSet(new Set(all));
    alert("✅ Qualifiés mis à jour");
  };

  if (loading) return <p style={{ padding: 40 }}>Chargement...</p>;

  return (
    <main style={{ padding: 40, maxWidth: 1000 }}>
      <h1>SCORY — Admin</h1>

      <section style={{ marginTop: 20 }}>
        <h2>Saison active</h2>
        {season ? (
          <p>
            ✅ Saison active : <b>{season.name}</b>
          </p>
        ) : (
          <p>⚠️ Aucune saison active.</p>
        )}

        <div style={{ marginTop: 10 }}>
          <input
            value={seasonName}
            onChange={(e) => setSeasonName(e.target.value)}
            style={{ padding: 10, width: 320 }}
            placeholder="Nom de saison"
          />
          <button onClick={createActiveSeason} style={{ marginLeft: 10, padding: "10px 20px" }}>
            Créer / définir active
          </button>
          <button onClick={loadActiveSeason} style={{ marginLeft: 10, padding: "10px 20px" }}>
            Rafraîchir
          </button>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 14, maxWidth: 520 }}>
          <h3 style={{ marginTop: 0 }}>Grand Gagnant — Date limite (winner_lock_at)</h3>
          <p style={{ marginTop: 0, opacity: 0.8 }}>
            Si vide = pas de verrouillage (tu peux définir plus tard).
          </p>

          <input
            type="datetime-local"
            value={winnerLockAt}
            onChange={(e) => setWinnerLockAt(e.target.value)}
            style={{ padding: 10, width: "100%" }}
          />

          <button
            onClick={saveWinnerLockAt}
            disabled={savingWinnerLock || !season}
            style={{ marginTop: 10, padding: "10px 20px" }}
          >
            {savingWinnerLock ? "Enregistrement..." : "Enregistrer la date limite"}
          </button>

          <p style={{ marginTop: 10 }}>
            Valeur actuelle : <b>{season?.winner_lock_at ?? "—"}</b>
          </p>
        </div>
      </section>

      <hr style={{ margin: "25px 0" }} />

      <section>
        <h2>Candidats</h2>
        <div style={{ marginTop: 10 }}>
          <input
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            style={{ padding: 10, width: 320 }}
            placeholder="Nom du candidat"
          />
          <button onClick={addCandidate} style={{ marginLeft: 10, padding: "10px 20px" }}>
            Ajouter
          </button>
        </div>

        <ul style={{ marginTop: 10 }}>
          {candidates.map((c) => (
            <li key={c.id}>
              {c.name} — <i>{c.status}</i>
              <button onClick={() => deleteCandidate(c.id)} style={{ marginLeft: 10 }}>
                ❌
              </button>
            </li>
          ))}
        </ul>
      </section>

      <hr style={{ margin: "25px 0" }} />

      <section>
        <h2>Épisodes</h2>
        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="number"
            value={episodeNumber}
            onChange={(e) => setEpisodeNumber(Number(e.target.value))}
            style={{ padding: 10, width: 140 }}
            placeholder="N°"
          />
          <input type="date" value={airDate} onChange={(e) => setAirDate(e.target.value)} style={{ padding: 10 }} />
          <input
            type="datetime-local"
            value={lockAt}
            onChange={(e) => setLockAt(e.target.value)}
            style={{ padding: 10 }}
          />
          <button onClick={addEpisode} style={{ padding: "10px 20px" }}>
            Ajouter épisode
          </button>
        </div>

        <ul style={{ marginTop: 10 }}>
          {episodes.map((ep) => (
            <li key={ep.id}>
              Episode {ep.number} — lock: {ep.lock_at ?? "-"} — éliminé:{" "}
              <b>{ep.eliminated_candidate_id ? ep.eliminated_candidate_id.slice(0, 6) : "-"}</b>
              <button onClick={() => deleteEpisode(ep.id)} style={{ marginLeft: 10 }}>
                ❌
              </button>
            </li>
          ))}
        </ul>
      </section>

      <hr style={{ margin: "25px 0" }} />

      <section>
        <h2>Résultats (épisode)</h2>

        {episodes.length === 0 ? (
          <p>Crée au moins un épisode.</p>
        ) : (
          <>
            <div style={{ marginTop: 10 }}>
              <label>
                <b>Épisode</b>
              </label>
              <select
                value={selectedEpisodeId}
                onChange={(e) => setSelectedEpisodeId(e.target.value)}
                style={{ padding: 10, display: "block", marginTop: 6, width: 360 }}
              >
                {episodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    Episode {ep.number}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: 14 }}>
              <label>
                <b>Éliminé réel (1 seul)</b>
              </label>
              <select
                value={selectedEliminatedId}
                onChange={(e) => setSelectedEliminatedId(e.target.value)}
                style={{ padding: 10, display: "block", marginTop: 6, width: 360 }}
              >
                <option value="">— (pas défini)</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <button
                onClick={saveEliminated}
                disabled={savingElim}
                style={{ marginTop: 10, padding: "10px 20px" }}
              >
                {savingElim ? "Enregistrement..." : "Enregistrer éliminé"}
              </button>
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <b>Qualifiés réels (plusieurs)</b>
                <button onClick={setAllQualifiedExceptEliminated} style={{ padding: "8px 12px" }}>
                  Mettre “tous qualifiés” (sauf éliminé)
                </button>
              </div>

              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Le joueur choisit 1 “qualifié”. Il gagne si son choix est dans cette liste.
              </p>

              <div style={{ marginTop: 10, border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                {candidates
                  .filter((c) => c.status === "active")
                  .map((c) => {
                    const checked = qualifiedSet.has(c.id);
                    const disabled = !!selectedEliminatedId && c.id === selectedEliminatedId;
                    return (
                      <label key={c.id} style={{ display: "block", padding: "6px 0", opacity: disabled ? 0.5 : 1 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleQualified(c.id)}
                          style={{ marginRight: 10 }}
                        />
                        {c.name} {disabled ? "(éliminé)" : ""}
                      </label>
                    );
                  })}
              </div>

              <p style={{ marginTop: 10 }}>
                Total qualifiés cochés : <b>{qualifiedSet.size}</b>
              </p>
              {selectedEpisode && (
                <p style={{ marginTop: 6, fontSize: 14, opacity: 0.75 }}>
                  Épisode {selectedEpisode.number} — lock: {selectedEpisode.lock_at ?? "-"}
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
