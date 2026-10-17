export interface MapLocation {
  lat: number;
  lng: number;
}

export interface MapProjectMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  location?: string;
  status?: string;
  completion?: number;
  color?: string;
}

export interface GenerateMapHtmlOptions {
  center?: MapLocation;
  zoom?: number;
  markerPos?: MapLocation | null;
  markers?: MapProjectMarker[];
  interactive?: boolean;
}

export function generateLeafletHtml({
  center = { lat: 7.8731, lng: 80.7718 },
  zoom = 7,
  markerPos = null,
  markers = [],
  interactive = true,
}: GenerateMapHtmlOptions = {}): string {
  const initialCenterJson = JSON.stringify(center);
  const initialMarkerPosJson = JSON.stringify(markerPos);
  const initialMarkersJson = JSON.stringify(markers);
  const isInteractiveJson = JSON.stringify(interactive);
  const initialZoomJson = JSON.stringify(zoom);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>ConstructFlow Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <style>
    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #f8fafc;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .cf-marker {
      position: relative;
      width: 32px;
      height: 42px;
      cursor: pointer;
    }
    .cf-marker svg {
      filter: drop-shadow(0 4px 6px rgba(0,0,0,0.35));
      transition: transform 0.15s ease;
    }
    .cf-marker:active svg {
      transform: scale(1.15);
    }
    .pulse-ring {
      position: absolute;
      bottom: -3px;
      left: 50%;
      transform: translateX(-50%);
      width: 16px;
      height: 7px;
      background: rgba(249, 115, 22, 0.45);
      border-radius: 50%;
      animation: cf-pulse 1.8s infinite;
      pointer-events: none;
    }
    @keyframes cf-pulse {
      0% { transform: translateX(-50%) scale(0.7); opacity: 0.9; }
      100% { transform: translateX(-50%) scale(2.4); opacity: 0; }
    }
    .leaflet-popup-content-wrapper {
      border-radius: 14px;
      padding: 4px;
      box-shadow: 0 12px 28px -4px rgba(15, 23, 42, 0.22);
      border: 1px solid rgba(226, 232, 240, 0.8);
    }
    .leaflet-popup-content {
      margin: 10px 14px;
      line-height: 1.45;
      font-size: 13px;
    }
    .leaflet-popup-tip {
      background: #ffffff;
    }
    .leaflet-control-zoom {
      border: none !important;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15) !important;
      border-radius: 10px !important;
      overflow: hidden;
    }
    .leaflet-control-zoom a {
      width: 34px !important;
      height: 34px !important;
      line-height: 34px !important;
      font-size: 16px !important;
      color: #334155 !important;
      background-color: #ffffff !important;
      border-bottom: 1px solid #f1f5f9 !important;
    }
    .leaflet-control-zoom a:hover, .leaflet-control-zoom a:active {
      background-color: #f8fafc !important;
      color: #f97316 !important;
    }
    .map-tag {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 999;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(226, 232, 240, 0.8);
      border-radius: 8px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #475569;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
      display: flex;
      align-items: center;
      gap: 5px;
      pointer-events: none;
    }
    .map-tag-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #f97316;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="hint-tag" class="map-tag">
    <span class="map-tag-dot"></span>
    <span id="hint-text">${interactive ? 'Tap anywhere to pin site' : 'ConstructFlow Map'}</span>
  </div>

  <script>
    var map;
    var currentMarker = null;
    var projectMarkers = [];
    var streetLayer, satLayer;
    var currentLayerType = 'street';

    var isInteractive = ${isInteractiveJson};
    var initialCenter = ${initialCenterJson};
    var initialZoom = ${initialZoomJson};
    var initialMarkerPos = ${initialMarkerPosJson};
    var initialMarkers = ${initialMarkersJson};

    function notifyParent(data) {
      var json = JSON.stringify(data);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(json);
      } else if (window.parent && window.parent.postMessage) {
        window.parent.postMessage(json, '*');
      }
    }

    function createPinIcon(color) {
      color = color || '#F97316';
      var svg = '<svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M16 0C7.16344 0 0 7.16344 0 16C0 26.5 16 42 16 42C16 42 32 26.5 32 16C32 7.16344 24.8366 0 16 0Z" fill="' + color + '"/>' +
        '<circle cx="16" cy="16" r="6" fill="#ffffff"/>' +
        '</svg>';
      return L.divIcon({
        className: 'cf-marker',
        html: svg + '<div class="pulse-ring"></div>',
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -38]
      });
    }

    function initMap() {
      streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      });

      satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri'
      });

      var centerCoords = initialMarkerPos && initialMarkerPos.lat && initialMarkerPos.lng
        ? [initialMarkerPos.lat, initialMarkerPos.lng]
        : [initialCenter.lat, initialCenter.lng];

      var zoomLevel = initialMarkerPos && initialMarkerPos.lat ? 14 : initialZoom;

      map = L.map('map', {
        center: centerCoords,
        zoom: zoomLevel,
        zoomControl: false,
        layers: [streetLayer]
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      if (initialMarkerPos && initialMarkerPos.lat && initialMarkerPos.lng) {
        setPin(initialMarkerPos.lat, initialMarkerPos.lng, false);
      }

      if (initialMarkers && initialMarkers.length > 0) {
        setMarkers(initialMarkers);
      }

      if (isInteractive) {
        map.on('click', function(e) {
          var lat = parseFloat(e.latlng.lat.toFixed(6));
          var lng = parseFloat(e.latlng.lng.toFixed(6));
          setPin(lat, lng, false);
          notifyParent({ type: 'locationSelect', lat: lat, lng: lng });
        });
      }

      notifyParent({ type: 'mapLoaded' });
    }

    window.setPin = function(lat, lng, shouldPan) {
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      if (currentMarker) {
        currentMarker.setLatLng([lat, lng]);
      } else {
        currentMarker = L.marker([lat, lng], {
          icon: createPinIcon('#F97316'),
          draggable: isInteractive
        }).addTo(map);

        if (isInteractive) {
          currentMarker.on('dragend', function(e) {
            var pos = e.target.getLatLng();
            var nlat = parseFloat(pos.lat.toFixed(6));
            var nlng = parseFloat(pos.lng.toFixed(6));
            notifyParent({ type: 'locationSelect', lat: nlat, lng: nlng });
          });
        }
      }
      if (shouldPan) {
        map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.5 });
      }
    };

    window.flyToLocation = function(lat, lng, zoomLevel) {
      window.setPin(lat, lng, false);
      map.flyTo([lat, lng], zoomLevel || 15, { duration: 0.6 });
    };

    window.toggleLayer = function() {
      if (currentLayerType === 'street') {
        map.removeLayer(streetLayer);
        map.addLayer(satLayer);
        currentLayerType = 'sat';
      } else {
        map.removeLayer(satLayer);
        map.addLayer(streetLayer);
        currentLayerType = 'street';
      }
      notifyParent({ type: 'layerChanged', layer: currentLayerType });
    };

    window.setMarkers = function(list) {
      if (!Array.isArray(list)) return;
      projectMarkers.forEach(function(m) { map.removeLayer(m); });
      projectMarkers = [];

      var bounds = [];
      list.forEach(function(item) {
        if (item && item.lat && item.lng) {
          var marker = L.marker([item.lat, item.lng], {
            icon: createPinIcon(item.color || '#F97316')
          });

          var html = '<div style="font-weight:700;color:#0f172a;margin-bottom:3px;font-size:13px;">' + (item.title || 'Project') + '</div>';
          if (item.location) {
            html += '<div style="color:#64748b;font-size:11px;margin-bottom:6px;">' + item.location + '</div>';
          }
          if (item.status) {
            html += '<span style="display:inline-block;background:#ffedd5;color:#c2410c;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;text-transform:uppercase;">' + item.status + '</span>';
          }
          if (typeof item.completion === 'number') {
            html += '<div style="margin-top:6px;font-size:11px;font-weight:700;color:#f97316;">' + item.completion + '% Progress</div>';
          }

          marker.bindPopup(html);
          marker.on('click', function() {
            notifyParent({ type: 'markerClick', id: item.id });
          });

          marker.addTo(map);
          projectMarkers.push(marker);
          bounds.push([item.lat, item.lng]);
        }
      });

      if (bounds.length > 0) {
        if (bounds.length === 1) {
          map.setView(bounds[0], 14);
        } else {
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      }
    };

    // Listen for Web postMessage
    window.addEventListener('message', function(event) {
      try {
        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data || !data.type) return;
        if (data.type === 'flyTo') {
          window.flyToLocation(data.lat, data.lng, data.zoom);
        } else if (data.type === 'setMarker') {
          window.setPin(data.lat, data.lng, true);
        } else if (data.type === 'toggleLayer') {
          window.toggleLayer();
        } else if (data.type === 'setMarkers') {
          window.setMarkers(data.markers);
        }
      } catch (e) {}
    });

    window.addEventListener('DOMContentLoaded', initMap);
  </script>
</body>
</html>`;
}
