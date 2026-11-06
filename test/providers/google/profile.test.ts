import { describe, expect, it } from 'vitest';
import { mapProfile } from '../../../src/providers/google/profile';
import { ProfileSchema } from '../../../src/providers/types';

// Synthetic fixture in the shape returned by
// GET https://health.googleapis.com/v4/users/me/profile.
const V4_PROFILE = {
  name: 'users/1000000000000000001/profile',
  age: 30,
  membershipStartDate: { year: 2024, month: 3, day: 5 },
  userConfiguredWalkingStrideLengthMm: 750,
  userConfiguredRunningStrideLengthMm: 1500,
};

describe('mapProfile', () => {
  it('parses encodedId out of the "users/{id}/profile" resource name', () => {
    expect(mapProfile(V4_PROFILE).user.encodedId).toBe('1000000000000000001');
  });

  it('formats membershipStartDate as zero-padded YYYY-MM-DD memberSince', () => {
    // month 3, day 5 → must be "2024-03-05", not "2024-3-5"
    expect(mapProfile(V4_PROFILE).user.memberSince).toBe('2024-03-05');
  });

  it('produces output that satisfies the shared ProfileSchema', () => {
    expect(() => ProfileSchema.parse(mapProfile(V4_PROFILE))).not.toThrow();
  });

  it('tolerates a minimal profile with only a name (no membership/age)', () => {
    const p = mapProfile({ name: 'users/42/profile' });
    expect(p.user.encodedId).toBe('42');
    expect(p.user.memberSince).toBeUndefined();
  });
});
