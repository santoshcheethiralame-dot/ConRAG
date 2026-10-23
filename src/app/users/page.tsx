import { PageHeader, Table } from "@/components/ui";
import { UserControls } from "@/components/UserAdmin";
import { requirePage } from "@/lib/auth";
import { listUsers } from "@/lib/queries";

export const metadata = { title: "Users · ConRAG" };

export default async function UsersPage() {
  const s = await requirePage(["admin"]);
  const users = await listUsers();
  return (
    <>
      <PageHeader title="Users" subtitle="Public sign-up creates viewers. Promote analysts and admins here. A database trigger refuses to remove the last admin." />
      <Table head={["Email", "Questions", "Joined", "Role"]}>
        {users.map((u) => (
          <tr key={u.id}>
            <td className="px-3 py-2 font-medium">{u.email}</td>
            <td className="px-3 py-2 tabular-nums">{u.queries}</td>
            <td className="px-3 py-2 text-slate-600">{u.created_at.slice(0, 10)}</td>
            <td className="px-3 py-2">
              <UserControls id={u.id} email={u.email} role={u.role} isSelf={u.id === s.userId} />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
