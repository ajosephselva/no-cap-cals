import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isPublicPage(pathname: string) {
  return pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/auth");
}

function redirectWithCookies(request: NextRequest, from: NextResponse, path: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  from.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") redirect.headers.set(key, value);
  });
  return redirect;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api")) return response;
  if (!signedIn && !isPublicPage(pathname)) return redirectWithCookies(request, response, "/login");
  if (signedIn && pathname.startsWith("/login")) return redirectWithCookies(request, response, "/today");

  return response;
}
