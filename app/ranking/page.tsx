"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";

type Season = { id: string; name: string; is_active: boolean };
type League = { id: string; name: string; join_code: string };

const PTS = {
  qualified_ok: 5,
  qualified_bad: -2,
  eliminated_ok: 10,
  eliminated_bad: -5,
};

function shortId(id: string) {
  return id ? id.slice(0, 6) : "??????";
}

export default function RankingPage() {
  const [loading, setLoading] = useState(true);

  const [season, setSeason] = useState<Season | null>(null);

  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");

  const [loadingRanking, setLoadingRanking] = useState(false);
  const [rankingRows, setRankingRows] = useState<{ who: string; pts: number; user_id: string }[]>([]);
  const [rankingEpisodeCount, setRankingEpisodeCount] = useState<number>(0);

  const title = useMemo(() => "SCORY — Classement", []);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session?.user) {
        window.location.href = "/login";
        return;
      }

      // saison active
      const { data: activeSeason, error: seasonErr } = await supabase
        .from("seasons")
        .select("id,name,is_active")
        .eq("is_active", true)
        .maybeSingle<Season>();

      if (seasonErr || !activeSeason) {
        alert("Aucune saison active. Va sur /admin.");
        setLoading(false);
        return;
      }
      setSeason(activeSeason);

      // ligues user
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

      setLoading(false);
    };

    init();
  }, []);

  const scoreEpisode = (pq: string | null, pe: string | null, elimReal: string | null, qSet: Set<string>) => {
    const qualOk = pq ? qSet.has(pq) : false;
    const elimOk = pe && elimReal ? pe === elimReal : false;

    const pts =
      (pq ? (qualOk ? PTS.qualified_ok : PTS.qualified_bad) : 0) +
      (pe && elimReal ? (elimOk ? PTS.eliminated_ok : PTS.eliminated_bad) : 0);

    return pts;
  };

  const loadRanking = async () => {
    if (!season?.id || !selectedLeagueId) return;

    setLoadingRanking(true);
    setRankingRows([]);
    setRankingEpisodeCount(0);

    // 1) épisodes lockés + éliminé réel
    const { data: eps, error: epsErr } = await supabase
      .from("episodes")
      .select("id,number,lock_at,eliminated_candidate_id")
      .eq("season_id", season.id)
      .not("lock_at", "is", null)
      .lte("lock_at", new Date().toISOString())
      .order("number", { ascending: true });

    if (epsErr) {
      alert("Erreur épisodes lockés: " + epsErr.message);
      setLoadingRanking(false);
      return;
    }

    const lockedEpisodes = (eps ?? []) as any[];
    setRankingEpisodeCount(lockedEpisodes.length);

    if (lockedEpisodes.length === 0) {
      setLoadingRanking(false);
      return;
    }

    const episodeIds = lockedEpisodes.map((e) => e.id);

    // 2) qualifiés réels (tous épisodes)
    const { data: qRows, error: qErr } = await supabase
      .from("episode_qualified")
      .select("episode_id,candidate_id")
      .in("episode_id", episodeIds);

    if (qErr) {
      alert("Erreur qualifiés: " + qErr.message);
      setLoadingRanking(false);
      return;
    }

    const qMap = new Map<string, Set<string>>();
    for (const row of qRows ?? []) {
      const eid = String((row as any).episode_id);
      const cid = String((row as any).candidate_id);
      if (!qMap.has(eid)) qMap.set(eid, new Set());
      qMap.get(eid)!.add(cid);
    }

    // 3) predictions (ligue + épisodes)
    const { data: preds, error: pErr } = await supabase
      .from("predictions")
      .select("user_id, episode_id, pred_qualified_candidate_id, pred_eliminated_candidate_id")
      .eq("league_id", selectedLeagueId)
      .in("episode_id", episodeIds);

    if (pErr) {
      alert("Erreur predictions: " + pErr.message);
      setLoadingRanking(false);
      return;
    }

    // 4) calc cumul
    const elimMap = new Map<string, string | null>();
    for (const e of lockedEpisodes) elimMap.set(String(e.id), (e as any).eliminated_candidate_id ?? null);

    const totalByUser = new Map<string, number>();
    for (const r of preds ?? []) {
      const uid = String((r as any).user_id);
      const eid = String((r as any).episode_id);
      const pq = (r as any).pred_qualified_candidate_id as string | null;
      const pe = (r as any).pred_eliminated_candidate_id as string | null;

      const elimReal = elimMap.get(eid) ?? null;
      const qSet = qMap.get(eid) ?? new Set<string>();

      const pts = scoreEpisode(pq, pe, elimReal, qSet);
      totalByUser.set(uid, (totalByUser.get(uid) ?? 0) + pts);
    }

    const rows = Array.from(totalByUser.entries()).map(([uid, pts]) => ({
      user_id: uid,
      who: `membre ${shortId(uid)}`,
      pts,
    }));

    rows.sort((a, b) => b.pts - a.pts);
    setRankingRows(rows);
    setLoadingRanking(false);
  };

  useEffect(() => {
    if (!selectedLeagueId) return;
    if (!season?.id) return;
    loadRanking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeagueId, season?.id]);

  if (loading) return <p style={{ padding: 40 }}>Chargement...</p>;

  return (
    <main style={{ padding: 18, maxWidth: 560, margin: "0 auto", paddingBottom: 50 }}>
      <h1>{title}</h1>

      <div style={card()}>
        <b>Ligue</b>
        <select value={selectedLeagueId} onChange={(e) => setSelectedLeagueId(e.target.value)} style={input()}>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.join_code})
            </option>
          ))}
        </select>

        <p style={{ marginTop: 10, opacity: 0.85 }}>
          Cumul calculé sur <b>{rankingEpisodeCount}</b> épisode(s) locké(s).
        </p>

        <button onClick={loadRanking} style={btn()} disabled={loadingRanking}>
          {loadingRanking ? "Chargement..." : "Rafraîchir"}
        </button>

        <div style={{ marginTop: 10 }}>
          <a href="/app" style={{ textDecoration: "underline" }}>
            ← Retour à SCORY
          </a>
        </div>
      </div>

      <div style={card()}>
        <b>Classement cumulé</b>

        {loadingRanking ? (
          <p style={{ marginTop: 10 }}>Calcul...</p>
        ) : rankingRows.length === 0 ? (
          <p style={{ marginTop: 10 }}>Aucun score pour l’instant (ou aucun épisode locké).</p>
        ) : (
          <ol style={{ marginTop: 10 }}>
            {rankingRows.map((r) => (
              <li key={r.user_id} style={{ marginBottom: 8 }}>
                <b>{r.who}</b> — <b>{r.pts} pts</b>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}

// ---- styles ----
function btn(): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
  };
}
function input(): React.CSSProperties {
  return {
    padding: 10,
    marginTop: 6,
    display: "block",
    width: "100%",
    borderRadius: 12,
    border: "1px solid #ddd",
  };
}
function card(): React.CSSProperties {
  return {
    marginTop: 14,
    padding: 14,
    border: "1px solid #ddd",
    borderRadius: 12,
  };
}
