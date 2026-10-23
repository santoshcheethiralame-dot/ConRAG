import Link from "next/link";
import { getSession, type Role } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";

const LINKS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/", label: "Dashboard", roles: ["admin", "analyst", "viewer"] },
  { href: "/ask", label: "Ask", roles: ["admin", "analyst", "viewer"] },
  { href: "/conflicts", label: "Conflicts", roles: ["admin", "analyst", "viewer"] },
  { href: "/documents", label: "Documents", roles: ["admin", "analyst", "viewer"] },
  { href: "/ingest", label: "Ingest", roles: ["admin", "analyst"] },
  { href: "/sources", label: "Sources", roles: ["admin", "analyst", "viewer"] },
  { href: "/history", label: "History", roles: ["admin", "analyst", "viewer"] },
  { href: "/users", label: "Users", roles: ["admin"] },
  { href: "/audit", label: "Audit", roles: ["admin"] },
];

export async function Nav() {
  const s = await getSession();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-indigo-700">
          ConRAG
        </Link>
        {s ? (
          <>
            <nav aria-label="Main" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {LINKS.filter((l) => l.roles.includes(s.role)).map((l) => (
                <Link key={l.href} href={l.href} className="text-slate-600 hover:text-indigo-700">
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
              <span data-testid="whoami">
                {s.email} <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs uppercase">{s.role}</span>
              </span>
              <LogoutButton />
            </div>
          </>
        ) : (
          <div className="ml-auto flex gap-4 text-sm">
            <Link href="/login" className="text-slate-600 hover:text-indigo-700">
              Sign in
            </Link>
            <Link href="/register" className="text-slate-600 hover:text-indigo-700">
              Register
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
