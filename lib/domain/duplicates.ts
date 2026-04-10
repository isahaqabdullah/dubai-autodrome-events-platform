export interface DuplicateCandidate {
  eventId: string;
  emailNormalized: string;
}

export function isSameEventEmailDuplicate(
  existing: DuplicateCandidate | null | undefined,
  candidate: DuplicateCandidate
) {
  if (!existing) {
    return false;
  }

  return (
    existing.eventId === candidate.eventId &&
    existing.emailNormalized.trim().toLowerCase() === candidate.emailNormalized.trim().toLowerCase()
  );
}
