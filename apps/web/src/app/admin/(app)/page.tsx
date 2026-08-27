"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Assessment, MeResponse } from "@assessment-os/sdk";
import { ArrowRight } from "lucide-react";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { LinkButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { errorClass, mutedClass } from "@/lib/styles";

function ClaudeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12.7 3.2 16.4 12l-3.7 8.8h-2.8L6.2 12l3.7-8.8h2.8Zm-1.4 3.3L8.7 12l2.6 5.5h.8L14.7 12l-2.6-5.5h-.8Z"
      />
    </svg>
  );
}

function CursorLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M5 3.5 19.5 12 11 13.8 8.8 20.5 5 3.5Zm2.7 4.2 1.7 8.1.9-2.7 4.4-.9L7.7 7.7Z"
      />
    </svg>
  );
}

function CodexLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M22.3 12c0 5.5-4.5 10-10 10a10 10 0 0 1-9.7-7.6h3.2A6.9 6.9 0 0 0 12.3 19c3.9 0 7-3.1 7-7s-3.1-7-7-7A6.9 6.9 0 0 0 5.8 9.6H2.6A10 10 0 0 1 12.3 2c5.5 0 10 4.5 10 10Z"
      />
    </svg>
  );
}

export default function AdminHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState(0);

  const publishedCount = assessments.filter((a) => a.published).length;

  useEffect(() => {
    void (async () => {
      const user = await api.me();
      if (!user) {
        router.replace("/admin/login");
        return;
      }
      const activeId =
        getActiveOrgId() ??
        user.activeOrganization?.id ??
        user.organizations[0]?.id ??
        null;
      if (activeId) setActiveOrgId(activeId);
      setMe(user);
      const [list, tokenList] = await Promise.all([
        api.listAssessments(),
        api.listApiTokens(),
      ]);
      setAssessments(list);
      setTokenCount(tokenList.length);
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [router]);

  if (!me) {
    return <p className={mutedClass}>Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Dashboard
        </h1>
        <p className={mutedClass}>
          {me.name} · {me.email}
        </p>
      </div>

      {error ? <p className={errorClass}>{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/admin/assessments"
          className="block transition-opacity hover:opacity-90"
        >
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Assessments</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {assessments.length}
              </CardTitle>
            </CardHeader>
            <CardContent className={mutedClass}>In this organization</CardContent>
          </Card>
        </Link>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Published</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {publishedCount}
            </CardTitle>
          </CardHeader>
          <CardContent className={mutedClass}>Ready for invites</CardContent>
        </Card>
        <Link
          href="/admin/mcp"
          className="block transition-opacity hover:opacity-90"
        >
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>API tokens</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {tokenCount}
              </CardTitle>
            </CardHeader>
            <CardContent className={mutedClass}>For MCP / SDK access</CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Recent assessments</CardTitle>
            <CardDescription>
              Jump back into a take-home or open the full list.
            </CardDescription>
          </div>
          <LinkButton href="/admin/assessments" variant="outline" size="sm">
            View all
          </LinkButton>
        </CardHeader>
        <CardContent className="space-y-2">
          {assessments.slice(0, 5).map((a) => (
            <Link
              key={a.id}
              href={`/admin/assessments/${a.id}`}
              className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0 hover:underline"
            >
              <span className="font-medium">{a.title}</span>
              <span className={mutedClass}>
                {a.published ? "Published" : "Draft"} ·{" "}
                {Math.round(a.durationSeconds / 60)} min
              </span>
            </Link>
          ))}
          {assessments.length === 0 ? (
            <p className={mutedClass}>
              No assessments yet.{" "}
              <Link href="/admin/assessments" className="underline">
                Create one
              </Link>
              .
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Link
        href="/admin/mcp"
        className="group block rounded-none border border-border bg-card p-5 text-card-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center border border-border bg-background text-foreground">
                <ClaudeLogo className="size-5" />
              </span>
              <span className="flex size-9 items-center justify-center border border-border bg-background text-foreground">
                <CursorLogo className="size-5" />
              </span>
              <span className="flex size-9 items-center justify-center border border-border bg-background text-foreground">
                <CodexLogo className="size-5" />
              </span>
            </div>
            <div>
              <p className="font-heading text-lg font-semibold tracking-tight">
                Connect agents with MCP
              </p>
              <p className={`${mutedClass} mt-1 max-w-xl`}>
                Set up Claude, Cursor, or Codex to create assessments, manage
                the bank, and send invites from chat.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            Open MCP setup
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </div>
  );
}
