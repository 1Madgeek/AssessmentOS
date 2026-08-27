"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { BankQuestion, OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import {
  BankQuestionEditor,
  parseBankType,
} from "@/components/admin/bank-question-editor";
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

  return (
    <main className={pageClass}>
      {error ? <p className={errorClass}>{error}</p> : null}

      {!ready ? <p className={mutedClass}>Loading…</p> : null}

      {ready && item ? (
        <BankQuestionEditor
          mode="edit"
          type={parseBankType(item.type)}
          initial={item}
          canWrite={canWrite}
          onCancel={() => router.push("/admin/bank")}
          onSaved={(q) => setItem(q)}
        />
      ) : null}
    </main>
  );
}
