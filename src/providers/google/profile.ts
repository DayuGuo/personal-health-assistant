import { z } from 'zod';
import type { Profile } from '../types';
import type { GoogleClient } from './client';

// v4 GET /users/me/profile — far leaner than Fitbit's profile. Captured
// shape: { name, age, membershipStartDate{y,m,d}, stride Mm }.
// No displayName / gender / height / weight / timezone are exposed.
const CivilDate = z.object({ year: z.number(), month: z.number(), day: z.number() });

export const GoogleProfileSchema = z.object({
  name: z.string(),
  age: z.number().optional(),
  membershipStartDate: CivilDate.optional(),
  userConfiguredWalkingStrideLengthMm: z.number().optional(),
  userConfiguredRunningStrideLengthMm: z.number().optional(),
});
export type GoogleProfile = z.infer<typeof GoogleProfileSchema>;

/** "users/{id}/profile" → "{id}"; falls back to the raw name if unmatched. */
function parseEncodedId(name: string): string {
  return name.match(/users\/([^/]+)\/profile/)?.[1] ?? name;
}

function formatCivilDate(d: z.infer<typeof CivilDate>): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** Map a v4 profile onto the shared Fitbit-shaped Profile. Pure. */
export function mapProfile(raw: GoogleProfile): Profile {
  return {
    user: {
      encodedId: parseEncodedId(raw.name),
      memberSince: raw.membershipStartDate ? formatCivilDate(raw.membershipStartDate) : undefined,
    },
  };
}

/** Fetch and map the authenticated user's v4 profile. */
export async function getProfile(client: GoogleClient): Promise<Profile> {
  const raw = await client.requestJson(GoogleProfileSchema, { path: '/v4/users/me/profile' });
  return mapProfile(raw);
}
