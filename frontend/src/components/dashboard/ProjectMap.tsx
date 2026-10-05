import type { GoogleMapProps, MarkerProps } from '@react-google-maps/api';
// Keep browser scripts out of native bundles; the form provides an address fallback.
export const useLoadScript = (_options: unknown) => ({ isLoaded: false, loadError: undefined });
export const GoogleMap = (_props: GoogleMapProps) => null;
export const Marker = (_props: MarkerProps) => null;
