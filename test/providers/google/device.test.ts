import { describe, expect, it } from 'vitest';
import { mapDevices } from '../../../src/providers/google/device';
import { DevicesResponseSchema } from '../../../src/providers/types';

// Synthetic fixture in the shape of GET /v4/users/me/pairedDevices (features trimmed).
const PAIRED = {
  pairedDevices: [
    {
      name: 'users/1000000000000000001/pairedDevices/1122334455',
      deviceType: 'TRACKER',
      batteryStatus: 'Medium',
      batteryLevel: 80,
      deviceVersion: 'Fitbit Air',
      macAddress: 'aabbccddeeff',
      features: ['SLEEP', 'STEPS', 'SPO2'],
    },
  ],
};

describe('mapDevices', () => {
  it('maps a v4 paired device onto the shared Device shape', () => {
    expect(mapDevices(PAIRED)).toEqual([
      {
        id: '1122334455',
        deviceVersion: 'Fitbit Air',
        type: 'TRACKER',
        battery: 'Medium',
        batteryLevel: 80,
        mac: 'aabbccddeeff',
        features: ['SLEEP', 'STEPS', 'SPO2'],
      },
    ]);
  });

  it('parses the device id out of the resource name', () => {
    expect(mapDevices(PAIRED)[0]?.id).toBe('1122334455');
  });

  it('satisfies DevicesResponseSchema', () => {
    expect(() => DevicesResponseSchema.parse(mapDevices(PAIRED))).not.toThrow();
  });

  it('returns [] when no devices are paired', () => {
    expect(mapDevices({})).toEqual([]);
  });
});
