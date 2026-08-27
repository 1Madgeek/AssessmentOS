"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import {
  BankQuestionEditor,
  parseBankType,
} from "@/components/admin/bank-question-editor";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

export default function NewBankQuestionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = parseBankType(searchParams.get("type"));
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
      {error ? <p className={errorClass}>{error}</p> : null}

      {!ready ? <p className={mutedClass}>Loading…</p> : null}

      {ready ? (
        <BankQuestionEditor
          mode="create"
          type={type}
          canWrite={canWrite}
          onCancel={() => router.push("/admin/bank")}
          onSaved={(q) => router.push(`/admin/bank/${q.id}`)}
        />
      ) : null}
    </main>
  );
}
