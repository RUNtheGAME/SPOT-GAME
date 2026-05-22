import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CircleMarker, MapContainer, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const SHORTBREAD_STYLE_URL = 'https://vector.openstreetmap.org/styles/shortbread/colorful.json';
const DEFAULT_CENTER = [35.05, 31.75];
const DEFAULT_BOUNDS_MAPLIBRE = [
  [-170, -55], // west,south
  [170, 75], // east,north
];
const DEFAULT_BOUNDS_LEAFLET = [
  [-55, -170], // south,west
  [75, 170], // north,east
];

const CITY_COORDS = {
  'אזור': { lat: 32.029, lon: 34.807 },
  'אילת': { lat: 29.558, lon: 34.948 },
  'אשקלון': { lat: 31.669, lon: 34.571 },
  'באר יעקב': { lat: 31.943, lon: 34.837 },
  'בת ים': { lat: 32.017, lon: 34.75 },
  'גבעת שמואל': { lat: 32.076, lon: 34.849 },
  'גבעתיים': { lat: 32.069, lon: 34.811 },
  'הוד השרון': { lat: 32.159, lon: 34.893 },
  'הרצליה': { lat: 32.166, lon: 34.844 },
  'חולון': { lat: 32.016, lon: 34.787 },
  'יבנה': { lat: 31.878, lon: 34.739 },
  'ירושלים': { lat: 31.768, lon: 35.214 },
  'כפר ברוך': { lat: 32.646, lon: 35.187 },
  'כפר הס': { lat: 32.267, lon: 34.915 },
  'כפר סבא': { lat: 32.175, lon: 34.906 },
  'מודיעין': { lat: 31.9, lon: 35.01 },
  'היוגב': { lat: 32.661, lon: 35.159 },
  'עידן בערבה': { lat: 30.806, lon: 35.3 },
  'עתלית': { lat: 32.693, lon: 34.942 },
  'פתח תקווה': { lat: 32.085, lon: 34.888 },
  'צורן': { lat: 32.299, lon: 34.913 },
  'קרית גת': { lat: 31.61, lon: 34.764 },
  'ראש העין': { lat: 32.096, lon: 34.956 },
  'רחובות': { lat: 31.895, lon: 34.811 },
  'רמלה': { lat: 31.932, lon: 34.873 },
  'רמת גן': { lat: 32.082, lon: 34.811 },
  'רמת השרון': { lat: 32.138, lon: 34.84 },
  'רמת מוצא': { lat: 31.793, lon: 35.158 },
  'רמת רזיאל': { lat: 31.778, lon: 35.079 },
  'רשפון': { lat: 32.215, lon: 34.82 },
  'תל אביב': { lat: 32.085, lon: 34.782 },
};

const CITY_ALIASES = {
  'ירשלים': 'ירושלים',
  'כפר סבא הירוקה': 'כפר סבא',
  'מושב היוגב': 'היוגב',
  'מושב עידן בערבה': 'עידן בערבה',
  'קדימה צורן': 'צורן',
};

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCityName(rawCity) {
  let city = normalizeText(rawCity);
  if (!city) return '';

  city = city.replace(/^מושב\s+/, '');
  city = city.replace(/^קיבוץ\s+/, '');

  if (CITY_ALIASES[city]) city = CITY_ALIASES[city];
  if (city.includes('כפר סבא')) city = 'כפר סבא';
  if (CITY_ALIASES[city]) city = CITY_ALIASES[city];

  return city;
}

function createLocationGroups(members) {
  const byCity = new Map();

  members
    .filter((member) => member && member.generation !== -1)
    .forEach((member) => {
      const normalizedCity = normalizeCityName(member.city);
      if (!normalizedCity) return;

      const coords = CITY_COORDS[normalizedCity] || null;
      if (!coords) return;

      if (!byCity.has(normalizedCity)) {
        byCity.set(normalizedCity, {
          id: normalizedCity,
          city: normalizedCity,
          lat: coords.lat,
          lon: coords.lon,
          members: [],
        });
      }

      byCity.get(normalizedCity).members.push(member);
    });

  return [...byCity.values()].sort((a, b) => {
    if (b.members.length !== a.members.length) return b.members.length - a.members.length;
    return a.city.localeCompare(b.city, 'he');
  });
}

function buildMapLibreBounds(groups) {
  if (!groups.length) return DEFAULT_BOUNDS_MAPLIBRE;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  groups.forEach((group) => {
    minLat = Math.min(minLat, group.lat);
    maxLat = Math.max(maxLat, group.lat);
    minLon = Math.min(minLon, group.lon);
    maxLon = Math.max(maxLon, group.lon);
  });

  const latPad = Math.max((maxLat - minLat) * 0.25, 0.2);
  const lonPad = Math.max((maxLon - minLon) * 0.25, 0.2);

  return [
    [minLon - lonPad, minLat - latPad], // west,south
    [maxLon + lonPad, maxLat + latPad], // east,north
  ];
}

function buildLeafletBounds(groups) {
  if (!groups.length) return DEFAULT_BOUNDS_LEAFLET;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  groups.forEach((group) => {
    minLat = Math.min(minLat, group.lat);
    maxLat = Math.max(maxLat, group.lat);
    minLon = Math.min(minLon, group.lon);
    maxLon = Math.max(maxLon, group.lon);
  });

  const latPad = Math.max((maxLat - minLat) * 0.25, 0.2);
  const lonPad = Math.max((maxLon - minLon) * 0.25, 0.2);

  return [
    [minLat - latPad, minLon - lonPad], // south,west
    [maxLat + latPad, maxLon + lonPad], // north,east
  ];
}

function LeafletAutoFit({ bounds, focusedCity }) {
  const map = useMap();

  useEffect(() => {
    if (focusedCity) {
      map.flyTo([focusedCity.lat, focusedCity.lon], Math.max(map.getZoom(), 10), {
        animate: true,
        duration: 0.45,
      });
      return;
    }

    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 9, animate: true, duration: 0.45 });
  }, [bounds, focusedCity, map]);

  return null;
}

export default function FamilyWorldMap({ members, selectedMemberId, onSelectMember }) {
  const locationGroups = useMemo(() => createLocationGroups(Array.isArray(members) ? members : []), [members]);
  const maplibreBounds = useMemo(() => buildMapLibreBounds(locationGroups), [locationGroups]);
  const leafletBounds = useMemo(() => buildLeafletBounds(locationGroups), [locationGroups]);

  const [activeCityId, setActiveCityId] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [useRasterFallback, setUseRasterFallback] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.protocol === 'file:';
  });

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const selectedMemberCityGroup = useMemo(() => {
    if (!selectedMemberId) return null;
    return locationGroups.find((group) => group.members.some((member) => member.id === selectedMemberId)) || null;
  }, [locationGroups, selectedMemberId]);
  const selectedMemberCityId = selectedMemberCityGroup?.id || '';

  const effectiveCityId =
    activeCityId ||
    selectedMemberCityId ||
    (locationGroups[0] && locationGroups[0].id) ||
    '';

  const activeCityGroup = useMemo(() => {
    if (!effectiveCityId) return null;
    return locationGroups.find((group) => group.id === effectiveCityId) || null;
  }, [locationGroups, effectiveCityId]);

  useEffect(() => {
    if (!selectedMemberCityId) return;
    setActiveCityId((prev) => (prev === selectedMemberCityId ? prev : selectedMemberCityId));
  }, [selectedMemberCityId]);

  useEffect(() => {
    if (activeCityId && locationGroups.some((group) => group.id === activeCityId)) return;
    setActiveCityId(locationGroups[0]?.id || '');
  }, [activeCityId, locationGroups]);

  useEffect(() => {
    if (useRasterFallback || !mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: SHORTBREAD_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: 7,
      minZoom: 2,
      maxZoom: 18,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const onLoad = () => {
      setMapReady(true);
      setMapError('');
      map.resize();
    };

    const onError = (event) => {
      const message = event?.error?.message || 'שגיאה בטעינת שכבת Shortbread.';
      setMapError(message);
      setUseRasterFallback(true);
    };

    map.on('load', onLoad);
    map.on('error', onError);
    mapRef.current = map;

    return () => {
      map.off('load', onLoad);
      map.off('error', onError);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [useRasterFallback]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || useRasterFallback) return;

    if (activeCityGroup) {
      map.flyTo({
        center: [activeCityGroup.lon, activeCityGroup.lat],
        zoom: Math.max(map.getZoom(), 10),
        essential: true,
        duration: 700,
      });
      return;
    }

    map.fitBounds(maplibreBounds, {
      padding: 40,
      maxZoom: 9,
      duration: 700,
      essential: true,
    });
  }, [mapReady, useRasterFallback, maplibreBounds, activeCityGroup]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || useRasterFallback) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = locationGroups.map((group) => {
      const markerButton = document.createElement('button');
      markerButton.type = 'button';
      markerButton.className = group.id === effectiveCityId ? 'shortbread-marker active' : 'shortbread-marker';
      markerButton.setAttribute('aria-label', `מיקום ${group.city}, ${group.members.length} בני משפחה`);

      if (group.members.length > 1) {
        const badge = document.createElement('span');
        badge.className = 'shortbread-marker-badge';
        badge.textContent = String(group.members.length);
        markerButton.appendChild(badge);
      }

      markerButton.addEventListener('click', () => setActiveCityId(group.id));

      return new maplibregl.Marker({
        element: markerButton,
        anchor: 'center',
      })
        .setLngLat([group.lon, group.lat])
        .addTo(map);
    });
  }, [mapReady, useRasterFallback, locationGroups, effectiveCityId]);

  return (
    <div className="offline-map-shell">
      <div className="shortbread-map-canvas">
        {useRasterFallback ? (
          <MapContainer
            className="fallback-osm-instance"
            center={[DEFAULT_CENTER[1], DEFAULT_CENTER[0]]}
            zoom={7}
            minZoom={2}
            zoomControl={false}
            scrollWheelZoom
            worldCopyJump
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ZoomControl position="topright" />
            <LeafletAutoFit bounds={leafletBounds} focusedCity={activeCityGroup} />
            {locationGroups.map((group) => {
              const isActive = group.id === effectiveCityId;
              return (
                <CircleMarker
                  key={group.id}
                  center={[group.lat, group.lon]}
                  radius={isActive ? 9 : 7}
                  pathOptions={{
                    color: isActive ? '#0f67b2' : '#2f86d4',
                    weight: 2,
                    fillColor: isActive ? '#0f67b2' : '#2f86d4',
                    fillOpacity: 0.75,
                  }}
                  eventHandlers={{
                    click: () => setActiveCityId(group.id),
                  }}
                >
                  <Popup>
                    <div className="shortbread-popup">
                      <strong>{group.city}</strong>
                      <div>{group.members.length} בני משפחה</div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        ) : (
          <div className="shortbread-map-instance" ref={mapContainerRef} />
        )}

        {!!mapError && useRasterFallback && <div className="shortbread-map-status">Shortbread נחסם בדפדפן, מוצגת מפת OSM חלופית.</div>}
      </div>

      <aside className="offline-map-panel">
        <h4>מפת Shortbread ({locationGroups.length})</h4>
        <p>אם Shortbread חסום בדפדפן, נטענת אוטומטית מפת OSM חלופית.</p>

        <div className="offline-map-city-list">
          {locationGroups.length === 0 ? (
            <p className="offline-map-empty-note">לא נמצאו ערים מזוהות בנתונים.</p>
          ) : (
            locationGroups.map((group) => (
              <button
                type="button"
                key={group.id}
                className={group.id === effectiveCityId ? 'offline-map-city-btn active' : 'offline-map-city-btn'}
                onClick={() => setActiveCityId(group.id)}
              >
                <span>{group.city}</span>
                <strong>{group.members.length}</strong>
              </button>
            ))
          )}
        </div>

        {activeCityGroup && (
          <div className="offline-map-members">
            <h5>בני משפחה ב{activeCityGroup.city}</h5>
            <div className="offline-map-members-list">
              {activeCityGroup.members.map((member) => {
                const isSelected = member.id === selectedMemberId;
                return (
                  <button
                    type="button"
                    key={member.id}
                    className={isSelected ? 'offline-map-member-btn active' : 'offline-map-member-btn'}
                    onClick={() => onSelectMember && onSelectMember(member.id)}
                  >
                    {member.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
