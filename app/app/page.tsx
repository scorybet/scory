"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";

type League = { id: string; name: string; join_code: string };
type Season = { id: string; name: string; is_active: boolean; winner_lock_at?: string | null };
type Episode = { id: string; number: number; air_date: string | null; lock_at: string | null };
type Candidate = { id: string; name: string; status: string };

type Tab = "home" | "leagues" | "prono" | "recap" | "winner" | "ranking";

function generateJoinCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function shortId(id: string) {
  return id ? id.slice(0, 6) : "??????";
}

const PTS = {
  qualified_ok: 5,
  qualified_bad: -2,
  eliminated_ok: 10,
  eliminated_bad: -5,
};

export default function AppPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("home");
  const title = useMemo(() => "SCORY — App", []);

  // profiles (pseudos)
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());
  const [myUsername, setMyUsername] = useState<string>("");
  const [savingUsername, setSavingUsername] = useState(false);

  // leagues
  const [leagues, setLeagues] = useState<League[]>([]);
  const [leagueName, setLeagueName] = useState("");
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState("");
  const [joiningLeague, setJoiningLeague] = useState(false);

  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");

  // season / data
  const [season, setSeason] = useState<Season | null>(null);
  const [winnerLockAt, setWinnerLockAt] = useState<string | null>(null);

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("");

  // prono (1 qualifié + 1 éliminé)
  const [predQualifiedId, setPredQualifiedId] = useState<string>("");
  const [predEliminatedId, setPredEliminatedId] = useState<string>("");

  const [savingProno, setSavingProno] = useState(false);

  // recap
  const [loadingRecap, setLoadingRecap] = useState(false);
  const [episodeEliminatedId, setEpisodeEliminatedId] = useState<string | null>(null);
  const [qualifiedSet, setQualifiedSet] = useState<Set<string>>(new Set());
  const [leaguePreds, setLeaguePreds] = useState<
    { who: string; q: string | null; e: string | null; pts: number }[]
  >([]);

  // winner tab
  const [winnerPickId, setWinnerPickId] = useState<string>("");
  const [savingWinner, setSavingWinner] = useState(false);
  const [myWinnerSaved, setMyWinnerSaved] = useState<string | null>(null);

  // ranking tab (classement cumulé)
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [rankingRows, setRankingRows] = useState<{ user_id: string; who: string; pts: number }[]>([]);
  const [rankingEpisodeCount, setRankingEpisodeCount] = useState<number>(0);

  const selectedEpisode = useMemo(
    () => episodes.find((e) => e.id === selectedEpisodeId) ?? null,
    [episodes, selectedEpisodeId]
  );

  const isEpisodeLocked = useMemo(() => {
    if (!selectedEpisode?.lock_at) return false;
    return new Date(selectedEpisode.lock_at).getTime() <= Date.now();
  }, [selectedEpisode]);

  const isWinnerLocked = useMemo(() => {
    if (!winnerLockAt) return false;
    return new Date(winnerLockAt).getTime() <= Date.now();
  }, [winnerLockAt]);

  const candidateNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of candidates) m.set(c.id, c.name);
    return m;
  }, [candidates]);

  const displayName = (uid: string) => {
    const u = profilesMap.get(uid);
    return u && u.trim() ? u : `membre ${shortId(uid)}`;
  };

  const scoreEpisode = (pq: string | null, pe: string | null, elimReal: string | null, qSet: Set<string>) => {
    const qualOk = pq ? qSet.has(pq) : false;
    const elimOk = pe && elimReal ? pe === elimReal : false;

    const pts =
      (pq ? (qualOk ? PTS.qualified_ok : PTS.qualified_bad) : 0) +
      (pe && elimReal ? (elimOk ? PTS.eliminated_ok : PTS.eliminated_bad) : 0);

    return pts;
  };

  const loadMyProfile = async (uid: string) => {
    const { data, error } = await supabase.from("profiles").select("username").eq("id", uid).maybeSingle();
    if (!error) setMyUsername((data as any)?.username ?? "");
  };

const saveMyProfile = async () => {
  if (!userId) return;

  const name = myUsername.trim();

  if (name.length < 2) return alert("Pseudo trop court 🙂 (min 2 caractères)");
  if (name.length > 20) return alert("Pseudo trop long 🙂 (max 20 caractères)");

  // Autorise: lettres, chiffres, espace, _ et -
  const ok = /^[a-zA-Z0-9 _-]+$/.test(name);
  if (!ok) return alert("Pseudo invalide 🙂 (lettres, chiffres, espace, _ et - uniquement)");

  setSavingUsername(true);

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, username: name }, { onConflict: "id" });

  setSavingUsername(false);

  if (error) {
    // Postgres unique violation
    if ((error as any).code === "23505") {
      alert("Ce pseudo est déjà pris 😅 Choisis-en un autre.");
      return;
    }
    alert("Erreur pseudo: " + error.message);
    return;
  }

  alert("✅ Pseudo enregistré !");
  await loadProfilesForLeague(selectedLeagueId);
};

const loadProfilesForLeague = async (leagueId: string) => {
  if (!leagueId) return;


    // 1) membres ligue => user_id
    const { data: members, error: mErr } = await supabase
      .from("league_members")
      .select("user_id")
      .eq("league_id", leagueId);

    if (mErr) return;

    const ids = (members ?? []).map((r: any) => String(r.user_id));
    if (ids.length === 0) {
      setProfilesMap(new Map());
      return;
    }

    // 2) profils de ces users
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id,username")
      .in("id", ids);

    if (pErr) return;

    const map = new Map<string, string>();
    for (const p of profs ?? []) {
      map.set(String((p as any).id), String((p as any).username ?? ""));
    }
    setProfilesMap(map);
  };

  // ---------- INIT ----------
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session?.user) {
        window.location.href = "/login";
        return;
      }

      setEmail(session.user.email ?? null);
      setUserId(session.user.id);

      await loadMyProfile(session.user.id);

      // Saison active
      const { data: activeSeason, error: seasonErr } = await supabase
        .from("seasons")
        .select("id,name,is_active,winner_lock_at")
        .eq("is_active", true)
        .maybeSingle<Season>();

      if (seasonErr || !activeSeason) {
        alert("Aucune saison active. Va sur /admin pour en créer une.");
        setLoading(false);
        return;
      }
      setSeason(activeSeason);
      setWinnerLockAt((activeSeason as any).winner_lock_at ?? null);

      // Mes ligues
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

      // Episodes
      const { data: eps, error: epsErr } = await supabase
        .from("episodes")
        .select("id,number,air_date,lock_at")
        .eq("season_id", activeSeason.id)
        .order("number", { ascending: true });

      if (epsErr) {
        alert("Erreur épisodes: " + epsErr.message);
        setLoading(false);
        return;
      }
      setEpisodes(eps ?? []);
      if (eps?.[0]) setSelectedEpisodeId(eps[0].id);

      // Candidats actifs
      const { data: cands, error: candsErr } = await supabase
        .from("candidates")
        .select("id,name,status")
        .eq("season_id", activeSeason.id)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (candsErr) {
        alert("Erreur candidats: " + candsErr.message);
        setLoading(false);
        return;
      }
      setCandidates(cands ?? []);

      // defaults
      if (cands?.[0]) {
        setPredQualifiedId(cands[0].id);
        setPredEliminatedId(cands[0].id);
        setWinnerPickId(cands[0].id);
      }

      // Charger mon pari gagnant (si existant) pour la première ligue
      const firstLeagueId = myLeagues[0]?.id;
      if (firstLeagueId) {
        const { data: wp } = await supabase
          .from("winner_predictions")
          .select("winner_candidate_id")
          .eq("season_id", activeSeason.id)
          .eq("league_id", firstLeagueId)
          .eq("user_id", session.user.id)
          .maybeSingle();

        if ((wp as any)?.winner_candidate_id) {
          setWinnerPickId((wp as any).winner_candidate_id);
          setMyWinnerSaved((wp as any).winner_candidate_id);
        }
      }

      // charger pseudos de la ligue par défaut
      if (myLeagues[0]?.id) await loadProfilesForLeague(myLeagues[0].id);

      setLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recharger les pseudos dès qu'on change de ligue
  useEffect(() => {
    if (!selectedLeagueId) return;
    loadProfilesForLeague(selectedLeagueId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeagueId]);

  const refreshLeagues = async (uid: string) => {
    const { data, error } = await supabase
      .from("league_members")
      .select("leagues(id,name,join_code)")
      .eq("user_id", uid);

    if (!error && data) {
      const myLeagues = (data ?? []).map((r: any) => r.leagues).filter(Boolean) as League[];
      setLeagues(myLeagues);
      if (!selectedLeagueId && myLeagues[0]) setSelectedLeagueId(myLeagues[0].id);
    }
  };

  // ---------- LEAGUES ----------
  const createLeague = async () => {
    if (!userId) return;
    if (!leagueName.trim()) return alert("Donne un nom à ta ligue 🙂");

    setCreatingLeague(true);
    setCreatedCode(null);

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateJoinCode();

      const { data: league, error: leagueErr } = await supabase
        .from("leagues")
        .insert({ name: leagueName.trim(), join_code: code, owner_id: userId })
        .select("id,name,join_code")
        .single();

      if (leagueErr) {
        if ((leagueErr as any).code === "23505") continue;
        alert("Erreur création ligue : " + leagueErr.message);
        setCreatingLeague(false);
        return;
      }

      const { error: memberErr } = await supabase.from("league_members").insert({
        league_id: (league as any).id,
        user_id: userId,
        role: "owner",
      });

      if (memberErr) {
        alert("Erreur ajout membre : " + memberErr.message);
        setCreatingLeague(false);
        return;
      }

      setCreatedCode(code);
      setLeagueName("");
      await refreshLeagues(userId);
      setSelectedLeagueId((league as any).id);
      await loadProfilesForLeague((league as any).id);
      setCreatingLeague(false);
      return;
    }

    alert("Impossible de générer un code unique, réessaie.");
    setCreatingLeague(false);
  };

  const joinLeague = async () => {
    if (!userId) return;

    const code = joinCode.trim().toUpperCase();
    if (!code) return alert("Entre un code 🙂");

    setJoiningLeague(true);

    const { data: league, error: leagueErr } = await supabase
      .from("leagues")
      .select("id")
      .eq("join_code", code)
      .single();

    if (leagueErr || !league) {
      alert("Code invalide ou ligue introuvable.");
      setJoiningLeague(false);
      return;
    }

    const { error: memberErr } = await supabase.from("league_members").insert({
      league_id: (league as any).id,
      user_id: userId,
      role: "member",
    });

    if (memberErr && (memberErr as any).code !== "23505") {
      alert("Erreur : " + memberErr.message);
      setJoiningLeague(false);
      return;
    }

    alert("✅ Tu as rejoint la ligue !");
    setJoinCode("");
    await refreshLeagues(userId);
    setSelectedLeagueId((league as any).id);
    await loadProfilesForLeague((league as any).id);
    setJoiningLeague(false);
  };

  // ---------- LOAD MY PRONO ----------
  useEffect(() => {
    const loadMyPrediction = async () => {
      if (!userId || !selectedLeagueId || !selectedEpisodeId) return;

      const { data, error } = await supabase
        .from("predictions")
        .select("pred_qualified_candidate_id, pred_eliminated_candidate_id")
        .eq("user_id", userId)
        .eq("league_id", selectedLeagueId)
        .eq("episode_id", selectedEpisodeId)
        .maybeSingle();

      if (!error && data) {
        if ((data as any).pred_qualified_candidate_id) setPredQualifiedId((data as any).pred_qualified_candidate_id);
        if ((data as any).pred_eliminated_candidate_id) setPredEliminatedId((data as any).pred_eliminated_candidate_id);
      }
    };

    loadMyPrediction();
  }, [userId, selectedLeagueId, selectedEpisodeId]);

  // ---------- SAVE PRONO ----------
  const savePrediction = async () => {
    if (!userId) return;
    if (!selectedLeagueId || !selectedEpisodeId || !predQualifiedId || !predEliminatedId) {
      alert("Choisis ligue + épisode + qualifié + éliminé.");
      return;
    }
    if (predQualifiedId === predEliminatedId) {
      alert("Ton qualifié ne peut pas être ton éliminé 🙂");
      return;
    }
    if (isEpisodeLocked) {
      alert("⛔ Pronos fermés (lock_at dépassé).");
      return;
    }

    setSavingProno(true);

    const { error } = await supabase.from("predictions").upsert(
      {
        league_id: selectedLeagueId,
        episode_id: selectedEpisodeId,
        user_id: userId,
        pred_qualified_candidate_id: predQualifiedId,
        pred_eliminated_candidate_id: predEliminatedId,
      },
      { onConflict: "league_id,episode_id,user_id" }
    );

    setSavingProno(false);

    if (error) {
      alert("Erreur prono: " + error.message);
      return;
    }
    alert("✅ Prono enregistré !");
  };

  // ---------- SAVE WINNER ----------
  const saveWinner = async () => {
    if (!userId || !season?.id || !selectedLeagueId || !winnerPickId) return;

    if (isWinnerLocked) {
      alert("⛔ Pari Grand Gagnant fermé.");
      return;
    }

    setSavingWinner(true);

    const { error } = await supabase.from("winner_predictions").upsert(
      {
        season_id: season.id,
        league_id: selectedLeagueId,
        user_id: userId,
        winner_candidate_id: winnerPickId,
      },
      { onConflict: "season_id,league_id,user_id" }
    );

    setSavingWinner(false);

    if (error) return alert("Erreur : " + error.message);

    setMyWinnerSaved(winnerPickId);
    alert("✅ Pari Grand Gagnant enregistré !");
  };

  // ---------- RECAP (after lock) ----------
  const loadResultsAndRecap = async () => {
    if (!selectedLeagueId || !selectedEpisodeId) return;

    setLoadingRecap(true);
    setLeaguePreds([]);
    setEpisodeEliminatedId(null);
    setQualifiedSet(new Set());

    // 1) Résultat : éliminé réel
    const { data: epRow, error: epErr } = await supabase
      .from("episodes")
      .select("eliminated_candidate_id")
      .eq("id", selectedEpisodeId)
      .single();

    if (epErr) {
      alert("Erreur episode result: " + epErr.message);
      setLoadingRecap(false);
      return;
    }

    setEpisodeEliminatedId((epRow as any).eliminated_candidate_id ?? null);

    // 2) Résultat : qualifiés réels
    const { data: qRows, error: qErr } = await supabase
      .from("episode_qualified")
      .select("candidate_id")
      .eq("episode_id", selectedEpisodeId);

    if (qErr) {
      alert("Erreur qualifiés: " + qErr.message);
      setLoadingRecap(false);
      return;
    }

    const qSet = new Set((qRows ?? []).map((r: any) => String(r.candidate_id)));
    setQualifiedSet(qSet);

    // 3) Pronos ligue (RLS: uniquement après lock)
    const { data: preds, error: predsErr } = await supabase
      .from("predictions")
      .select("user_id, pred_qualified_candidate_id, pred_eliminated_candidate_id")
      .eq("league_id", selectedLeagueId)
      .eq("episode_id", selectedEpisodeId);

    if (predsErr) {
      setLeaguePreds([]);
      setLoadingRecap(false);
      return;
    }

    const elimReal = (epRow as any).eliminated_candidate_id as string | null;

    const rows = (preds ?? []).map((r: any) => {
      const uid = String(r.user_id);
      const pq = r.pred_qualified_candidate_id as string | null;
      const pe = r.pred_eliminated_candidate_id as string | null;

      const pts = scoreEpisode(pq, pe, elimReal, qSet);
      return { who: displayName(uid), q: pq, e: pe, pts };
    });

    setLeaguePreds(rows);
    setLoadingRecap(false);
  };

  useEffect(() => {
    if (tab !== "recap") return;
    if (!isEpisodeLocked) {
      setLeaguePreds([]);
      return;
    }
    loadResultsAndRecap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isEpisodeLocked, selectedLeagueId, selectedEpisodeId]);

  // ---------- RANKING (classement cumulé) ----------
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

    // 2) qualifiés réels de tous ces épisodes
    const { data: qRows, error: qErr } = await supabase
      .from("episode_qualified")
      .select("episode_id,candidate_id")
      .in("episode_id", episodeIds);

    if (qErr) {
      alert("Erreur qualifiés (classement): " + qErr.message);
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

    // 3) predictions de la ligue sur ces épisodes
    const { data: preds, error: pErr } = await supabase
      .from("predictions")
      .select("user_id, episode_id, pred_qualified_candidate_id, pred_eliminated_candidate_id")
      .eq("league_id", selectedLeagueId)
      .in("episode_id", episodeIds);

    if (pErr) {
      alert("Erreur predictions (classement): " + pErr.message);
      setLoadingRanking(false);
      return;
    }

    // 4) calc cumul
    const elimMap = new Map<string, string | null>();
    for (const e of lockedEpisodes) elimMap.set(String(e.id), (e as any).eliminated_candidate_id ?? null);

    const totals = new Map<string, number>();

    for (const r of preds ?? []) {
      const uid = String((r as any).user_id);
      const eid = String((r as any).episode_id);
      const pq = (r as any).pred_qualified_candidate_id as string | null;
      const pe = (r as any).pred_eliminated_candidate_id as string | null;

      const elimReal = elimMap.get(eid) ?? null;
      const qSet = qMap.get(eid) ?? new Set<string>();

      const pts = scoreEpisode(pq, pe, elimReal, qSet);
      totals.set(uid, (totals.get(uid) ?? 0) + pts);
    }

    const rows = Array.from(totals.entries()).map(([uid, pts]) => ({
      user_id: uid,
      who: displayName(uid),
      pts,
    }));

    rows.sort((a, b) => b.pts - a.pts);
    setRankingRows(rows);
    setLoadingRanking(false);
  };

useEffect(() => {
  // On recharge le classement quand on ouvre l’onglet "ranking"
  // ou quand la ligue / saison change.
  if (tab !== "ranking") return;
  loadRanking();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab, selectedLeagueId, season?.id]);

// Petite variable pratique pour afficher "Salut Paul" (sinon email)
const helloName = (myUsername && myUsername.trim()) ? myUsername.trim() : (email ?? "");

// ---------- LOGOUT ----------
const logout = async () => {
  await supabase.auth.signOut();
  window.location.href = "/login";
};

if (loading) return <p style={{ padding: 40 }}>Chargement...</p>;

// ---------- SCREENS ----------
const ScreenHome = () => (
  <div>
    <h1 style={{ marginBottom: 6 }}>{title}</h1>

    {/* Message de bienvenue */}
    <p style={{ marginTop: 0, fontSize: 18 }}>
      Salut <b>{helloName || "👋"}</b>
    </p>

    {/* Info de connexion */}
    <p style={{ marginTop: 6, opacity: 0.8 }}>Connecté : {email}</p>

    <div style={card()}>
      <b>Mon pseudo</b>
      <input
        value={myUsername}
        onChange={(e) => setMyUsername(e.target.value)}
        placeholder="Ex: Paul"
        style={input()}
      />
      <button onClick={saveMyProfile} disabled={savingUsername} style={btn()}>
        {savingUsername ? "Enregistrement..." : "Enregistrer mon pseudo"}
      </button>
    </div>

    <div style={card()}>
        <b>Raccourcis</b>
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("leagues")} style={btn()}>
            Ligues
          </button>
          <button onClick={() => setTab("prono")} style={btn()}>
            Prono
          </button>
          <button onClick={() => setTab("ranking")} style={btn()}>
            Classement
          </button>
          <button onClick={() => setTab("recap")} style={btn()}>
            Récap
          </button>
          <button onClick={() => setTab("winner")} style={btn()}>
            Gagnant
          </button>
          <a href="/admin" style={{ ...btn(), textDecoration: "none", display: "inline-block" }}>
            Admin
          </a>
        </div>
      </div>

      <button onClick={logout} style={{ ...btn(), marginTop: 14 }}>
        Se déconnecter
      </button>
    </div>
  );

  const ScreenLeagues = () => (
    <div>
      <h1>Ligues</h1>

      <div style={card()}>
        <b>Créer une ligue privée</b>
        <input
          value={leagueName}
          onChange={(e) => setLeagueName(e.target.value)}
          placeholder="Nom de la ligue"
          style={input()}
        />
        <button onClick={createLeague} disabled={creatingLeague} style={btn()}>
          {creatingLeague ? "Création..." : "Créer"}
        </button>
        {createdCode && (
          <p style={{ marginTop: 10 }}>
            ✅ Code : <b>{createdCode}</b>
          </p>
        )}
      </div>

      <div style={card()}>
        <b>Rejoindre une ligue</b>
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="Code (ex: D5Y4VF)"
          style={{ ...input(), textTransform: "uppercase" }}
        />
        <button onClick={joinLeague} disabled={joiningLeague} style={btn()}>
          {joiningLeague ? "Connexion..." : "Rejoindre"}
        </button>
      </div>

      <div style={card()}>
        <b>Ma ligue sélectionnée</b>
        <select value={selectedLeagueId} onChange={(e) => setSelectedLeagueId(e.target.value)} style={input()}>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.join_code})
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const ScreenProno = () => (
    <div>
      <h1>Prono</h1>

      <div style={card()}>
        <b>Choix ligue / épisode</b>

        <label style={{ display: "block", marginTop: 10 }}>Ligue</label>
        <select value={selectedLeagueId} onChange={(e) => setSelectedLeagueId(e.target.value)} style={input()}>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.join_code})
            </option>
          ))}
        </select>

        <label style={{ display: "block", marginTop: 10 }}>Épisode</label>
        <select value={selectedEpisodeId} onChange={(e) => setSelectedEpisodeId(e.target.value)} style={input()}>
          {episodes.map((ep) => (
            <option key={ep.id} value={ep.id}>
              Episode {ep.number} — lock: {ep.lock_at ?? "-"}
            </option>
          ))}
        </select>

        <p style={{ marginTop: 10 }}>Statut : {isEpisodeLocked ? "⛔ Fermé" : "✅ Ouvert"}</p>
      </div>

      <div style={card()}>
        <b>Choisis 1 qualifié + 1 éliminé</b>

        <label style={{ display: "block", marginTop: 10 }}>Mon qualifié</label>
        <select
          value={predQualifiedId}
          onChange={(e) => setPredQualifiedId(e.target.value)}
          style={input()}
          disabled={isEpisodeLocked}
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label style={{ display: "block", marginTop: 10 }}>Mon éliminé</label>
        <select
          value={predEliminatedId}
          onChange={(e) => setPredEliminatedId(e.target.value)}
          style={input()}
          disabled={isEpisodeLocked}
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button onClick={savePrediction} disabled={savingProno || isEpisodeLocked} style={{ ...btn(), marginTop: 10 }}>
          {savingProno ? "Enregistrement..." : "Valider mon prono"}
        </button>

        <p style={{ marginTop: 10, fontSize: 14, opacity: 0.85 }}>
          Points : qualifié {PTS.qualified_ok}/{PTS.qualified_bad} — éliminé {PTS.eliminated_ok}/{PTS.eliminated_bad}
        </p>
      </div>
    </div>
  );

  const ScreenRecap = () => (
    <div>
      <h1>Récap ligue</h1>

      <div style={card()}>
        <b>Contexte</b>

        <label style={{ display: "block", marginTop: 10 }}>Ligue</label>
        <select value={selectedLeagueId} onChange={(e) => setSelectedLeagueId(e.target.value)} style={input()}>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.join_code})
            </option>
          ))}
        </select>

        <label style={{ display: "block", marginTop: 10 }}>Épisode</label>
        <select value={selectedEpisodeId} onChange={(e) => setSelectedEpisodeId(e.target.value)} style={input()}>
          {episodes.map((ep) => (
            <option key={ep.id} value={ep.id}>
              Episode {ep.number} — lock: {ep.lock_at ?? "-"}
            </option>
          ))}
        </select>

        <p style={{ marginTop: 10 }}>
          Statut : {isEpisodeLocked ? "⛔ Fermé (récap visible)" : "⏳ Ouvert (récap caché)"}
        </p>

        {isEpisodeLocked && (
          <button onClick={loadResultsAndRecap} style={btn()}>
            Rafraîchir
          </button>
        )}
      </div>

      <div style={card()}>
        <b>Résultats (admin)</b>
        <p style={{ marginTop: 10 }}>
          Éliminé réel : <b>{episodeEliminatedId ? candidateNameById.get(episodeEliminatedId) ?? "—" : "—"}</b>
        </p>
        <p style={{ marginTop: 10 }}>
          Qualifiés réels : <b>{qualifiedSet.size}</b>
        </p>
      </div>

      <div style={card()}>
        <b>Pronos + points</b>

        {!isEpisodeLocked ? (
          <p style={{ marginTop: 10 }}>Disponible après le lock.</p>
        ) : loadingRecap ? (
          <p style={{ marginTop: 10 }}>Chargement...</p>
        ) : leaguePreds.length === 0 ? (
          <p style={{ marginTop: 10 }}>Aucun prono à afficher (ou résultats non saisis / RLS).</p>
        ) : (
          <ul style={{ marginTop: 10 }}>
            {leaguePreds
              .slice()
              .sort((a, b) => b.pts - a.pts)
              .map((p, idx) => (
                <li key={idx} style={{ marginBottom: 8 }}>
                  <b>{p.who}</b> — qualifié: {p.q ? (candidateNameById.get(p.q) ?? "—") : "—"} — éliminé:{" "}
                  {p.e ? (candidateNameById.get(p.e) ?? "—") : "—"} — <b>{p.pts} pts</b>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );

  const ScreenWinner = () => (
    <div>
      <h1>Le Grand Gagnant</h1>

      <div style={card()}>
        <b>Choisis le gagnant final (1 seul)</b>
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          Verrouillage : <b>{winnerLockAt ?? "—"}</b> — Statut : {isWinnerLocked ? "⛔ Fermé" : "✅ Ouvert"}
        </p>

        <label style={{ display: "block", marginTop: 10 }}>Ligue</label>
        <select value={selectedLeagueId} onChange={(e) => setSelectedLeagueId(e.target.value)} style={input()}>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.join_code})
            </option>
          ))}
        </select>

        <label style={{ display: "block", marginTop: 10 }}>Mon choix</label>
        <select
          value={winnerPickId}
          onChange={(e) => setWinnerPickId(e.target.value)}
          style={input()}
          disabled={isWinnerLocked}
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button onClick={saveWinner} disabled={savingWinner || isWinnerLocked} style={{ ...btn(), marginTop: 10 }}>
          {savingWinner ? "Enregistrement..." : "Valider mon pari"}
        </button>

        {myWinnerSaved && (
          <p style={{ marginTop: 10 }}>
            ✅ Pari enregistré : <b>{candidateNameById.get(myWinnerSaved) ?? "—"}</b>
          </p>
        )}
      </div>
    </div>
  );

  const ScreenRanking = () => (
    <div>
      <h1>Classement</h1>

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
    </div>
  );

  return (
    <main style={{ padding: 18, maxWidth: 560, margin: "0 auto", paddingBottom: 90 }}>
      {tab === "home" && <ScreenHome />}
      {tab === "leagues" && <ScreenLeagues />}
      {tab === "prono" && <ScreenProno />}
      {tab === "ranking" && <ScreenRanking />}
      {tab === "recap" && <ScreenRecap />}
      {tab === "winner" && <ScreenWinner />}

      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          borderTop: "1px solid #ddd",
          background: "white",
          padding: 10,
          display: "flex",
          justifyContent: "space-around",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <button onClick={() => setTab("home")} style={tabBtn(tab === "home")}>
          Accueil
        </button>
        <button onClick={() => setTab("leagues")} style={tabBtn(tab === "leagues")}>
          Ligues
        </button>
        <button onClick={() => setTab("prono")} style={tabBtn(tab === "prono")}>
          Prono
        </button>
        <button onClick={() => setTab("ranking")} style={tabBtn(tab === "ranking")}>
          Classement
        </button>
        <button onClick={() => setTab("recap")} style={tabBtn(tab === "recap")}>
          Récap
        </button>
        <button onClick={() => setTab("winner")} style={tabBtn(tab === "winner")}>
          Gagnant
        </button>
      </nav>
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
function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: active ? "#eee" : "white",
    cursor: "pointer",
    minWidth: 90,
  };
}
