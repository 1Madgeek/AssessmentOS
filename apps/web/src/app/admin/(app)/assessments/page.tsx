"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Assessment, MeResponse } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Button, LinkButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorClass, mutedClass } from "@/lib/styles";

export default function AssessmentsListPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canWrite = me?.role !== "reviewer";

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
      setAssessments(await api.listAssessments());
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [router]);

  async function createAssessment(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !canWrite) return;
    const created = await api.createAssessment({
      title: title.trim(),
      durationSeconds: 60 * 60,
      rules: {
        allowSkip: true,
        allowReturn: true,
        perQuestionTimers: true,
        linearLock: false,
        randomizeQuestionOrder: false,
      },
    });
    router.push(`/admin/assessments/${created.id}`);
  }

  if (!me) {
    return <p className={mutedClass}>Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Assessments
        </h1>
        <p className={mutedClass}>
          Create and open take-homes for your organization.
        </p>
      </div>

      {error ? <p className={errorClass}>{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>All assessments</CardTitle>
          <CardDescription>
            {assessments.length} in{" "}
            {me.activeOrganization?.name ?? "this organization"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canWrite ? (
            <form
              onSubmit={(e) => void createAssessment(e)}
              className="flex flex-wrap gap-2"
            >
              <Input
                className="min-w-[200px] flex-1"
                placeholder="New assessment title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Button type="submit">Create</Button>
            </form>
          ) : (
            <p className={mutedClass}>
              Reviewer role — create and edit actions are hidden.
            </p>
          )}

          <Table aria-label="Assessments">
            <TableHeader>
              <TableHead id="title" isRowHeader>
                Title
              </TableHead>
              <TableHead id="status">Status</TableHead>
              <TableHead id="duration">Duration</TableHead>
              <TableHead id="actions" className="text-right">
                Actions
              </TableHead>
            </TableHeader>
            <TableBody items={assessments}>
              {(a) => (
                <TableRow id={a.id}>
                  <TableCell>
                    <Link
                      href={`/admin/assessments/${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {a.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.published ? "default" : "secondary"}>
                      {a.published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {Math.round(a.durationSeconds / 60)} min
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <LinkButton
                        variant="outline"
                        size="sm"
                        href={`/admin/assessments/${a.id}`}
                      >
                        Open
                      </LinkButton>
                      <LinkButton
                        variant="ghost"
                        size="sm"
                        href={`/admin/assessments/${a.id}/sessions`}
                      >
                        Results
                      </LinkButton>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {assessments.length === 0 ? (
            <p className={mutedClass}>No assessments yet. Create one above.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
