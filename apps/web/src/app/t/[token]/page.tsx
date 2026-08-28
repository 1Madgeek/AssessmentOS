"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { SessionView } from "@assessment-os/sdk";
import { AssessmentShell } from "@assessment-os/ui";
import {
  McqRenderer,
  type McqAnswer,
  type McqConfig,
} from "@assessment-os/question-mcq/react";
import {
  CodingRenderer,
  type CodingAnswer,
  type CodingConfig,
  type CodingWorkspace,
} from "@assessment-os/question-coding/react";
import {
  SqlRenderer,
  type SqlAnswer,
  type SqlConfig,
  type SqlWorkspace,
} from "@assessment-os/question-sql/react";
import {
  TextRenderer,
  type TextAnswer,
  type TextConfig,
} from "@assessment-os/question-text/react";
import { RichTextView } from "@assessment-os/richtext/react";
import "@assessment-os/richtext/styles.css";
import {
  TurnstileWidget,
  resetTurnstile,
  turnstileEnabled,
} from "@/components/TurnstileWidget";
import { api } from "@/lib/api";
import { inviteGateErrorMessage } from "@/lib/errors";
import { errorClass, mutedClass } from "@/lib/styles";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getErrorMessage } from "@assessment-os/sdk";
import {
  IntegrityGate,
  stopWebcamStream,
  useWebcamSnapshots,
} from "@/components/IntegrityGate";
import { withCanary } from "@/lib/integrity";
import { LegalWatermark } from "@/components/LegalWatermark";
import { ThemeToggleCorner } from "@/components/theme-toggle";

export default function CandidateGatePage() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<{
    assessment: { title: string; description: string; durationSeconds: number };
    emailBound?: boolean;
    status?: string;
    expiresAt?: string | null;
  } | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const needCaptcha = turnstileEnabled();
  const onCaptchaToken = useCallback((t: string | null) => {
    setCaptchaToken(t);
  }, []);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  useEffect(() => {
    void (async () => {
      try {
        // Resume if cookie already set
        try {
          const existing = await api.getSession();
          setSession(existing);
          setLoading(false);
          return;
        } catch {
          // no session cookie
        }
        const inv = await api.getInvite(token);
        setInvite(inv);
      } catch (err) {
        setError(inviteGateErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required");
      return;
    }
    if (Date.now() < cooldownUntil) {
      setError("Please wait before requesting another code");
      return;
    }
    if (needCaptcha && !captchaToken) {
      setError("Complete the CAPTCHA to continue");
      return;
    }
    setBusy(true);
    try {
      await api.requestInviteOtp(token, {
        candidateEmail: email.trim(),
        captchaToken: captchaToken ?? undefined,
      });
      setOtpSent(true);
      setCooldownUntil(Date.now() + 60_000);
      setCaptchaToken(null);
      resetTurnstile();
    } catch (err) {
      setError(getErrorMessage(err, "Could not send code"));
      setCaptchaToken(null);
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needCaptcha && !captchaToken) {
      setError("Complete the CAPTCHA to continue");
      return;
    }
    setBusy(true);
    try {
      setSession(
        await api.startSession(token, {
          candidateName: name.trim(),
          candidateEmail: email.trim(),
          otp: otp.trim(),
          captchaToken: captchaToken ?? undefined,
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err, "Could not start"));
      setCaptchaToken(null);
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <ThemeToggleCorner />
        <p className={mutedClass}>Loading…</p>
      </main>
    );
  }

  if (session) {
    const rules = session.assessment.rules;
    const needsGate =
      Boolean(rules.integrityNotice?.enabled) ||
      Boolean(rules.proctoring?.webcamSnapshots);
    const ackOk =
      session.integrityAck?.acceptedAt &&
      (!rules.proctoring?.webcamSnapshots ||
        session.integrityAck.webcamGranted);

    if (needsGate && !ackOk) {
      return (
        <>
          <ThemeToggleCorner />
          <IntegrityGate session={session} onReady={setSession} />
        </>
      );
    }

    return (
      <>
        <ThemeToggleCorner />
        <CandidateSession session={session} onSessionChange={setSession} />
      </>
    );
  }

  if (!invite) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <ThemeToggleCorner />
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invite unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? <p className={errorClass}>{error}</p> : null}
          </CardContent>
        </Card>
      </main>
    );
  }

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const captchaReady = !needCaptcha || Boolean(captchaToken);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <ThemeToggleCorner />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">
            {invite.assessment.title}
          </CardTitle>
          <CardDescription className="whitespace-pre-wrap">
            {invite.assessment.description}
          </CardDescription>
          <div className="pt-1">
            <Badge variant="secondary">
              {Math.round(invite.assessment.durationSeconds / 60)} minutes
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!otpSent ? (
            <form
              onSubmit={(e) => void sendCode(e)}
              className="grid gap-4"
            >
              <div className="grid gap-2">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              {invite.emailBound ? (
                <p className={mutedClass}>
                  This invite is locked to a specific email address. Enter that
                  address to receive a verification code.
                </p>
              ) : (
                <p className={mutedClass}>
                  We will email a one-time verification code to confirm you own
                  this address.
                </p>
              )}
              <TurnstileWidget key="send" onToken={onCaptchaToken} />
              {error ? <p className={errorClass}>{error}</p> : null}
              <Button type="submit" isDisabled={busy || !captchaReady}>
                Send verification code
              </Button>
            </form>
          ) : (
            <form onSubmit={(e) => void start(e)} className="grid gap-4">
              <p className={mutedClass}>
                Code sent to <strong className="text-foreground">{email}</strong>.
                Enter it below to start. The code expires in 10 minutes.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="otp">Verification code</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                />
              </div>
              <TurnstileWidget key="start" onToken={onCaptchaToken} />
              {error ? <p className={errorClass}>{error}</p> : null}
              <Button
                type="submit"
                isDisabled={busy || otp.length < 6 || !captchaReady}
              >
                Start assessment
              </Button>
              <Button
                type="button"
                variant="outline"
                isDisabled={busy || cooldownLeft > 0 || !captchaReady}
                onPress={() => void sendCode()}
              >
                {cooldownLeft > 0
                  ? `Resend code (${cooldownLeft}s)`
                  : "Resend code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                isDisabled={busy}
                onPress={() => {
                  setOtpSent(false);
                  setOtp("");
                  setError(null);
                  setCaptchaToken(null);
                  resetTurnstile();
                }}
              >
                Change email
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function CandidateSession({
  session,
  onSessionChange,
}: {
  session: SessionView;
  onSessionChange: (s: SessionView) => void;
}) {
  const [draftAnswer, setDraftAnswer] = useState<unknown>(null);
  const [draftWorkspace, setDraftWorkspace] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const current = useMemo(
    () =>
      session.attempts.find((a) => a.questionId === session.currentQuestionId) ??
      null,
    [session],
  );

  const autoOpenTried = useRef(false);

  // Auto-open the first accessible question so candidates don't land on an empty shell.
  useEffect(() => {
    if (autoOpenTried.current) return;
    if (session.currentQuestionId) return;
    if (session.status !== "in_progress" && session.status !== "not_started") {
      return;
    }
    const first = [...session.attempts]
      .sort((a, b) => a.order - b.order)
      .find(
        (a) =>
          a.status === "not_started" ||
          a.status === "in_progress" ||
          a.status === "skipped",
      );
    if (!first) return;
    autoOpenTried.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const next = await api.openQuestion(first.questionId);
        if (!cancelled) onSessionChange(next);
      } catch (err) {
        autoOpenTried.current = false;
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not open first question",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    session.currentQuestionId,
    session.status,
    session.attempts,
    onSessionChange,
  ]);

  // Activity events + integrity signals
  useEffect(() => {
    const rules = session.assessment.rules;
    const trackPasteSize = rules.integrity?.trackPasteSize !== false;
    const flagCopy = rules.integrity?.flagCopy !== false;
    const trackTyping = rules.integrity?.trackTypingStats !== false;
    const requireFs = Boolean(rules.integrity?.requireFullscreen);

    let awayStarted: number | null = null;
    let keyIntervals: number[] = [];
    let lastKeyAt: number | null = null;
    let lastAnswerLen = 0;

    const qid = () => session.currentQuestionId ?? undefined;

    const onBlur = () => {
      awayStarted = Date.now();
      void api
        .logEvent({ type: "focus_lost", questionId: qid() })
        .catch(() => {});
    };
    const onFocus = () => {
      const durationMs = awayStarted ? Date.now() - awayStarted : undefined;
      awayStarted = null;
      void api
        .logEvent({
          type: "focus_gained",
          questionId: qid(),
          meta: durationMs != null ? { durationMs } : undefined,
        })
        .catch(() => {});
    };
    const onVis = () => {
      if (document.hidden) {
        awayStarted = Date.now();
        void api
          .logEvent({ type: "tab_hidden", questionId: qid() })
          .catch(() => {});
      } else {
        const durationMs = awayStarted ? Date.now() - awayStarted : undefined;
        awayStarted = null;
        void api
          .logEvent({
            type: "tab_visible",
            questionId: qid(),
            meta: durationMs != null ? { durationMs } : undefined,
          })
          .catch(() => {});
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? "";
      void api
        .logEvent({
          type: "paste",
          questionId: qid(),
          meta: trackPasteSize
            ? { byteLength: new Blob([text]).size }
            : undefined,
        })
        .catch(() => {});
    };
    const onCopy = () => {
      if (!flagCopy) return;
      void api.logEvent({ type: "copy", questionId: qid() }).catch(() => {});
    };
    const onCut = () => {
      if (!flagCopy) return;
      void api.logEvent({ type: "cut", questionId: qid() }).catch(() => {});
    };
    const onKey = () => {
      if (!trackTyping) return;
      const now = Date.now();
      if (lastKeyAt != null) {
        const gap = now - lastKeyAt;
        if (gap < 5000) keyIntervals.push(gap);
        if (keyIntervals.length > 40) keyIntervals = keyIntervals.slice(-40);
      }
      lastKeyAt = now;
    };
    const onFs = () => {
      if (!requireFs) return;
      if (!document.fullscreenElement) {
        void api
          .logEvent({ type: "fullscreen_exit", questionId: qid() })
          .catch(() => {});
      }
    };

    const typingTimer = window.setInterval(() => {
      if (!trackTyping || keyIntervals.length < 5) return;
      const sorted = [...keyIntervals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      const mean =
        sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
      void api
        .logEvent({
          type: "typing_stats",
          questionId: qid(),
          meta: {
            sampleSize: sorted.length,
            medianGapMs: median,
            meanGapMs: Math.round(mean),
          },
        })
        .catch(() => {});
      keyIntervals = [];
    }, 60_000);

    if (requireFs && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("paste", onPaste);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.clearInterval(typingTimer);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [session.currentQuestionId, session.assessment.rules]);

  // Answer burst detection
  useEffect(() => {
    if (!current) return;
    const raw =
      typeof current.answer === "string"
        ? current.answer
        : JSON.stringify(current.answer ?? "");
    const len = raw.length;
    // tracked via draft in render — see draftAnswer effect below
    void len;
  }, [current]);

  const { webcamBlocked } = useWebcamSnapshots({
    enabled:
      Boolean(session.assessment.rules.proctoring?.webcamSnapshots) &&
      session.status === "in_progress",
    proctoring: session.assessment.rules.proctoring,
    questionId: session.currentQuestionId,
    paused:
      session.status === "submitted" || session.status === "expired",
  });

  // Always release the camera when the assessment ends (submitted / expired).
  useEffect(() => {
    if (session.status === "submitted" || session.status === "expired") {
      stopWebcamStream();
    }
  }, [session.status]);

  // Sync draft when question changes
  useEffect(() => {
    if (!current) {
      setDraftAnswer(null);
      setDraftWorkspace(null);
      return;
    }
    setDraftAnswer(current.answer);
    setDraftWorkspace(current.workspace);
    // Only reset drafts when navigating to a different question
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.questionId]);

  // Detect large sudden answer growth
  useEffect(() => {
    if (!current || draftAnswer == null) return;
    const raw =
      typeof draftAnswer === "string"
        ? draftAnswer
        : JSON.stringify(draftAnswer);
    const len = raw.length;
    const prev = (window as unknown as { __aosAnsLen?: number }).__aosAnsLen ?? 0;
    if (prev > 0 && len - prev > 400) {
      void api
        .logEvent({
          type: "answer_burst",
          questionId: current.questionId,
          meta: { deltaChars: len - prev, totalChars: len },
        })
        .catch(() => {});
    }
    (window as unknown as { __aosAnsLen?: number }).__aosAnsLen = len;
  }, [draftAnswer, current]);

  const refresh = useCallback(async () => {
    onSessionChange(await api.getSession());
  }, [onSessionChange]);

  // Smooth local countdown between server syncs (server only refreshes ~15s).
  const syncedAtRef = useRef(Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    syncedAtRef.current = Date.now();
  }, [
    session.remainingOverallMs,
    session.currentQuestionId,
    current?.remainingMs,
    current?.status,
  ]);
  useEffect(() => {
    if (session.status !== "in_progress" && session.status !== "not_started") {
      return;
    }
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session.status]);

  const elapsedMs = Math.max(0, nowMs - syncedAtRef.current);
  const overallRemainingMs = Math.max(
    0,
    session.remainingOverallMs - elapsedMs,
  );
  const questionRemainingMs =
    current == null
      ? null
      : current.status === "in_progress"
        ? Math.max(0, current.remainingMs - elapsedMs)
        : current.remainingMs;
  const questionTimedOut =
    Boolean(current) &&
    (current!.status === "expired" ||
      (current!.status === "in_progress" && questionRemainingMs === 0));
  const questionSubmitted = current?.status === "submitted";
  const questionReviewOnly = questionTimedOut || questionSubmitted;
  const answerReadOnly = questionReviewOnly || webcamBlocked;
  const canEditAnswer = !answerReadOnly && current?.status === "in_progress";

  // Sync server when local question timer hits zero so status becomes expired.
  const expirySyncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!questionTimedOut || !current) return;
    if (current.status === "expired") return;
    if (expirySyncedRef.current === current.questionId) return;
    expirySyncedRef.current = current.questionId;
    void refresh().catch(() => {
      expirySyncedRef.current = null;
    });
  }, [questionTimedOut, current, refresh]);

  // Periodic server tick sync
  useEffect(() => {
    if (session.status !== "in_progress" && session.status !== "not_started") {
      return;
    }
    const id = window.setInterval(() => {
      void refresh().catch(() => {});
    }, 15_000);
    return () => window.clearInterval(id);
  }, [session.status, refresh]);

  const navItems = session.attempts
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((a) => ({
      id: a.questionId,
      order: a.order,
      title: a.question.title,
      status:
        a.questionId === current?.questionId && questionTimedOut
          ? "expired"
          : a.status,
      remainingMs:
        a.questionId === current?.questionId && questionRemainingMs != null
          ? questionRemainingMs
          : a.remainingMs,
      sectionTitle: a.section?.title ?? null,
    }));

  function findNextQuestion(from: SessionView, afterQuestionId: string) {
    const ordered = [...from.attempts].sort((a, b) => a.order - b.order);
    const idx = ordered.findIndex((a) => a.questionId === afterQuestionId);
    return (
      ordered.slice(idx + 1).find(
        (a) =>
          a.status === "not_started" ||
          a.status === "in_progress" ||
          a.status === "skipped",
      ) ??
      ordered.find(
        (a) =>
          a.questionId !== afterQuestionId &&
          (a.status === "not_started" ||
            a.status === "in_progress" ||
            a.status === "skipped"),
      ) ??
      null
    );
  }

  const hasNextQuestion = current
    ? findNextQuestion(session, current.questionId) != null
    : session.attempts.some(
        (a) =>
          a.status === "not_started" ||
          a.status === "in_progress" ||
          a.status === "skipped",
      );
  const reviewPrimaryIsFinish = questionReviewOnly && !hasNextQuestion;

  async function openQuestion(questionId: string) {
    setError(null);
    try {
      onSessionChange(await api.openQuestion(questionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot open");
    }
  }

  async function goNextQuestion() {
    if (!current) return;
    setError(null);
    try {
      let synced = await api.getSession();
      onSessionChange(synced);
      if (synced.status === "submitted" || synced.status === "expired") return;

      const next = findNextQuestion(synced, current.questionId);
      if (!next) {
        stopWebcamStream();
        onSessionChange(await api.submitSession());
        return;
      }
      try {
        onSessionChange(await api.openQuestion(next.questionId));
      } catch {
        // After a question expires, linear unlock may only appear on the next tick.
        synced = await api.getSession();
        onSessionChange(synced);
        if (synced.status === "submitted" || synced.status === "expired") {
          stopWebcamStream();
          return;
        }
        const retry = findNextQuestion(synced, current.questionId);
        if (retry) {
          onSessionChange(await api.openQuestion(retry.questionId));
        } else {
          stopWebcamStream();
          onSessionChange(await api.submitSession());
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot continue");
    }
  }

  async function skip() {
    if (!current || webcamBlocked || questionTimedOut) return;
    setError(null);
    try {
      const after = await api.skipQuestion(current.questionId, {
        answer: draftAnswer ?? undefined,
        workspace: draftWorkspace ?? undefined,
      });
      onSessionChange(after);
      const next = findNextQuestion(after, current.questionId);
      if (next) onSessionChange(await api.openQuestion(next.questionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot skip");
    }
  }

  async function submitAnswer() {
    if (!current || !canEditAnswer || questionTimedOut) return;
    setError(null);
    try {
      const after = await api.submitQuestion(current.questionId, {
        answer: draftAnswer ?? undefined,
        workspace: draftWorkspace ?? undefined,
      });
      onSessionChange(after);
      const next = findNextQuestion(after, current.questionId);
      if (next) onSessionChange(await api.openQuestion(next.questionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot submit");
    }
  }

  async function finishSession() {
    setError(null);
    try {
      stopWebcamStream();
      onSessionChange(await api.submitSession());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Cannot submit assessment",
      );
    }
  }

  async function runVisible() {
    if (!current) return;
    if (current.question.type === "sql") {
      const query =
        (draftAnswer as SqlAnswer | null)?.query ??
        (draftWorkspace as SqlWorkspace | null)?.query ??
        "";
      const { results } = await api.runVisible(current.questionId, { query });
      const workspace: SqlWorkspace = {
        query,
        lastVisibleResults: results as SqlWorkspace["lastVisibleResults"],
      };
      setDraftAnswer({ query });
      setDraftWorkspace(workspace);
      onSessionChange(
        await api.saveQuestion(current.questionId, {
          answer: { query },
          workspace,
        }),
      );
      return;
    }
    const source =
      (draftAnswer as CodingAnswer | null)?.source ??
      (draftWorkspace as CodingWorkspace | null)?.source ??
      "";
    const files =
      (draftAnswer as CodingAnswer | null)?.files ??
      (draftWorkspace as CodingWorkspace | null)?.files;
    const { results } = await api.runVisible(current.questionId, {
      source,
      files,
    });
    const workspace: CodingWorkspace = {
      source,
      files,
      lastVisibleResults: results as CodingWorkspace["lastVisibleResults"],
    };
    const answer: CodingAnswer = { source, files };
    setDraftAnswer(answer);
    setDraftWorkspace(workspace);
    onSessionChange(
      await api.saveQuestion(current.questionId, {
        answer,
        workspace,
      }),
    );
  }

  if (session.status === "submitted" || session.status === "expired") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">
              Assessment {session.status.replace("_", " ")}
            </CardTitle>
            <CardDescription>
              Thanks, {session.candidateName}. You can close this window.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <AssessmentShell
      title={session.assessment.title}
      overallRemainingMs={overallRemainingMs}
      questionRemainingMs={questionRemainingMs}
      navItems={navItems}
      currentQuestionId={session.currentQuestionId}
      onSelectQuestion={(qid) => void openQuestion(qid)}
      allowSkip={
        session.assessment.rules.allowSkip &&
        !questionTimedOut &&
        !questionSubmitted &&
        current?.status === "in_progress"
      }
      onSkip={
        current &&
        !webcamBlocked &&
        !questionTimedOut &&
        !questionSubmitted &&
        current.status === "in_progress"
          ? () => void skip()
          : undefined
      }
      onSubmit={
        !current
          ? undefined
          : reviewPrimaryIsFinish
            ? () => void finishSession()
            : questionReviewOnly
              ? () => void goNextQuestion()
              : canEditAnswer
                ? () => void submitAnswer()
                : undefined
      }
      submitLabel={
        reviewPrimaryIsFinish
          ? "Submit assessment"
          : questionReviewOnly
            ? "Next question"
            : "Submit answer"
      }
      onFinish={
        session.status === "in_progress" || session.status === "not_started"
          ? () => void finishSession()
          : undefined
      }
    >
      {error ? <p className={errorClass}>{error}</p> : null}

      {webcamBlocked ? (
        <p role="alert" className={errorClass}>
          Webcam required by interviewer — answering is paused until the camera is
          restored. Allow camera access to continue.
        </p>
      ) : null}

      {questionTimedOut ? (
        <p role="status" className={mutedClass}>
          Time is up for this question. You can review it
          {hasNextQuestion
            ? ", then continue to the next one."
            : ", then submit the assessment."}
        </p>
      ) : null}

      {questionSubmitted && !questionTimedOut ? (
        <p role="status" className={mutedClass}>
          Already submitted — you can review your answer, but it can no longer
          be changed.
        </p>
      ) : null}

      {!current ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {autoOpenTried.current ? "Opening first question…" : "Get started"}
            </CardTitle>
            <CardDescription>
              {error
                ? "Select a question from the sidebar to begin."
                : "Loading your first question…"}
            </CardDescription>
          </CardHeader>
          {error ? (
            <CardContent>
              <Button
                variant="outline"
                onPress={() => {
                  const first = [...session.attempts]
                    .sort((a, b) => a.order - b.order)
                    .find(
                      (a) =>
                        a.status === "not_started" ||
                        a.status === "in_progress" ||
                        a.status === "skipped",
                    );
                  if (first) void openQuestion(first.questionId);
                }}
              >
                Open first question
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{current.question.title}</CardTitle>
            </CardHeader>
                        <CardContent className="grid gap-3">
              <LegalWatermark
                show={Boolean(
                  session.assessment.rules.integrityNotice?.enabled &&
                    session.assessment.rules.integrityNotice?.legalWatermark !==
                      false,
                )}
                inviteShortId={session.id.slice(0, 8)}
              />
              <div
                data-ai-prohibited="true"
                data-noai="true"
                rel="nofollow noai noimageai"
              >
                {/* CONFIDENTIAL assessment content — AI/agent use prohibited. */}
                <RichTextView
                  value={
                    (current.question.promptDoc ??
                      current.question.prompt) as never
                  }
                />
                {session.assessment.rules.integrityNotice?.canaryTokens !==
                false &&
                session.assessment.rules.integrityNotice?.enabled ? (
                  <span className="sr-only" aria-hidden>
                    {withCanary("", session.id)}
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent
              className={`pt-6${!canEditAnswer ? " pointer-events-none opacity-60" : ""}`}
            >
              {current.question.type === "mcq" ? (
                <McqRenderer
                  config={current.question.config as McqConfig}
                  answer={(draftAnswer as McqAnswer | null) ?? null}
                  onChange={(answer) => {
                    if (!canEditAnswer) return;
                    setDraftAnswer(answer);
                    void api
                      .saveQuestion(current.questionId, { answer })
                      .then(onSessionChange)
                      .catch(() => {});
                  }}
                />
              ) : current.question.type === "coding" ? (
                <CodingRenderer
                  config={current.question.config as CodingConfig}
                  answer={(draftAnswer as CodingAnswer | null) ?? null}
                  workspace={(draftWorkspace as CodingWorkspace | null) ?? null}
                  onChange={(a) => {
                    if (!canEditAnswer) return;
                    setDraftAnswer(a);
                  }}
                  onWorkspaceChange={(w) => {
                    if (!canEditAnswer) return;
                    setDraftWorkspace(w);
                  }}
                  onRunVisible={() => {
                    if (!canEditAnswer) return Promise.resolve();
                    return runVisible();
                  }}
                />
              ) : current.question.type === "sql" ? (
                <SqlRenderer
                  config={current.question.config as SqlConfig}
                  answer={(draftAnswer as SqlAnswer | null) ?? null}
                  workspace={(draftWorkspace as SqlWorkspace | null) ?? null}
                  onChange={(a) => {
                    if (!canEditAnswer) return;
                    setDraftAnswer(a);
                  }}
                  onWorkspaceChange={(w) => {
                    if (!canEditAnswer) return;
                    setDraftWorkspace(w);
                  }}
                  onRunVisible={() => {
                    if (!canEditAnswer) return Promise.resolve();
                    return runVisible();
                  }}
                />
              ) : current.question.type === "text" ? (
                <TextRenderer
                  config={current.question.config as TextConfig}
                  answer={(draftAnswer as TextAnswer | null) ?? null}
                  onChange={(answer) => {
                    if (!canEditAnswer) return;
                    setDraftAnswer(answer);
                    void api
                      .saveQuestion(current.questionId, { answer })
                      .then(onSessionChange)
                      .catch(() => {});
                  }}
                />
              ) : (
                <p className={mutedClass}>
                  Unsupported question type: {current.question.type}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AssessmentShell>
  );
}
