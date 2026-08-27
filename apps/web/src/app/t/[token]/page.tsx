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
import { api } from "@/lib/api";
import { btnPrimary, inputStyle, pageStyle } from "@/lib/styles";

export default function CandidateGatePage() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<{
    assessment: { title: string; description: string; durationSeconds: number };
  } | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        setInvite(await api.getInvite(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invite not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setSession(
        await api.startSession(token, {
          candidateName: name.trim(),
          candidateEmail: email.trim(),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
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

  return (
    <main style={{ ...pageStyle, maxWidth: 480 }}>
      <h1>{invite.assessment.title}</h1>
      <p style={{ whiteSpace: "pre-wrap" }}>{invite.assessment.description}</p>
      <p style={{ color: "#656d76" }}>
        Duration: {Math.round(invite.assessment.durationSeconds / 60)} minutes
      </p>
      <form onSubmit={(e) => void start(e)} style={{ display: "grid", gap: 12 }}>
        <label>
          Your name
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
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
          />
        </label>
        {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}
        <button type="submit" style={btnPrimary}>
          Start assessment
        </button>
      </form>
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
    const source =
      (draftAnswer as CodingAnswer | null)?.source ??
      (draftWorkspace as CodingWorkspace | null)?.source ??
      "";
    const { results } = await api.runVisible(current.questionId, { source });
    const workspace: CodingWorkspace = {
      source,
      lastVisibleResults: results as CodingWorkspace["lastVisibleResults"],
    };
    setDraftAnswer({ source });
    setDraftWorkspace(workspace);
    onSessionChange(
      await api.saveQuestion(current.questionId, {
        answer: { source },
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
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {current.question.prompt}
            </p>
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
