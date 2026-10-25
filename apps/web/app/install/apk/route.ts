import { NextResponse } from "next/server";

const APK_ENV = "NEXT_PUBLIC_INSTALL_APK_URL";

/**
 * Keep the public install URL stable even when EAS rotates the artifact URL.
 * Vercel only redirects to the verified artifact configured for the release.
 */
export function GET() {
  const raw = process.env.NEXT_PUBLIC_INSTALL_APK_URL?.trim();
  if (!raw) {
    return NextResponse.json(
      { error: `${APK_ENV} is not configured for this deployment.` },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

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
