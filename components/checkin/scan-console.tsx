"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  QrCode,
  ScanLine,
  ShieldCheck,
  Smartphone,
  TimerReset
} from "lucide-react";
import type { EventAnalyticsSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RecentScanRow {
  id: string;
  result: string;
  gate_name: string | null;
  scanned_at: string;
  registration: {
    full_name?: string;
    email_raw?: string;
  } | null;
}

function applySummaryUpdate(summary: EventAnalyticsSummary, result: string): EventAnalyticsSummary {
  const next = {
    ...summary,
    totalScans: summary.totalScans + 1
  };

  if (result === "success") {
    return {
      ...next,
      totalCheckedIn: summary.totalCheckedIn + 1,
      remaining: Math.max(summary.remaining - 1, 0)
    };
  }

  if (result === "already_checked_in") {
    return {
      ...next,
      duplicateScans: summary.duplicateScans + 1
    };
  }

  return {
    ...next,
    invalidScans: summary.invalidScans + 1
  };
}

function formatResultLabel(value: string | null | undefined) {
  if (!value) {
    return "Awaiting scan";
  }

  return value.replaceAll("_", " ");
}

function formatScanTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function getResultPresentation(result: string | null | undefined) {
  if (result === "success") {
    return {
      Icon: CheckCircle2,
      panelClassName: "border-emerald-200 bg-emerald-50 text-emerald-950",
      badgeClassName: "border-emerald-200 bg-emerald-100 text-emerald-800",
      iconClassName: "text-emerald-700"
    };
  }

  if (result === "already_checked_in") {
    return {
      Icon: TimerReset,
      panelClassName: "border-amber-200 bg-amber-50 text-amber-950",
      badgeClassName: "border-amber-200 bg-amber-100 text-amber-800",
      iconClassName: "text-amber-700"
    };
  }

  if (result) {
    return {
      Icon: AlertTriangle,
      panelClassName: "border-rose-200 bg-rose-50 text-rose-950",
      badgeClassName: "border-rose-200 bg-rose-100 text-rose-800",
      iconClassName: "text-rose-700"
    };
  }

  return {
    Icon: ScanLine,
    panelClassName: "border-slate/10 bg-[#f7fafc] text-ink",
    badgeClassName: "border-slate/15 bg-white text-slate",
    iconClassName: "text-[#2f7b76]"
  };
}

export function ScanConsole({
  eventId,
  initialRecentScans,
  initialSummary
}: {
  eventId: string;
  initialRecentScans: RecentScanRow[];
  initialSummary: EventAnalyticsSummary;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const useNativeDetectorRef = useRef(false);
  const detectorRef = useRef<{ detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> } | null>(null);
  const lastCameraTokenRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const [token, setToken] = useState("");
  const [gateName, setGateName] = useState("Main gate");
  const [deviceId, setDeviceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "active" | "unsupported" | "error">("idle");
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState(initialSummary);
  const [recentScans, setRecentScans] = useState(initialRecentScans);
  const [result, setResult] = useState<{
    result: string;
    message: string;
    full_name?: string | null;
  } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    detectorRef.current = null;
    useNativeDetectorRef.current = false;
    setCameraState("idle");
    setCameraMessage(null);
  }, []);

  function scanFrameWithJsQR(video: HTMLVideoElement): string | null {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (canvas.width === 0 || canvas.height === 0) {
      return null;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (!ctx) {
      return null;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    return result?.data?.trim() || null;
  }

  async function scanFromCamera() {
    if (!videoRef.current) {
      return;
    }

    try {
      let rawValue: string | null = null;

      if (useNativeDetectorRef.current && detectorRef.current) {
        const detections = await detectorRef.current.detect(videoRef.current);
        rawValue = detections[0]?.rawValue?.trim() || null;
      } else {
        rawValue = scanFrameWithJsQR(videoRef.current);
      }

      if (rawValue) {
        const now = Date.now();
        const last = lastCameraTokenRef.current;

        if (last.value !== rawValue || now - last.at > 1500) {
          lastCameraTokenRef.current = { value: rawValue, at: now };
          void submitToken(rawValue);
        }
      }
    } catch {
      // Keep the camera loop alive even if one frame fails.
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      void scanFromCamera();
    });
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("unsupported");
      setCameraMessage("Camera access is not available in this browser. Make sure you're using HTTPS.");
      return;
    }

    try {
      setCameraState("starting");
      setCameraMessage(null);

      const BarcodeDetectorCtor =
        typeof window !== "undefined"
          ? (window as Window & {
              BarcodeDetector?: new (options?: { formats?: string[] }) => {
                detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
              };
            }).BarcodeDetector
          : undefined;

      if (BarcodeDetectorCtor) {
        detectorRef.current = new BarcodeDetectorCtor({ formats: ["qr_code"] });
        useNativeDetectorRef.current = true;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" }
        },
        audio: false
      });

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraState("active");
      void scanFromCamera();
    } catch (error) {
      stopCamera();
      setCameraState("error");
      setCameraMessage(error instanceof Error ? error.message : "Unable to start the camera.");
    }
  }

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  async function submitToken(nextToken: string) {
    const normalized = nextToken.replace(/[\r\n]+/g, "").trim();

    if (!normalized || busy) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/checkin/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          eventId,
          token: normalized,
          gateName,
          deviceId
        })
      });

      const data = (await response.json().catch(() => null)) as
        | {
            result?: string;
            message?: string;
            fullName?: string | null;
            recentScan?: RecentScanRow;
          }
        | null;

      if (!response.ok) {
        setResult({
          result: "invalid_token",
          message: data?.message ?? "Unable to process scan.",
          full_name: data?.fullName ?? null
        });
        return;
      }

      const nextResult = data?.result ?? "invalid_token";
      setResult({
        result: nextResult,
        message: data?.message ?? "Unable to process scan.",
        full_name: data?.fullName ?? null
      });
      setSummary((current) => applySummaryUpdate(current, nextResult));

      if (data?.recentScan) {
        const nextScan = data.recentScan;
        setRecentScans((current) => [nextScan, ...current].slice(0, 10));
      }
    } catch (error) {
      setResult({
        result: "invalid_token",
        message: error instanceof Error ? error.message : "Unable to reach the check-in service.",
        full_name: null
      });
    } finally {
      setBusy(false);
      setToken("");
      inputRef.current?.focus();
    }
  }

  const progressPercent =
    summary.totalRegistered > 0
      ? Math.min((summary.totalCheckedIn / summary.totalRegistered) * 100, 100)
      : 0;
  const qualityPercent =
    summary.totalScans > 0
      ? Math.max(0, 100 - Math.round(((summary.duplicateScans + summary.invalidScans) / summary.totalScans) * 100))
      : 100;
  const resultPresentation = getResultPresentation(result?.result);
  const lastScan = recentScans[0] ?? null;
  const openQueue = Math.max(summary.totalRegistered - summary.totalCheckedIn, 0);

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_330px]">
      <section className="card-panel overflow-hidden">
        <div className="border-b border-slate/10 bg-[#f7faf8] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="section-title">Scanner desk</p>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-ink">Live check-in console</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Scanner armed
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                  cameraState === "active"
                    ? "border-sky-200 bg-sky-100 text-sky-800"
                    : "border-slate/15 bg-white text-slate"
                )}
              >
                <Camera className="h-3.5 w-3.5" />
                {cameraState === "active" ? "Camera live" : "Camera standby"}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-slate/10 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Open queue</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{openQueue}</p>
            </div>
            <div className="rounded-2xl border border-slate/10 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Checked in</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{summary.totalCheckedIn}</p>
            </div>
            <div className="rounded-2xl border border-slate/10 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Scan quality</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{qualityPercent}%</p>
            </div>
            <div className="rounded-2xl border border-slate/10 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Duplicate scans</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{summary.duplicateScans}</p>
            </div>
            <div className="rounded-2xl border border-slate/10 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Invalid attempts</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{summary.invalidScans}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 sm:px-6 sm:py-5">
          <div
            className={cn(
              "rounded-2xl border px-4 py-3.5 transition sm:px-5 sm:py-4",
              resultPresentation.panelClassName
            )}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-white/70 p-2.5">
                  <resultPresentation.Icon className={cn("h-6 w-6", resultPresentation.iconClassName)} />
                </div>
                <div className="min-w-0">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                      resultPresentation.badgeClassName
                    )}
                  >
                    {formatResultLabel(result?.result)}
                  </span>
                  <p className="mt-2.5 text-xl font-semibold tracking-tight text-current">
                    {result?.full_name ?? "Ready for the next attendee"}
                  </p>
                  <p className="mt-1.5 max-w-2xl text-sm text-current/75">
                    {result?.message ??
                      "Scan a QR code, paste a token, or submit from a handheld scanner to keep the line moving."}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/60 px-3.5 py-2.5 text-sm text-current/80">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-current/70">Live progress</p>
                <p className="mt-1.5 text-lg font-semibold tracking-tight text-current">
                  {summary.totalCheckedIn} / {summary.totalRegistered}
                </p>
              </div>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-[#13202a] transition-[width]"
                style={{ width: `${Math.max(progressPercent, summary.totalCheckedIn > 0 ? 8 : 0)}%` }}
              />
            </div>
          </div>

          <div className="mt-3">
            <section className="rounded-2xl border border-slate/10 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate/10 px-4 py-3.5 sm:px-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Camera scan</p>
                </div>
                <button
                  type="button"
                  className={cn(
                    "rounded-2xl border px-3 py-2 text-xs font-semibold transition",
                    cameraState === "active"
                      ? "border-slate/15 bg-white text-ink hover:border-slate/30 hover:bg-slate-50"
                      : "border-ink bg-ink text-white hover:bg-ink/92"
                  )}
                  onClick={async () => {
                    if (cameraState === "active" || cameraState === "starting") {
                      stopCamera();
                      return;
                    }

                    await startCamera();
                  }}
                >
                  {cameraState === "active" ? "Stop camera" : cameraState === "starting" ? "Starting..." : "Use camera"}
                </button>
              </div>

              <div className="p-4 pt-3.5 sm:p-5 sm:pt-4">
                <div className="mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl bg-[#0f172a]">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    autoPlay
                    className="h-full w-full object-cover"
                  />
                </div>
                {cameraMessage ? (
                  <p className="mt-2 text-sm text-slate">{cameraMessage}</p>
                ) : null}
              </div>
            </section>
          </div>

          <div className="mt-3 rounded-2xl border border-slate/10 bg-white">
            <div className="border-b border-slate/10 px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Token input</p>
                </div>
                <div className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                  <QrCode className="h-4 w-4 text-[#2f7b76]" />
                  Keyboard wedge ready
                </div>
              </div>
            </div>

            <div className="px-5 py-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-ink">Scan token or QR payload</span>
                <input
                  ref={inputRef}
                  value={token}
                  className="h-14 w-full rounded-2xl border border-slate/15 bg-[#f7fafc] px-5 text-lg font-semibold tracking-[0.04em] text-ink outline-none transition placeholder:text-slate/60 focus:border-[#2f7b76]/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(47,123,118,0.08)]"
                  placeholder="Scanner input is armed"
                  onChange={async (eventObject) => {
                    const nextValue = eventObject.target.value;
                    setToken(nextValue);

                    if (/\r|\n/.test(nextValue)) {
                      await submitToken(nextValue);
                    }
                  }}
                  onKeyDown={async (eventObject) => {
                    if (eventObject.key === "Enter") {
                      eventObject.preventDefault();
                      await submitToken(token);
                    }
                  }}
                />
              </label>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-ink bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink/92 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={async () => submitToken(token)}
                >
                  {busy ? "Checking attendee..." : "Submit scan"}
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-slate/15 bg-white px-5 text-sm font-semibold text-ink transition hover:border-slate/30 hover:bg-slate-50"
                  onClick={() => {
                    setToken("");
                    setResult(null);
                    inputRef.current?.focus();
                  }}
                >
                  Clear station
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="grid content-start gap-5">
        <aside className="card-panel overflow-hidden">
          <div className="border-b border-slate/10 bg-[#fffaf2] px-5 py-4">
            <p className="section-title">Recent activity</p>
            <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-ink">Latest scan log</h3>
          </div>

          <div className="max-h-[520px] overflow-y-auto">
            {recentScans.length === 0 ? <div className="px-5 py-5 text-sm text-slate">No scan attempts yet.</div> : null}

            {recentScans.map((scan) => {
              const presentation = getResultPresentation(scan.result);
              const attendeeName = scan.registration?.full_name ?? "Unknown attendee";
              const attendeeEmail = scan.registration?.email_raw ?? null;
              const gateLabel = scan.gate_name ?? null;

              return (
                <div key={scan.id} className="border-b border-slate/10 px-5 py-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{attendeeName}</p>
                      {attendeeEmail ? <p className="mt-1 truncate text-sm text-slate">{attendeeEmail}</p> : null}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                        presentation.badgeClassName
                      )}
                    >
                      {formatResultLabel(scan.result)}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-end gap-3 text-xs text-slate">
                    {gateLabel ? <span>{gateLabel}</span> : null}
                    <span>{formatScanTime(scan.scanned_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="rounded-2xl border border-slate/10 bg-white px-4 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#2f7b76]" />
            <p className="text-sm font-semibold text-ink">Station settings</p>
          </div>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-ink">Gate name</span>
              <input
                value={gateName}
                className="w-full rounded-2xl border border-slate/15 bg-[#f7fafc] px-4 py-3 text-sm text-ink outline-none transition focus:border-[#2f7b76]/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(47,123,118,0.08)]"
                onChange={(eventObject) => setGateName(eventObject.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-ink">Device id</span>
              <input
                value={deviceId}
                className="w-full rounded-2xl border border-slate/15 bg-[#f7fafc] px-4 py-3 text-sm text-ink outline-none transition placeholder:text-slate/70 focus:border-[#2f7b76]/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(47,123,118,0.08)]"
                placeholder="Browser station"
                onChange={(eventObject) => setDeviceId(eventObject.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 rounded-2xl bg-[#f7faf8] px-4 py-4 text-sm text-slate">
            <div className="flex items-center gap-2 text-ink">
              <Smartphone className="h-4 w-4 text-[#2f7b76]" />
              <span className="font-semibold">{deviceId.trim() || "Browser station"}</span>
            </div>
            <p className="mt-2">Scans will be logged against {gateName || "this gate"}.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate/10 bg-white px-4 py-4">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-[#d27a30]" />
            <p className="text-sm font-semibold text-ink">Desk health</p>
          </div>

          <div className="mt-4 space-y-3 text-sm text-slate">
            <div className="flex items-center justify-between gap-3">
              <span>Last accepted scan</span>
              <span className="font-semibold text-ink">
                {lastScan ? formatScanTime(lastScan.scanned_at) : "Waiting"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Duplicate rate</span>
              <span className="font-semibold text-ink">
                {summary.totalScans > 0 ? `${Math.round((summary.duplicateScans / summary.totalScans) * 100)}%` : "0%"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Camera status</span>
              <span className="font-semibold text-ink">
                {cameraState === "active" ? "Running" : cameraState === "starting" ? "Starting" : "Standby"}
              </span>
            </div>
          </div>
        </div>
      </aside>

    </div>
  );
}
