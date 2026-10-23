"use client";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { btnGhost } from "./ui";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className={btnGhost}
      onClick={async () => {
        await api("/api/auth/logout", "POST");
        router.push("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
