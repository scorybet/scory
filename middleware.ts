import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(req: NextRequest) {
  const sitePass = process.env.SCORY_SITE_PASSWORD;
  if (!sitePass) return NextResponse.next(); // pas de mdp => pas de protection

  const url = req.nextUrl;

  // Pages autorisées sans mot de passe "site"
  if (
    url.pathname === "/gate" ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/auth")
  ) {
    return NextResponse.next();
  }

  // Cookie présent ?
  const cookie = req.cookies.get("scory_gate")?.value;

  if (cookie === sitePass) {
    return NextResponse.next();
  }

  // Sinon -> redirection vers /gate
  const redirectUrl = new URL("/gate", req.url);
  redirectUrl.searchParams.set("next", url.pathname);
  return NextResponse.redirect(redirectUrl);
}