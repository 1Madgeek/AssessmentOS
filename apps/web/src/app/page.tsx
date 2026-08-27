import { LinkButton } from "@/components/ui/button";
import { mutedClass } from "@/lib/styles";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className={mutedClass}>Open source</p>
      <h1 className="font-heading text-4xl font-semibold tracking-tight md:text-5xl">
        AssessmentOS
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground leading-relaxed">
        Infrastructure for building, delivering, and reviewing technical
        assessments — MCQ, coding, and more — with a plugin-first architecture.
      </p>
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/admin/login">Recruiter login</LinkButton>
        <LinkButton
          href="https://github.com/1Madgeek/AssessmentOS"
          variant="outline"
          target="_blank"
          rel="noreferrer"
        >
          Docs
        </LinkButton>
      </div>
    </main>
  );
}
