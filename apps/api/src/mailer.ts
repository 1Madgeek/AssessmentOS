export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type Mailer = {
  send(message: EmailMessage): Promise<void>;
  /** Test helper — only populated for console mailer. */
  sent?: EmailMessage[];
};

export function createMailer(env: {
  resendApiKey?: string;
  emailFrom?: string;
}): Mailer {
  const from =
    env.emailFrom?.trim() || "AssessmentOS <onboarding@resend.dev>";

  if (env.resendApiKey?.trim()) {
    const apiKey = env.resendApiKey.trim();
    return {
      async send(message) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          console.error(
            `[mailer:resend] failed status=${res.status} to=${message.to} body=${body}`,
          );
          throw new Error(`Resend failed (${res.status}): ${body}`);
        }
        console.info(`[mailer:resend] sent to=${message.to}`);
      },
    };
  }

  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      console.info(
        `[mailer:console] to=${message.to} subject=${JSON.stringify(message.subject)}`,
      );
    },
  };
}
