import { LoginForm } from "@/components/admin/login-form";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Enter your credentials to access the admin panel.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
