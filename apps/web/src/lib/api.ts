import { createClient } from "@assessment-os/sdk";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const api = createClient(API_URL);
