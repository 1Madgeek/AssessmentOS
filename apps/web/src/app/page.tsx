import { redirect } from "next/navigation";

/** Standalone deploy: skip marketing landing and go straight to admin. */
export default function HomePage() {
  redirect("/admin/login");
}
