import { NextResponse } from "next/server";

const APK_ENV = "NEXT_PUBLIC_INSTALL_APK_URL";
const DEFAULT_APK_URL =
  "https://github.com/Lambert-01/cropsmatics-/releases/download/mobile-demo-2026-10-25/cropmatics-rwanda-demo.apk";

/**
 * Keep the public install URL stable even when EAS rotates the artifact URL.
 * Vercel only redirects to the verified artifact configured for the release.
 */
export function GET() {
  // The stable verified release keeps preview deployments usable even before
  // their Vercel environment variables are copied. Production may override it
  // with NEXT_PUBLIC_INSTALL_APK_URL when a newer release is published.
  const raw = process.env.NEXT_PUBLIC_INSTALL_APK_URL?.trim() || DEFAULT_APK_URL;

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json(
      { error: `${APK_ENV} must be an absolute HTTP(S) URL.` },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json(
      { error: `${APK_ENV} must use HTTP or HTTPS.` },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.redirect(target, {
    status: 307,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="cropmatics-rwanda.apk"',
    },
  });
}
