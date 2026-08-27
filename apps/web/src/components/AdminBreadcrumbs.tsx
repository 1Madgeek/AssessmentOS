"use client";

import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

type Crumb = { label: string; href?: string };

function crumbsForPath(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "admin") {
    return [{ label: "Admin" }];
  }

  const crumbs: Crumb[] = [{ label: "Admin", href: "/admin" }];

  if (parts.length === 1) {
    crumbs.push({ label: "Dashboard" });
    return crumbs;
  }

  const section = parts[1]!;

  switch (section) {
    case "assessments": {
      crumbs.push({ label: "Assessments", href: "/admin/assessments" });
      if (parts[2]) {
        const id = parts[2]!;
        crumbs.push({
          label: "Assessment",
          href: `/admin/assessments/${id}`,
        });
        if (parts[3] === "sessions") {
          crumbs.push({
            label: "Sessions",
            href: `/admin/assessments/${id}/sessions`,
          });
          if (parts[4]) {
            crumbs.push({ label: "Review" });
          }
        } else if (parts[3] === "questions") {
          crumbs.push({
            label: "Questions",
            href: `/admin/assessments/${id}/builder`,
          });
          if (parts[4] === "new") {
            crumbs.push({ label: "New" });
          } else if (parts[4]) {
            crumbs.push({ label: "Edit" });
          }
        } else if (parts[3] === "invites") {
          crumbs.push({ label: "Invites" });
        } else if (parts[3] === "edit") {
          crumbs.push({ label: "Edit" });
        } else if (parts[3] === "builder") {
          crumbs.push({ label: "Builder" });
        }
      }
      return crumbs;
    }
    case "bank":
      crumbs.push({ label: "Question bank", href: "/admin/bank" });
      if (parts[2] === "new") {
        crumbs.push({ label: "New" });
      } else if (parts[2]) {
        crumbs.push({ label: "Edit" });
      }
      return crumbs;
    case "candidates":
      crumbs.push({ label: "Candidates", href: "/admin/candidates" });
      if (parts[2]) {
        crumbs.push({ label: "Detail" });
      }
      return crumbs;
    case "email-templates":
      crumbs.push({ label: "Email templates" });
      return crumbs;
    case "mcp":
      crumbs.push({ label: "MCP / Agents" });
      return crumbs;
    case "org":
      crumbs.push({ label: "Settings" });
      return crumbs;
    case "profile":
      crumbs.push({ label: "Profile" });
      return crumbs;
    default:
      crumbs.push({ label: section });
      return crumbs;
  }
}

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const crumbs = crumbsForPath(pathname);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <BreadcrumbItem key={`${crumb.label}-${i}`}>
              {isLast || !crumb.href ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
