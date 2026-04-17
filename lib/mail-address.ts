export function formatMailFromAddress(email: string, name?: string) {
  const trimmedName = name?.trim();
  if (!trimmedName) return email;

  const escapedName = trimmedName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escapedName}" <${email}>`;
}
