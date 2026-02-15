import { auth } from "@clerk/nextjs/server";
import { OrganizationList } from "@clerk/nextjs";
import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function OrganizationSelectPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { userId, orgId } = await auth();
  const params = (await searchParams) ?? {};
  const requestedNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = typeof requestedNext === "string" && requestedNext.startsWith("/")
    ? requestedNext
    : "/dashboard";

  if (!userId) {
    redirect("/sign-in");
  }

  if (orgId) {
    redirect(nextPath);
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
          afterSelectOrganizationUrl={nextPath}
          afterCreateOrganizationUrl={nextPath}
        />
      </div>
    </main>
  );
}
