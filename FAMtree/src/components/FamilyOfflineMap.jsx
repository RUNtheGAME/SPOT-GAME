import React, { useMemo, useRef, useState } from 'react';

const MAP_BOUNDS = {
  minLat: 29.35,
  maxLat: 33.45,
  minLon: 34.0,
  maxLon: 35.95,
};

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

const ISRAEL_POLYGON = [
  [34.248351, 31.211449],
  [34.350905, 31.289254],
  [34.345841, 31.357725],
  [34.367339, 31.392814],
  [34.556032, 31.539825],
  [34.481204, 31.583141],
  [34.609630, 31.765530],
  [34.711925, 31.951606],
  [34.837657, 32.280707],
  [34.942068, 32.724514],
  [34.947520, 32.814154],
  [34.970470, 32.841376],
  [35.027680, 32.826606],
  [35.062755, 32.858344],
  [35.099620, 33.087592],
  [35.283665, 33.101185],
  [35.345160, 33.055580],
  [35.480139, 33.087387],
  [35.512282, 33.147409],
  [35.520033, 33.222185],
  [35.549489, 33.281019],
  [35.603852, 33.240091],
  [35.620065, 33.269536],
  [35.652143, 33.276660],
  [35.698523, 33.322670],
  [35.769423, 33.342643],
  [35.821100, 33.406722],
  [35.809938, 33.360032],
  [35.763842, 33.334401],
  [35.802083, 33.312490],
  [35.768597, 33.272699],
  [35.803633, 33.248463],
  [35.807664, 33.201721],
  [35.830195, 33.189991],
  [35.811488, 33.111908],
  [35.848902, 33.098678],
  [35.859030, 32.990210],
  [35.888073, 32.944941],
  [35.849729, 32.895823],
  [35.834226, 32.827946],
  [35.757590, 32.744347],
  [35.635995, 32.679143],
  [35.611758, 32.681900],
  [35.560547, 32.640903],
  [35.579978, 32.560391],
  [35.559410, 32.552950],
  [35.565612, 32.525587],
  [35.551969, 32.525587],
  [35.579978, 32.497733],
  [35.559410, 32.470396],
  [35.572536, 32.456728],
  [35.551969, 32.436212],
  [35.559100, 32.413966],
  [35.545148, 32.409573],
  [35.560961, 32.384717],
  [35.406862, 32.414793],
  [35.392909, 32.494478],
  [35.363143, 32.510110],
  [35.270436, 32.510471],
  [35.190751, 32.541710],
  [35.064350, 32.463136],
  [35.044713, 32.434120],
  [35.021562, 32.344590],
  [34.996551, 32.323041],
  [34.989936, 32.278470],
  [35.009366, 32.267644],
  [35.007609, 32.244390],
  [34.961411, 32.201576],
  [35.007245, 32.020772],
  [34.986695, 31.967228],
  [35.039006, 31.908637],
  [35.034323, 31.861114],
  [34.977433, 31.833366],
  [35.012939, 31.829340],
  [35.076320, 31.854158],
  [35.112472, 31.823963],
  [35.186167, 31.808740],
  [35.183587, 31.825116],
  [35.215764, 31.820110],
  [35.205255, 31.877254],
  [35.222023, 31.879178],
  [35.233353, 31.842611],
  [35.264935, 31.826272],
  [35.252699, 31.769650],
  [35.262811, 31.748625],
  [35.237970, 31.709332],
  [35.125742, 31.733103],
  [34.973606, 31.630370],
  [34.937330, 31.582001],
  [34.926788, 31.494409],
  [34.867153, 31.396431],
  [34.878832, 31.362841],
  [34.927408, 31.344910],
  [35.040166, 31.363203],
  [35.164913, 31.362273],
  [35.223307, 31.381031],
  [35.390118, 31.487071],
  [35.458538, 31.491619],
  [35.452854, 31.400823],
  [35.395700, 31.257680],
  [35.436214, 31.159546],
  [35.438488, 31.103736],
  [35.391565, 31.023947],
  [35.385261, 30.963279],
  [35.322216, 30.889950],
  [35.316635, 30.822823],
  [35.279531, 30.780241],
  [35.263821, 30.719780],
  [35.205324, 30.617099],
  [35.140005, 30.430185],
  [35.162122, 30.361404],
  [35.125225, 30.244667],
  [35.145276, 30.123382],
  [35.086261, 30.034034],
  [35.054118, 29.923394],
  [35.048951, 29.842314],
  [35.002545, 29.733096],
  [34.989833, 29.651964],
  [34.951345, 29.545640],
  [34.910818, 29.489936],
  [34.886729, 29.490058],
  [34.855267, 29.545717],
  [34.824365, 29.741700],
  [34.741373, 29.940241],
  [34.733208, 30.012588],
  [34.599469, 30.344506],
  [34.526915, 30.409618],
  [34.536217, 30.482172],
  [34.504384, 30.530334],
  [34.480407, 30.651205],
  [34.248351, 31.211449],
];

const MAP_LABELS = [
  { text: 'ישראל', lat: 31.9, lon: 35.1, className: 'region' },
  { text: 'ים התיכון', lat: 31.95, lon: 34.32, className: '' },
  { text: 'ירדן', lat: 31.35, lon: 35.73, className: '' },
];

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

  if (CITY_ALIASES[city]) {
    city = CITY_ALIASES[city];
  }

  if (city.includes('כפר סבא')) {
    city = 'כפר סבא';
  }

  if (CITY_ALIASES[city]) {
    city = CITY_ALIASES[city];
  }

  return city;
}

function createProjection(width, height, padding = 42) {
  const centerLatRadians = (((MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2) * Math.PI) / 180;
  const lonScale = Math.cos(centerLatRadians);
  const projectedWidth = (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon) * lonScale;
  const projectedHeight = MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat;

  const scale = Math.min((width - padding * 2) / projectedWidth, (height - padding * 2) / projectedHeight);
  const usedWidth = projectedWidth * scale;
  const usedHeight = projectedHeight * scale;

  return {
    lonScale,
    scale,
    offsetX: (width - usedWidth) / 2,
    offsetY: (height - usedHeight) / 2,
  };
}

function projectToMap(lat, lon, width, height, projection) {
  const x = projection.offsetX + (lon - MAP_BOUNDS.minLon) * projection.lonScale * projection.scale;
  const y = projection.offsetY + (MAP_BOUNDS.maxLat - lat) * projection.scale;

  return {
    x: clamp(x, 0, width),
    y: clamp(y, 0, height),
  };
}

function buildCountryPath(width, height, projection) {
  return ISRAEL_POLYGON.map(([lon, lat], index) => {
    const projected = projectToMap(lat, lon, width, height, projection);
    return `${index === 0 ? 'M' : 'L'} ${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

export default function FamilyOfflineMap({ members, selectedMemberId, onSelectMember }) {
  const mapWidth = 940;
  const mapHeight = 640;
  const minZoom = 1;
  const maxZoom = 4;
  const zoomStep = 0.18;

  const locationGroups = useMemo(() => createLocationGroups(Array.isArray(members) ? members : []), [members]);
  const [activeCityId, setActiveCityId] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef(null);

  const selectedMemberCityGroup = useMemo(() => {
    if (!selectedMemberId) return null;
    return locationGroups.find((group) => group.members.some((member) => member.id === selectedMemberId)) || null;
  }, [locationGroups, selectedMemberId]);

  const effectiveCityId = activeCityId || (selectedMemberCityGroup && selectedMemberCityGroup.id) || (locationGroups[0] && locationGroups[0].id) || '';

  const activeCityGroup = useMemo(() => {
    if (!effectiveCityId) return null;
    return locationGroups.find((group) => group.id === effectiveCityId) || null;
  }, [locationGroups, effectiveCityId]);

  const mapProjection = useMemo(() => createProjection(mapWidth, mapHeight), [mapWidth, mapHeight]);
  const mapPath = useMemo(
    () => buildCountryPath(mapWidth, mapHeight, mapProjection),
    [mapWidth, mapHeight, mapProjection],
  );
  const zoomPercent = Math.round(zoom * 100);

  function clampPan(nextX, nextY, nextZoom = zoom) {
    const maxPanX = ((nextZoom - 1) * mapWidth) / 2;
    const maxPanY = ((nextZoom - 1) * mapHeight) / 2;
    return {
      x: clamp(nextX, -maxPanX, maxPanX),
      y: clamp(nextY, -maxPanY, maxPanY),
    };
  }

  function applyZoom(nextZoom) {
    const safeZoom = clamp(nextZoom, minZoom, maxZoom);
    setZoom(safeZoom);
    setPan((prevPan) => clampPan(prevPan.x, prevPan.y, safeZoom));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  return (
    <div className="offline-map-shell">
      <div
        className={`offline-map-canvas${zoom > 1 ? ' zoomable' : ''}${isDragging ? ' dragging' : ''}`}
        role="img"
        aria-label="מפת ישראל עם מיקומי בני משפחה"
        onWheel={(event) => {
          event.preventDefault();
          const delta = event.deltaY < 0 ? zoomStep : -zoomStep;
          applyZoom(zoom + delta);
        }}
        onPointerDown={(event) => {
          if (zoom <= 1) return;
          dragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: pan.x,
            originY: pan.y,
          };
          setIsDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!isDragging || !dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;
          const dx = event.clientX - dragStateRef.current.startX;
          const dy = event.clientY - dragStateRef.current.startY;
          const bounded = clampPan(dragStateRef.current.originX + dx, dragStateRef.current.originY + dy);
          setPan(bounded);
        }}
        onPointerUp={(event) => {
          if (dragStateRef.current && dragStateRef.current.pointerId === event.pointerId) {
            dragStateRef.current = null;
            setIsDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          dragStateRef.current = null;
          setIsDragging(false);
        }}
      >
        <div className="offline-map-controls" aria-label="כלי זום">
          <button type="button" onClick={() => applyZoom(zoom + zoomStep)} aria-label="הגדל מפה">
            +
          </button>
          <button type="button" onClick={() => applyZoom(zoom - zoomStep)} aria-label="הקטן מפה">
            -
          </button>
          <button type="button" onClick={resetView} aria-label="איפוס תצוגת מפה">
            איפוס
          </button>
          <span>{zoomPercent}%</span>
        </div>

        <svg className="offline-map-svg" viewBox={`0 0 ${mapWidth} ${mapHeight}`}>
          <defs>
            <linearGradient id="offlineSeaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#dff2ff" />
              <stop offset="100%" stopColor="#c8e7fb" />
            </linearGradient>
            <linearGradient id="offlineLandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f7f5e8" />
              <stop offset="100%" stopColor="#e8efd8" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={mapWidth} height={mapHeight} fill="url(#offlineSeaGradient)" />
          <g
            className="offline-map-viewport"
            transform={`translate(${mapWidth / 2 + pan.x} ${mapHeight / 2 + pan.y}) scale(${zoom}) translate(${-mapWidth / 2} ${-mapHeight / 2})`}
          >
            <path className="offline-map-land" d={mapPath} fill="url(#offlineLandGradient)" />
            {MAP_LABELS.map((label) => {
              const point = projectToMap(label.lat, label.lon, mapWidth, mapHeight, mapProjection);
              const className = label.className
                ? `offline-map-label ${label.className}`
                : 'offline-map-label';
              return (
                <text key={`${label.text}_${label.lat}_${label.lon}`} className={className} x={point.x} y={point.y}>
                  {label.text}
                </text>
              );
            })}
            {locationGroups.length === 0 && (
              <text className="offline-map-empty-label" x="420" y="370">
                אין כרגע נקודות כתובת זמינות
              </text>
            )}

            {locationGroups.map((group) => {
              const point = projectToMap(group.lat, group.lon, mapWidth, mapHeight, mapProjection);
              const isActive = group.id === effectiveCityId;
              const memberCount = group.members.length;

              return (
                <g
                  key={group.id}
                  className={isActive ? 'offline-map-pin active' : 'offline-map-pin'}
                  transform={`translate(${point.x} ${point.y})`}
                  onClick={() => setActiveCityId(group.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setActiveCityId(group.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`מיקום ${group.city}, ${memberCount} בני משפחה`}
                >
                  <circle r={isActive ? 14 : 11} />
                  {memberCount > 1 && <text y="4">{memberCount}</text>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <aside className="offline-map-panel">
        <h4>מפת כתובות ({locationGroups.length})</h4>
        <p>לחיצה על נקודה או עיר תציג בני משפחה. אפשר זום עם +/-, גלגלת וגרירה.</p>

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
