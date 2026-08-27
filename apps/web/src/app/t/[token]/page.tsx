"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { btnPrimary, inputStyle, pageStyle } from "@/lib/styles";
import { getErrorMessage } from "@assessment-os/sdk";

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
    return <main style={pageStyle}>Loading…</main>;
  }

  if (session) {
    return (
      <CandidateSession
        session={session}
        onSessionChange={setSession}
      />
    );
  }

  if (!invite) {
    return (
      <main style={pageStyle}>
        <h1>Invite unavailable</h1>
        {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}
      </main>
    );
  }

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const captchaReady = !needCaptcha || Boolean(captchaToken);

  return (
    <main style={{ ...pageStyle, maxWidth: 480 }}>
      <h1>{invite.assessment.title}</h1>
      <p style={{ whiteSpace: "pre-wrap" }}>{invite.assessment.description}</p>
      <p style={{ color: "#656d76" }}>
        Duration: {Math.round(invite.assessment.durationSeconds / 60)} minutes
      </p>
      {!otpSent ? (
        <form
          onSubmit={(e) => void sendCode(e)}
          style={{ display: "grid", gap: 12 }}
        >
          <label>
            Your name
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>
          <label>
            Email
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          {invite.emailBound ? (
            <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
              This invite is locked to a specific email address. Enter that
              address to receive a verification code.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
              We will email a one-time verification code to confirm you own this
              address.
            </p>
          )}
          <TurnstileWidget key="send" onToken={onCaptchaToken} />
          {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}
          <button
            type="submit"
            style={btnPrimary}
            disabled={busy || !captchaReady}
          >
            Send verification code
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => void start(e)} style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#656d76" }}>
            Code sent to <strong>{email}</strong>. Enter it below to start.
            The code expires in 10 minutes.
          </p>
          <label>
            Verification code
            <input
              style={inputStyle}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </label>
          <TurnstileWidget key="start" onToken={onCaptchaToken} />
          {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}
          <button
            type="submit"
            style={btnPrimary}
            disabled={busy || otp.length < 6 || !captchaReady}
          >
            Start assessment
          </button>
          <button
            type="button"
            disabled={busy || cooldownLeft > 0 || !captchaReady}
            onClick={() => void sendCode()}
            style={{
              ...btnPrimary,
              background: "#fff",
              color: "#24292f",
              border: "1px solid #d0d7de",
            }}
          >
            {cooldownLeft > 0
              ? `Resend code (${cooldownLeft}s)`
              : "Resend code"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setOtpSent(false);
              setOtp("");
              setError(null);
              setCaptchaToken(null);
              resetTurnstile();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#656d76",
              cursor: "pointer",
              textAlign: "left",
              padding: 0,
            }}
          >
            Change email
          </button>
        </form>
      )}
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

  // Activity events
  useEffect(() => {
    const onBlur = () => {
      void api
        .logEvent({
          type: "focus_lost",
          questionId: session.currentQuestionId ?? undefined,
        })
        .catch(() => {});
    };
    const onVis = () => {
      if (document.hidden) {
        void api
          .logEvent({
            type: "tab_hidden",
            questionId: session.currentQuestionId ?? undefined,
          })
          .catch(() => {});
      }
    };
    const onPaste = () => {
      void api
        .logEvent({
          type: "paste",
          questionId: session.currentQuestionId ?? undefined,
        })
        .catch(() => {});
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("paste", onPaste);
    };
  }, [session.currentQuestionId]);

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

  const refresh = useCallback(async () => {
    onSessionChange(await api.getSession());
  }, [onSessionChange]);

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
      status: a.status,
      remainingMs: a.remainingMs,
      sectionTitle: a.section?.title ?? null,
    }));

  const overallRemainingMs = session.remainingOverallMs;
  const questionRemainingMs = current?.remainingMs ?? null;

  async function openQuestion(questionId: string) {
    setError(null);
    try {
      onSessionChange(await api.openQuestion(questionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot open");
    }
  }

  async function saveDraft() {
    if (!current) return;
    onSessionChange(
      await api.saveQuestion(current.questionId, {
        answer: draftAnswer ?? undefined,
        workspace: draftWorkspace ?? undefined,
      }),
    );
  }

  async function skip() {
    if (!current) return;
    setError(null);
    try {
      onSessionChange(
        await api.skipQuestion(current.questionId, {
          answer: draftAnswer ?? undefined,
          workspace: draftWorkspace ?? undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot skip");
    }
  }

  async function submitAnswer() {
    if (!current) return;
    setError(null);
    try {
      onSessionChange(
        await api.submitQuestion(current.questionId, {
          answer: draftAnswer ?? undefined,
          workspace: draftWorkspace ?? undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot submit");
    }
  }

  async function finishSession() {
    onSessionChange(await api.submitSession());
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
      <main style={pageStyle}>
        <h1>Assessment {session.status.replace("_", " ")}</h1>
        <p>Thanks, {session.candidateName}. You can close this window.</p>
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
      allowSkip={session.assessment.rules.allowSkip}
      onSkip={current ? () => void skip() : undefined}
      onSubmit={current ? () => void submitAnswer() : undefined}
    >
      {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}

      {!current ? (
        <div>
          <p>Select a question from the sidebar to begin.</p>
          <button type="button" style={btnPrimary} onClick={() => void finishSession()}>
            Submit assessment
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <h2 style={{ margin: "0 0 8px" }}>{current.question.title}</h2>
            <RichTextView
              value={(current.question.promptDoc ?? current.question.prompt) as never}
            />
          </div>

          {current.question.type === "mcq" ? (
            <McqRenderer
              config={current.question.config as McqConfig}
              answer={(draftAnswer as McqAnswer | null) ?? null}
              onChange={(answer) => {
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
              onChange={setDraftAnswer}
              onWorkspaceChange={setDraftWorkspace}
              onRunVisible={() => runVisible()}
            />
          ) : current.question.type === "sql" ? (
            <SqlRenderer
              config={current.question.config as SqlConfig}
              answer={(draftAnswer as SqlAnswer | null) ?? null}
              workspace={(draftWorkspace as SqlWorkspace | null) ?? null}
              onChange={setDraftAnswer}
              onWorkspaceChange={setDraftWorkspace}
              onRunVisible={() => runVisible()}
            />
          ) : current.question.type === "text" ? (
            <TextRenderer
              config={current.question.config as TextConfig}
              answer={(draftAnswer as TextAnswer | null) ?? null}
              onChange={(answer) => {
                setDraftAnswer(answer);
                void api
                  .saveQuestion(current.questionId, { answer })
                  .then(onSessionChange)
                  .catch(() => {});
              }}
            />
          ) : (
            <p>Unsupported question type: {current.question.type}</p>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void saveDraft()}>
              Save draft
            </button>
            <button type="button" onClick={() => void finishSession()}>
              Finish assessment
            </button>
          </div>
        </div>
      )}
    </AssessmentShell>
  );
}
