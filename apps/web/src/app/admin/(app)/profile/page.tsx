"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { MeResponse, NotificationPreferences } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { errorClass, mutedClass } from "@/lib/styles";

const DEFAULT_PREFS: NotificationPreferences = {
  emailSessionSubmitted: true,
  emailInviteOpened: true,
  emailWeeklyDigest: false,
  productUpdates: true,
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export default function ProfilePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const user = await api.me();
      if (!user) {
        router.replace("/admin/login");
        return;
      }
      setMe(user);
      setName(user.name);
      setAvatarUrl(user.avatarUrl);
      setPrefs({ ...DEFAULT_PREFS, ...user.preferences });
    })().catch((err) => setError(getErrorMessage(err)));
  }, [router]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const updated = await api.updateProfile({
        name: name.trim(),
        avatarUrl,
        preferences: prefs,
      });
      setMe((prev) =>
        prev
          ? {
              ...prev,
              name: updated.name,
              avatarUrl: updated.avatarUrl,
              preferences: updated.preferences,
            }
          : prev,
      );
      setSaved("Profile saved.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not save profile"));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved("Password updated.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not change password"));
    } finally {
      setBusy(false);
    }
  }

  async function onPickLogo(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await api.uploadAsset(file, file.name);
      setAvatarUrl(uploaded.url);
      setSaved("Logo uploaded — save profile to keep it.");
    } catch (err) {
      setError(getErrorMessage(err, "Upload failed"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!me) {
    return <p className={mutedClass}>Loading…</p>;
  }

  const preview = resolveMediaUrl(avatarUrl);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Profile
        </h1>
        <p className={mutedClass}>
          Manage your name, logo, password, and notification preferences.
        </p>
      </div>

      {error ? <p className={errorClass}>{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{saved}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>
            How you appear in the admin sidebar and org member lists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void saveProfile(e)} className="grid gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar size="lg" className="rounded-none after:rounded-none">
                {preview ? (
                  <AvatarImage src={preview} alt="" className="rounded-none" />
                ) : null}
                <AvatarFallback className="rounded-none">
                  {initials(name || me.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onPickLogo(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isDisabled={busy}
                    onPress={() => fileRef.current?.click()}
                  >
                    Upload logo
                  </Button>
                  {avatarUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      isDisabled={busy}
                      onPress={() => setAvatarUrl(null)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <p className={mutedClass}>PNG or JPG, up to 2MB.</p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={me.email} disabled />
            </div>

            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">Notifications</legend>
              {(
                [
                  [
                    "emailSessionSubmitted",
                    "Email me when a candidate submits a session",
                  ],
                  [
                    "emailInviteOpened",
                    "Email me when an invite is opened",
                  ],
                  ["emailWeeklyDigest", "Weekly digest of org activity"],
                  ["productUpdates", "Product updates and tips"],
                ] as const
              ).map(([key, label]) => (
                <Label
                  key={key}
                  className="flex items-start gap-2 text-sm font-normal"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={prefs[key]}
                    onChange={(e) =>
                      setPrefs((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    disabled={busy}
                  />
                  <span>{label}</span>
                </Label>
              ))}
            </fieldset>

            <Button type="submit" isDisabled={busy || !name.trim()}>
              {busy ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Choose a new password (at least 8 characters).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void changePassword(e)} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="current">Current password</Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="next">New password</Label>
              <Input
                id="next"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              isDisabled={
                busy ||
                !currentPassword ||
                newPassword.length < 8 ||
                newPassword !== confirmPassword
              }
            >
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
