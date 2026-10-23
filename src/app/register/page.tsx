import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Register · ConRAG" };

export default async function RegisterPage() {
  if (await getSession()) redirect("/");
  return <AuthForm mode="register" />;
}
