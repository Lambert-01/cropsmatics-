"use client";

import { QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { useLanguage } from "@/lib/i18n";

const INSTALL_PAGE_ENV = process.env.NEXT_PUBLIC_INSTALL_PAGE_URL;
const APK_URL_ENV = process.env.NEXT_PUBLIC_INSTALL_APK_URL;
const API_BASE_ENV = process.env.NEXT_PUBLIC_API_BASE_URL;
const APK_DOWNLOAD_PATH = "/install/apk";

/**
 * Resolve the URL that the QR code should encode.
 *
 * During SSR the page is rendered on the server where `window` does not exist;
 * after hydration we prefer the actual browser origin so a phone on the same
 * Wi-Fi gets a URL it can really reach (not the server's localhost).
 */
function resolveInstallUrl(): string {
  if (INSTALL_PAGE_ENV) return INSTALL_PAGE_ENV;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/install`;
  }
  return "/install";
}

function resolveApiBase(): string | null {
  return API_BASE_ENV ?? null;
}

function publicUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function InstallPage() {
  const { t } = useLanguage();
  const installUrl = resolveInstallUrl();
  const apiBase = resolveApiBase();
  const configuredApkUrl = publicUrl(APK_URL_ENV);
  // Share one same-origin URL. The route redirects to the configured public release.
  const apkUrl = configuredApkUrl ? APK_DOWNLOAD_PATH : null;
  const isLocalApi =
    !!apiBase && /^(https?:\/\/)(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.)/.test(apiBase);

  return (
    <div className="space-y-5">
      <header className="page-hero relative isolate flex min-h-28 items-center overflow-hidden px-4 py-5 sm:px-6">
        <div className="relative z-10 max-w-[46rem]">
          <h1 className="text-2xl font-semibold text-forest-deep sm:text-[28px]">
            {t("install.title")}
          </h1>
          <p className="mt-1 text-xs text-slate-700 sm:text-sm">
            {t("install.subtitle")}
          </p>
        </div>
        <p className="relative z-10 ml-auto hidden shrink-0 text-right text-[11px] font-medium leading-relaxed text-white lg:block">
          Better Decisions<br />Greater Productivity<br />Stronger Food Systems
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col items-center px-4 py-6 text-center">
          <div className="flex items-center gap-2 self-start text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <QrCode className="h-4 w-4" aria-hidden="true" />
            {t("install.scan")}
          </div>
          <div className="mt-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-forest/10">
            <QRCodeSVG
              value={installUrl}
              size={220}
              fgColor="#1a3c2e"
              bgColor="#ffffff"
              aria-label="QR code for the Cropmatics app install page"
            />
          </div>
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-slate-600">
            {t("install.scanHint")} {installUrl}
          </p>
          <p className="mt-2 break-all text-xs font-semibold text-forest-deep">{installUrl}</p>
          <div className="mt-4 flex w-full flex-wrap justify-center gap-2">
            {apkUrl ? (
              <a
                className="btn btn-primary"
                href={apkUrl}
                download="cropmatics-rwanda.apk"
                aria-label={`${t("install.download")} (${configuredApkUrl})`}
              >
                {t("install.download")}
              </a>
            ) : null}
          </div>
          {!apkUrl ? (
            <p className="mt-3 max-w-sm text-[11px] leading-relaxed text-amber-700">
              {t("install.noLink")} Set <code>NEXT_PUBLIC_INSTALL_APK_URL</code> in Vercel.
            </p>
          ) : null}
        </section>

        <section className="card px-4 py-4">
          <h2 className="card-title">{t("install.steps")}</h2>
          <ol className="mt-3 space-y-3">
            {[t("install.step1"), t("install.step2"), t("install.step3")].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-forest/10 text-xs font-bold text-forest-deep">
                  {index + 1}
                </span>
                <span className="text-sm leading-relaxed text-slate-700">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-forest/5 pt-3 text-[11px] leading-relaxed text-slate-500">
            {configuredApkUrl ? t("install.releaseHint") : t("install.noApk")}
          </p>
        </section>
      </div>

      <section className="card px-4 py-4">
        <h2 className="card-title">{t("install.apiTitle")}</h2>
        <p className="mt-2 text-sm text-slate-700">
          <span className="font-semibold">{t("install.api")}:</span>{" "}
          <span className="break-all font-mono text-xs">{apiBase ?? "not configured"}</span>
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          {isLocalApi
            ? t("install.localApi")
            : t("install.publicApi")}
        </p>
      </section>
    </div>
  );
}
