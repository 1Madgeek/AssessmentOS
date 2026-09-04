"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoAnswer, VideoConfig } from "./index.js";

export function VideoBuilder({
  value,
  onChange,
}: {
  value: VideoConfig;
  onChange: (config: VideoConfig) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label>
        Max duration (seconds)
        <input
          type="number"
          min={5}
          max={600}
          value={value.maxDurationSeconds}
          onChange={(e) =>
            onChange({
              ...value,
              maxDurationSeconds: Number(e.target.value) || 120,
            })
          }
          style={{ width: "100%", padding: 8 }}
        />
      </label>
      <label>
        Max upload size (MB)
        <input
          type="number"
          min={1}
          max={200}
          value={Math.round(value.maxBytes / (1024 * 1024))}
          onChange={(e) =>
            onChange({
              ...value,
              maxBytes: Math.max(1, Number(e.target.value) || 50) * 1024 * 1024,
            })
          }
          style={{ width: "100%", padding: 8 }}
        />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={value.allowUpload}
          onChange={(e) =>
            onChange({ ...value, allowUpload: e.target.checked })
          }
        />
        Allow file upload (in addition to webcam recording)
      </label>
      <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
        Video answers are stored for recruiter review (auto score 0).
      </p>
    </div>
  );
}

export type VideoUploadResult = {
  assetId: string;
  contentType: string;
  filename: string;
  byteSize: number;
};

export function VideoRenderer({
  config,
  answer,
  readOnly,
  onChange,
  onUpload,
  resolveAssetUrl,
}: {
  config: VideoConfig;
  answer: VideoAnswer | null;
  readOnly?: boolean;
  onChange: (answer: VideoAnswer) => void;
  onUpload?: (file: Blob, filename: string) => Promise<VideoUploadResult>;
  resolveAssetUrl?: (assetId: string) => string;
}) {
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLive, setCameraLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingDurationMs, setPendingDurationMs] = useState<
    number | undefined
  >();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function stopStream() {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    setCameraLive(false);
  }

  function clearTimers() {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    durationTimerRef.current = null;
    maxTimerRef.current = null;
  }

  function discardPending() {
    setPendingUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingBlob(null);
    setPendingDurationMs(undefined);
  }

  useEffect(() => {
    return () => {
      clearTimers();
      stopStream();
      setPendingUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureCamera() {
    if (mediaStreamRef.current) return mediaStreamRef.current;
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      mediaStreamRef.current = stream;
      setCameraLive(true);
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play().catch(() => undefined);
      }
      return stream;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not access camera/microphone";
      setCameraError(msg);
      throw err;
    }
  }

  function pickMimeType(): string | undefined {
    const candidates = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const type of candidates) {
      if (
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(type)
      ) {
        return type;
      }
    }
    return undefined;
  }

  async function startRecording() {
    if (readOnly || !onUpload) return;
    discardPending();
    setStatus(null);
    const stream = await ensureCamera();
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      clearTimers();
      setRecording(false);
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const durationMs =
        startedAtRef.current != null
          ? Math.max(0, Date.now() - startedAtRef.current)
          : undefined;
      startedAtRef.current = null;
      stopStream();
      if (blob.size <= 0) {
        setStatus("Recording was empty — try again.");
        return;
      }
      if (blob.size > config.maxBytes) {
        setStatus(
          `Recording is too large (max ${Math.round(config.maxBytes / (1024 * 1024))} MB).`,
        );
        return;
      }
      setPendingBlob(blob);
      setPendingUrl(URL.createObjectURL(blob));
      setPendingDurationMs(durationMs);
    };
    recorder.start(250);
    startedAtRef.current = Date.now();
    setElapsedSec(0);
    setRecording(true);
    durationTimerRef.current = setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 250);
    maxTimerRef.current = setTimeout(() => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    }, config.maxDurationSeconds * 1000);
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  async function usePendingRecording() {
    if (!pendingBlob || !onUpload || readOnly) return;
    setBusy(true);
    setStatus(null);
    try {
      const ext = pendingBlob.type.includes("mp4") ? "mp4" : "webm";
      const uploaded = await onUpload(pendingBlob, `recording.${ext}`);
      onChange({
        assetId: uploaded.assetId,
        contentType: uploaded.contentType,
        filename: uploaded.filename,
        byteSize: uploaded.byteSize,
        durationMs: pendingDurationMs,
      });
      discardPending();
      setStatus("Recording saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFilePicked(file: File | null) {
    if (!file || !onUpload || readOnly) return;
    setStatus(null);
    if (
      !file.type.startsWith("video/") &&
      file.type !== "application/octet-stream"
    ) {
      setStatus("Please choose a video file.");
      return;
    }
    if (file.size > config.maxBytes) {
      setStatus(
        `File is too large (max ${Math.round(config.maxBytes / (1024 * 1024))} MB).`,
      );
      return;
    }
    setBusy(true);
    try {
      discardPending();
      stopRecording();
      stopStream();
      const uploaded = await onUpload(file, file.name || "upload.mp4");
      onChange({
        assetId: uploaded.assetId,
        contentType: uploaded.contentType || file.type || "video/mp4",
        filename: uploaded.filename,
        byteSize: uploaded.byteSize,
      });
      setStatus("Video uploaded.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const savedUrl =
    answer?.assetId && resolveAssetUrl
      ? resolveAssetUrl(answer.assetId)
      : null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!readOnly ? (
        <div style={{ display: "grid", gap: 8 }}>
          <video
            ref={liveVideoRef}
            muted
            playsInline
            autoPlay
            style={{
              width: "100%",
              maxHeight: 320,
              background: "#0d1117",
              borderRadius: 8,
              display: recording || cameraLive ? "block" : "none",
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {!recording ? (
              <button
                type="button"
                disabled={busy || !onUpload}
                onClick={() => void startRecording()}
              >
                Start recording
              </button>
            ) : (
              <button type="button" onClick={stopRecording}>
                Stop ({elapsedSec}s / {config.maxDurationSeconds}s)
              </button>
            )}
            {pendingBlob ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void usePendingRecording()}
                >
                  Use recording
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    discardPending();
                    setStatus(null);
                  }}
                >
                  Retake
                </button>
              </>
            ) : null}
            {answer?.assetId && !pendingBlob ? (
              <button
                type="button"
                disabled={busy || recording}
                onClick={() => {
                  discardPending();
                  setStatus("Record or upload a replacement.");
                }}
              >
                Replace recording
              </button>
            ) : null}
          </div>
          {config.allowUpload ? (
            <label style={{ fontSize: 13 }}>
              Or upload a video file{" "}
              <input
                type="file"
                accept="video/*,.mp4,.webm,.mov"
                disabled={busy || recording || !onUpload}
                onChange={(e) =>
                  void onFilePicked(e.target.files?.[0] ?? null)
                }
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {pendingUrl ? (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 13, color: "#656d76" }}>
            Preview (not saved yet)
          </div>
          <video
            src={pendingUrl}
            controls
            playsInline
            style={{ width: "100%", maxHeight: 360, borderRadius: 8 }}
          />
        </div>
      ) : null}

      {savedUrl && !pendingUrl ? (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 13, color: "#656d76" }}>Saved response</div>
          <video
            src={savedUrl}
            controls
            playsInline
            style={{ width: "100%", maxHeight: 360, borderRadius: 8 }}
          />
        </div>
      ) : null}

      {!savedUrl && !pendingUrl && readOnly ? (
        <p style={{ margin: 0, color: "#656d76" }}>No recording submitted.</p>
      ) : null}

      {cameraError ? (
        <p style={{ margin: 0, color: "#cf222e", fontSize: 13 }}>
          {cameraError}
        </p>
      ) : null}
      {status ? (
        <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>{status}</p>
      ) : null}
    </div>
  );
}

export function VideoReviewer({
  answer,
  score,
  maxScore,
  gradeDetails,
  resolveAssetUrl,
}: {
  config: VideoConfig;
  answer: VideoAnswer | null;
  score: number | null;
  maxScore: number;
  gradeDetails?: Record<string, unknown> | null;
  resolveAssetUrl?: (assetId: string) => string;
}) {
  const url =
    answer?.assetId && resolveAssetUrl
      ? resolveAssetUrl(answer.assetId)
      : null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p>
        Score: {score ?? 0} / {maxScore}
        {gradeDetails?.needsReview ? " · needs review" : ""}
      </p>
      {url ? (
        <video
          src={url}
          controls
          playsInline
          style={{ width: "100%", maxHeight: 420, borderRadius: 8 }}
        />
      ) : (
        <p style={{ margin: 0, color: "#656d76" }}>No recording.</p>
      )}
      {answer?.filename || answer?.contentType ? (
        <p style={{ margin: 0, fontSize: 12, color: "#656d76" }}>
          {[
            answer.filename,
            answer.contentType,
            answer.byteSize != null ? `${answer.byteSize} bytes` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

export { videoPlugin, validateVideoConfig, gradeVideo } from "./index.js";
export type { VideoConfig, VideoAnswer } from "./index.js";
