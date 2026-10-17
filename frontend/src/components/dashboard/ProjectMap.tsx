export { InteractiveMap } from '../common/InteractiveMap';
export type { InteractiveMapRef, InteractiveMapProps, MapLocation, MapProjectMarker } from '../common/InteractiveMap';

// Retained for backwards compatibility if needed
export const useLoadScript = (_options: unknown) => ({ isLoaded: false, loadError: undefined });
export const GoogleMap = (_props: any) => null;
export const Marker = (_props: any) => null;
