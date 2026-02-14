import { auth } from "@clerk/nextjs/server";
import { OrganizationList } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export default async function OrganizationSelectPage() {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  if (orgId) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-xl card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-content mb-2">Select your organization</h1>
        <p className="text-content-muted mb-6">
          Choose an existing organization or create a new one to access the dashboard.
        </p>

        <OrganizationList
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
        />
      </div>
    </main>
  );
}
