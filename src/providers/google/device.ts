import { z } from 'zod';
import type { Device } from '../types';
import type { GoogleClient } from './client';

// v4 GET /users/me/pairedDevices — probed shape.
const PairedDeviceSchema = z.object({
  name: z.string(),
  deviceType: z.string().optional(),
  batteryStatus: z.string().optional(),
  batteryLevel: z.number().optional(),
  deviceVersion: z.string().optional(),
  macAddress: z.string().optional(),
  features: z.array(z.string()).optional(),
  lastSyncTime: z.string().optional(),
});
export const PairedDevicesResponseSchema = z.object({
  pairedDevices: z.array(PairedDeviceSchema).optional(),
});
export type PairedDevicesResponse = z.infer<typeof PairedDevicesResponseSchema>;

/** "users/{u}/pairedDevices/{id}" → "{id}"; falls back to the raw name. */
function parseDeviceId(name: string): string {
  return name.match(/pairedDevices\/([^/]+)/)?.[1] ?? name;
}

/** Map v4 paired devices onto the shared Device shape. Pure. */
export function mapDevices(raw: PairedDevicesResponse): Device[] {
  return (raw.pairedDevices ?? []).map((d) => ({
    id: parseDeviceId(d.name),
    deviceVersion: d.deviceVersion,
    type: d.deviceType,
    battery: d.batteryStatus,
    batteryLevel: d.batteryLevel,
    mac: d.macAddress,
    features: d.features,
    lastSyncTime: d.lastSyncTime,
  }));
}

export async function listDevices(client: Pick<GoogleClient, 'requestJson'>): Promise<Device[]> {
  const raw = await client.requestJson(PairedDevicesResponseSchema, {
    path: '/v4/users/me/pairedDevices',
  });
  return mapDevices(raw);
}
