"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { mutedClass, pageClass } from "@/lib/styles";

export default function AssessmentQuestionsRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/assessments/${id}/builder`);
  }, [id, router]);

  return (
    <main className={pageClass}>
      <p className={mutedClass}>Redirecting to builder…</p>
    </main>
  );
}
