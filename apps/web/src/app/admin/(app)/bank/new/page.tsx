"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import {
  BankQuestionEditor,
  TYPE_LABELS,
  type BankType,
  bankTypeTone,
  parseBankType,
} from "@/components/admin/bank-question-editor";
import { StatusBadge } from "@/components/ui/status-badge";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

export default function NewBankQuestionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = parseBankType(searchParams.get("type"));
  const [type, setType] = useState<BankType>(initialType);
  const [role, setRole] = useState<OrgRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const canWrite = role !== "reviewer";

  useEffect(() => {
    void (async () => {
      const me = await api.me();
      if (!me) {
        router.replace("/admin/login");
        return;
      }
      const activeId =
        getActiveOrgId() ??
        me.activeOrganization?.id ??
        me.organizations[0]?.id ??
        null;
      if (activeId) setActiveOrgId(activeId);
      setRole(me.role);
      setReady(true);
    })().catch((err) => setError(getErrorMessage(err)));
  }, [router]);

  return (
    <main className={pageClass}>
      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      {!ready ? <p className={mutedClass}>Loading…</p> : null}

      {ready ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  New bank question
                </h1>
                <StatusBadge tone={bankTypeTone(type)}>
                  {TYPE_LABELS[type]}
                </StatusBadge>
              </div>
              <p className={mutedClass}>
                Create a reusable template for the question bank.
              </p>
            </div>
          </div>

          {!canWrite ? (
            <p className={mutedClass}>
              Reviewer role — bank write actions are hidden.
            </p>
          ) : (
            <BankQuestionEditor
              key={type}
              mode="create"
              type={type}
              canWrite={canWrite}
              allowTypeChange
              onTypeChange={setType}
              onCancel={() => router.push("/admin/bank")}
              onSaved={(q) => router.push(`/admin/bank/${q.id}`)}
            />
          )}
        </>
      ) : null}
    </main>
  );
}
