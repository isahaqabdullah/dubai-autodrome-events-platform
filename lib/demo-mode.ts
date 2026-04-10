export function isDemoMode() {
  return (
    process.env.APP_DEMO_MODE === "1" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL === "https://example.supabase.co"
  );
}
