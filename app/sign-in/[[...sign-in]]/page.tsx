import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-4 py-10">
      <SignIn forceRedirectUrl="/dashboard" />
    </main>
  );
}
