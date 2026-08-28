"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssessmentRules, SessionView } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api } from "@/lib/api";
import {
  INTEGRITY_TERMS_VERSION,
  randomSnapshotDelayMs,
} from "@/lib/integrity";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { errorClass, mutedClass } from "@/lib/styles";

type Props = {
  session: SessionView;
  onReady: (session: SessionView) => void;
};

function noticeOn(rules: AssessmentRules) {
  return Boolean(rules.integrityNotice?.enabled);
}

function webcamOn(rules: AssessmentRules) {
  return Boolean(rules.proctoring?.webcamSnapshots);
}

function getSharedWebcamStream(): MediaStream | null {
  return (
    (window as unknown as { __aosWebcamStream?: MediaStream })
      .__aosWebcamStream ?? null
  );
}

function setSharedWebcamStream(stream: MediaStream | null) {
  (
    window as unknown as { __aosWebcamStream?: MediaStream | undefined }
  ).__aosWebcamStream = stream ?? undefined;
}

/** Stop tracks and clear the shared session webcam so the camera light turns off. */
export function stopWebcamStream() {
  const stream = getSharedWebcamStream();
  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
  setSharedWebcamStream(null);
}

export function IntegrityGate({ session, onReady }: Props) {
  const rules = session.assessment.rules;
  const needNotice = noticeOn(rules);
  const needWebcam = webcamOn(rules);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [webcamOk, setWebcamOk] = useState(false);
  const [webcamBlocked, setWebcamBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startCamera = useCallback(async () => {
    setError(null);
    setWebcamBlocked(false);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      setStream(media);
      setWebcamOk(true);
      setWebcamBlocked(false);
    } catch (err) {
      setWebcamOk(false);
      setStream(null);
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: string }).name)
          : "";
      let permissionState: PermissionState | "unknown" = "unknown";
      try {
        const status = await navigator.permissions.query({
          name: "camera" as PermissionName,
        });
        permissionState = status.state;
      } catch {
        // Safari / some browsers don't support camera permission queries.
      }
      // "Never" / Block: browser will not re-prompt. Always show recovery steps.
      setWebcamBlocked(true);
      setError(
        permissionState === "denied" ||
          name === "NotAllowedError" ||
          name === "PermissionDeniedError"
          ? "Camera is blocked for this site. Browsers will not show the permission popup again until you reset it in site settings, then reload."
          : "Webcam access failed. If you previously chose Never/Block, reset camera permission for this site, reload, then retry.",
      );
      void api
        .logEvent({
          type: "webcam_denied",
          meta: { stage: "gate", reason: name || "unknown", permissionState },
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!needWebcam) return;
    void startCamera();
  }, [needWebcam, startCamera]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // If the gate unmounts without handing the stream to the session, release it.
  useEffect(() => {
    return () => {
      const shared = getSharedWebcamStream();
      if (stream && stream !== shared) {
        for (const track of stream.getTracks()) track.stop();
      }
    };
  }, [stream]);

  useEffect(() => {
    const ack = session.integrityAck;
    if (!ack?.acceptedAt) return;
    if (needWebcam && !ack.webcamGranted) return;
    onReady(session);
  }, [session, needWebcam, onReady]);

  async function proceed() {
    if (needNotice && !accepted) {
      setError("You must accept the integrity terms to continue.");
      return;
    }
    if (needWebcam && !webcamOk) {
      setError("Webcam permission is required before you can start.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await api.acceptIntegrity({
        termsVersion: INTEGRITY_TERMS_VERSION,
        webcamGranted: needWebcam ? true : undefined,
      });
      if (stream) {
        setSharedWebcamStream(stream);
      }
      onReady(next);
    } catch (err) {
      setError(getErrorMessage(err, "Could not continue"));
    } finally {
      setBusy(false);
    }
  }

  const liability = rules.integrityNotice?.liabilityLanguage !== false;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Before you begin</CardTitle>
          <CardDescription>{session.assessment.title}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {needWebcam ? (
            <div className="grid gap-2 border border-border p-3">
              <p className="text-sm font-medium">
                Webcam monitoring is mandatory
              </p>
              <p className={mutedClass}>
                The interviewer requires intermittent webcam snapshots during
                this assessment.
              </p>
              <div className="overflow-hidden border border-border bg-muted">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-video w-full object-cover"
                />
              </div>
              {!webcamOk ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onPress={() => void startCamera()}
                    >
                      Allow camera &amp; retry
                    </Button>
                    {webcamBlocked ? (
                      <Button
                        variant="outline"
                        onPress={() => window.location.reload()}
                      >
                        Reload page
                      </Button>
                    ) : null}
                  </div>
                  {webcamBlocked ? (
                    <div className={`${mutedClass} grid gap-1 text-xs`}>
                      <p className="font-medium text-foreground">
                        How to re-enable the camera
                      </p>
                      <ol className="list-decimal space-y-1 pl-4">
                        <li>
                          Click the lock / tune icon left of the address bar.
                        </li>
                        <li>
                          Set <strong>Camera</strong> to <strong>Allow</strong>{" "}
                          (or clear/reset permissions for this site).
                        </li>
                        <li>
                          Click <strong>Reload page</strong>, then{" "}
                          <strong>Allow camera &amp; retry</strong>.
                        </li>
                      </ol>
                      <p>
                        Chrome: Site settings → Camera → Allow. Safari: Safari →
                        Settings for This Website → Camera → Allow.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  Camera ready
                </p>
              )}
            </div>
          ) : null}

          {needNotice ? (
            <div className="grid gap-3 text-sm">
              <p className="font-medium">Integrity &amp; legal notice</p>
              <ul className={`${mutedClass} list-disc space-y-1 pl-5`}>
                <li>
                  Assessment materials are confidential and proprietary to the
                  hiring organization.
                </li>
                {rules.integrityNotice?.forbidAiAssistance !== false ? (
                  <li>
                    AI assistants, browser agents, and computer-use agents are
                    prohibited while taking this assessment.
                  </li>
                ) : null}
                <li>
                  Feeding prompts into AI tools or automating this session is
                  unauthorized use.
                </li>
                {liability ? (
                  <li>
                    Misuse may result in disqualification and legal action,
                    including claims for misuse of confidential assessment
                    content.
                  </li>
                ) : null}
              </ul>
              <label className="flex items-start gap-2 font-normal">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>
                  I understand and agree to these terms (version{" "}
                  {INTEGRITY_TERMS_VERSION}).
                </span>
              </label>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className={errorClass}>
              {error}
            </p>
          ) : null}

          <Button
            isDisabled={
              busy ||
              (needNotice && !accepted) ||
              (needWebcam && !webcamOk)
            }
            onPress={() => void proceed()}
          >
            {busy ? "Starting…" : "Start assessment"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export function useWebcamSnapshots(opts: {
  enabled: boolean;
  proctoring: AssessmentRules["proctoring"] | undefined;
  questionId: string | null;
  paused: boolean;
}) {
  const { enabled, proctoring, questionId, paused } = opts;
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!enabled || !proctoring?.webcamSnapshots || paused) {
      stopWebcamStream();
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    let localVideo: HTMLVideoElement | null = null;
    let stream = getSharedWebcamStream();

    async function ensureStream() {
      if (stream?.active) return stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return null;
        }
        setSharedWebcamStream(stream);
        setBlocked(false);
        return stream;
      } catch {
        setBlocked(true);
        void api
          .logEvent({
            type: "webcam_denied",
            questionId: questionId ?? undefined,
            meta: { stage: "session" },
          })
          .catch(() => {});
        return null;
      }
    }

    async function capture(
      reason: "interval" | "focus_lost",
      delaySeconds: number,
    ) {
      if (paused || cancelled) return;
      const media = await ensureStream();
      if (!media || cancelled) return;
      if (!localVideo) {
        localVideo = document.createElement("video");
        localVideo.playsInline = true;
        localVideo.muted = true;
        localVideo.srcObject = media;
        await localVideo.play().catch(() => {});
      }
      const w = localVideo.videoWidth || 640;
      const h = localVideo.videoHeight || 480;
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(640, w);
      canvas.height = Math.round((canvas.width / w) * h) || 360;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7),
      );
      if (!blob || cancelled) return;
      try {
        const uploaded = await api.uploadSessionSnapshot(blob, "snapshot.jpg");
        await api.logEvent({
          type: "webcam_snapshot",
          questionId: questionId ?? undefined,
          meta: {
            assetId: uploaded.id,
            reason,
            delaySeconds,
          },
        });
      } catch {
        // ignore transient upload errors
      }
    }

    function scheduleNext() {
      if (cancelled || !proctoring) return;
      const min = proctoring.snapshotIntervalMinSeconds ?? 45;
      const max = proctoring.snapshotIntervalMaxSeconds ?? 120;
      const delayMs = randomSnapshotDelayMs(min, max);
      const delaySeconds = Math.round(delayMs / 1000);
      timer = window.setTimeout(() => {
        void capture("interval", delaySeconds).then(() => scheduleNext());
      }, delayMs);
    }

    void capture("interval", 0).then(() => scheduleNext());

    const onVis = () => {
      if (document.hidden && proctoring.snapshotOnFocusLoss) {
        const jitter = 500 + Math.random() * 2000;
        window.setTimeout(() => {
          void capture("focus_lost", Math.round(jitter / 1000));
        }, jitter);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      if (localVideo) {
        localVideo.srcObject = null;
        localVideo = null;
      }
      // Keep the shared stream alive across question changes; it is stopped
      // when enabled/paused flips off (branch above) or on explicit end.
    };
  }, [enabled, proctoring, questionId, paused]);

  return { webcamBlocked: blocked };
}
