"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { BankQuestion, OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import {
  BankQuestionEditor,
  TYPE_LABELS,
  bankTypeTone,
  parseBankType,
} from "@/components/admin/bank-question-editor";
import { StatusBadge } from "@/components/ui/status-badge";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

export default function EditBankQuestionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [role, setRole] = useState<OrgRole | null>(null);
  const [item, setItem] = useState<BankQuestion | null>(null);
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
      const items = await api.listBankQuestions();
      const found = items.find((q) => q.id === id) ?? null;
      if (!found) {
        setError("Bank template not found");
        setReady(true);
        return;
      }
      setItem(found);
      setReady(true);
    })().catch((err) => setError(getErrorMessage(err)));
  }, [id, router]);

  const type = item ? parseBankType(item.type) : null;

  return (
    <main className={pageClass}>
      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      {!ready ? <p className={mutedClass}>Loading…</p> : null}

      {ready && item && type ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  Edit bank question
                </h1>
                <StatusBadge tone={bankTypeTone(type)}>
                  {TYPE_LABELS[type]}
                </StatusBadge>
              </div>
              <p className={`${mutedClass} line-clamp-2 max-w-3xl`}>
                {item.title || "Untitled template"}
              </p>
            </div>
          </div>

          {!canWrite ? (
            <p className={mutedClass}>
              Reviewer role — bank write actions are hidden.
            </p>
          ) : (
            <BankQuestionEditor
              mode="edit"
              type={type}
              initial={item}
              canWrite={canWrite}
              onCancel={() => router.push("/admin/bank")}
              onSaved={(q) => setItem(q)}
            />
          )}
        </>
      ) : null}
    </main>
  );
}
