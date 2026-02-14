import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-4 py-10">
      <SignUp forceRedirectUrl="/organization-select" />
    </main>
  );
}
