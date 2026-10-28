import 'server-only';
import { getSetting } from '@/lib/settings';
import { floorplanV2Enabled, FLOORPLAN_V2_KEY, type FloorplanV2Config } from './feature-flag';

/** Η τρέχουσα ρύθμιση του flag από το AppSetting (default: κενή = ανενεργό). */
export async function getFloorplanV2Config(): Promise<FloorplanV2Config> {
  return (await getSetting<FloorplanV2Config>(FLOORPLAN_V2_KEY, {})) ?? {};
}

/** Είναι το v2 editor ενεργό για αυτόν τον χρήστη; */
export async function floorplanV2ForUser(userId: string | null): Promise<boolean> {
  return floorplanV2Enabled(await getFloorplanV2Config(), userId);
}
