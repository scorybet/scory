import { Suspense } from "react";
import GateClient from "./GateClient";

export const dynamic = "force-dynamic";

export default function GatePage() {
  return (
    <Suspense fallback={<main style={{ padding: 40 }}>Chargement...</main>}>
      <GateClient />
    </Suspense>
  );
}