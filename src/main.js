import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Map as MapLibreMap,
  NavigationControl
} from 'maplibre-gl';
import {MapboxOverlay} from '@deck.gl/mapbox';
import {
  ColumnLayer,
  PathLayer,
  PolygonLayer,
  ScatterplotLayer
} from '@deck.gl/layers';
import {
  loadTrafficData,
  loadDirectionData
} from './data.js';
import {
  ROAD_AXIS_BEARING_SITES
} from './generated-road-bearings.js';
import {
  setupMapAiAssistant
} from './map-ai-ui.js';

const [
  allTrafficData,
  allDirectionData
] = await Promise.all([
  loadTrafficData(),
  loadDirectionData()
]);


const TRAFFIC_METRICS = {
  all_motor_vehicles: {
    label: 'All motor vehicles'
  },

  cars_and_taxis: {
    label: 'Cars and taxis'
  },

  lgvs: {
    label: 'LGVs'
  },

  all_hgvs: {
    label: 'All HGVs'
  },

  buses_and_coaches: {
    label: 'Buses and coaches'
  },

  two_wheeled_motor_vehicles: {
    label: 'Two-wheeled motor vehicles'
  },

  pedal_cycles: {
    label: 'Pedal cycles'
  }
};

const COMPARISON_METRICS = [
  {
    key: 'cars_and_taxis',
    label: 'Cars and taxis',
    color: [31, 119, 180, 235]
  },
  {
    key: 'lgvs',
    label: 'LGVs',
    color: [255, 127, 14, 235]
  },
  {
    key: 'all_hgvs',
    label: 'All HGVs',
    color: [214, 39, 40, 235]
  },
  {
    key: 'buses_and_coaches',
    label: 'Buses and coaches',
    color: [148, 103, 189, 235]
  },
  {
    key: 'two_wheeled_motor_vehicles',
    label: 'Two-wheeled motor vehicles',
    color: [44, 160, 44, 235]
  },
  {
    key: 'pedal_cycles',
    label: 'Pedal cycles',
    color: [23, 190, 207, 235]
  }
];

let selectedMetric = 'all_motor_vehicles';

function getSelectedMetric() {
  return TRAFFIC_METRICS[selectedMetric];
}

function getMetricValue(row) {
  const value = row[selectedMetric];

  return Number.isFinite(value)
    ? value
    : null;
}

function getMetricRange() {
  const values = allTrafficData
    .map(getMetricValue)
    .filter(value =>
      value !== null && value > 0
    );

  if (values.length === 0) {
    return {
      minimum: 0,
      maximum: 1
    };
  }

  return {
    minimum: Math.min(...values),
    maximum: Math.max(...values)
  };
}

const availableYears = [
  ...new Set(allTrafficData.map(row => row.year))
].sort((a, b) => a - b);

let viewMode = 'single';
let selectedYear = 2025;
let startYear = 2022;
let endYear = 2025;
let highlightedYear = null;
let selectedPointId = null;
let aiMapSelection = null;
let aiResultPoint = null;


const ABSOLUTE_HEIGHT_SCALE = 0.008;
const STACK_HEIGHT_SCALE = 0.0005;
const MISSING_SEGMENT_HEIGHT = 5;
const STACK_SEGMENT_GAP = 1.5;

function getSelectedYearData() {
  return allTrafficData.filter(
    row => row.year === selectedYear
  );
}

function getDirectionYear() {
  if (viewMode === 'single') {
    return selectedYear;
  }

  if (viewMode === 'comparison') {
    return null;
  }

  return highlightedYear;
}

function getSelectedDirectionData() {
  const directionYear = getDirectionYear();

  if (
    selectedPointId === null ||
    directionYear === null
  ) {
    return [];
  }

  return allDirectionData.filter(row =>
    Number(row.count_point_id) ===
      Number(selectedPointId) &&
    Number(row.year) ===
      Number(directionYear)
  );
}

function handlePointClick(info) {
  if (!info.object) {
    return;
  }

  selectedPointId =
    Number(info.object.count_point_id);

  updateVisualization();
}


const app = document.getElementById('app');

if (!app) {
  throw new Error('Cannot find #app element');
}

const CARTO_BASEMAP_KEY =
  import.meta.env.VITE_CARTO_BASEMAP_KEY;

const buildCartoTileUrl =
  subdomain =>
    `https://${subdomain}.basemaps.cartocdn.com/` +
    `light_all/{z}/{x}/{y}.png?key=` +
    encodeURIComponent(
      CARTO_BASEMAP_KEY
    );

const map = new MapLibreMap({
  container: app,

  style: {
    version: 8,

    sources: {
      carto: {
        type: 'raster',
        tiles: [
          buildCartoTileUrl('a'),
          buildCartoTileUrl('b'),
          buildCartoTileUrl('c')
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors © CARTO'
      }
    },

    layers: [
      {
        id: 'carto-basemap',
        type: 'raster',
        source: 'carto'
      }
    ]
  },

  center: [-1.15, 52.953],
  zoom: 11.5,
  pitch: 55,
  bearing: -20,
  antialias: true
});

map.addControl(
  new NavigationControl(),
  'top-right'
);

const TRAFFIC_COLOUR_STOPS = [
  [26, 152, 80],
  [145, 207, 96],
  [255, 255, 178],
  [254, 178, 76],
  [227, 74, 51],
  [103, 0, 31]
];

function interpolateColour(start, end, amount) {
  return [
    Math.round(
      start[0] + (end[0] - start[0]) * amount
    ),
    Math.round(
      start[1] + (end[1] - start[1]) * amount
    ),
    Math.round(
      start[2] + (end[2] - start[2]) * amount
    )
  ];
}

function getTrafficColor(traffic, alpha = 230) {
  if (
    traffic === null ||
    traffic === undefined ||
    !Number.isFinite(traffic)
  ) {
    return [120, 120, 120, 20];
  }

  const {
    minimum,
    maximum
  } = getMetricRange();

  if (minimum === maximum) {
    return [
      ...TRAFFIC_COLOUR_STOPS[
        TRAFFIC_COLOUR_STOPS.length - 1
      ],
      alpha
    ];
  }

  const minimumLog = Math.log1p(minimum);
  const maximumLog = Math.log1p(maximum);

  const trafficLog = Math.log1p(
    Math.max(
      minimum,
      Math.min(traffic, maximum)
    )
  );

  const normalized =
    (trafficLog - minimumLog) /
    (maximumLog - minimumLog);

  const scaled =
    normalized *
    (TRAFFIC_COLOUR_STOPS.length - 1);

  const lowerIndex = Math.floor(scaled);

  const upperIndex = Math.min(
    lowerIndex + 1,
    TRAFFIC_COLOUR_STOPS.length - 1
  );

  const amount = scaled - lowerIndex;

  const colour = interpolateColour(
    TRAFFIC_COLOUR_STOPS[lowerIndex],
    TRAFFIC_COLOUR_STOPS[upperIndex],
    amount
  );

  return [
    colour[0],
    colour[1],
    colour[2],
    alpha
  ];
}

function createSelectedPointLayer(data) {
  if (selectedPointId === null) {
    return null;
  }

  const selectedRecord = data.find(
    row =>
      row.count_point_id ===
      selectedPointId
  );

  if (!selectedRecord) {
    return null;
  }

  return new ScatterplotLayer({
    id: `selected-point-${selectedPointId}`,

    data: [selectedRecord],

    pickable: false,
    filled: false,
    stroked: true,

    radiusUnits: 'meters',
    getRadius: 43,

    getPosition: row => [
      row.longitude,
      row.latitude
    ],

    getLineColor: [0, 145, 255, 255],

    getLineWidth: 4,
    lineWidthUnits: 'pixels'
  });
}

function createAiSelectionLayers() {
  if (!aiMapSelection?.location) {
    return [];
  }

  const {
    location,
    countPointId,
    radiusMetres = 1000
  } = aiMapSelection;

  const position = [
    location.longitude,
    location.latitude
  ];

  // Point query: show an outer cyan ring.
  if (countPointId !== null) {
    return [
      new ScatterplotLayer({
        id: `ai-query-point-${countPointId}`,
        data: [{position}],
        pickable: false,
        filled: false,
        stroked: true,
        radiusUnits: 'meters',
        getRadius: 70,
        getPosition: row => row.position,
        getLineColor: [0, 210, 255, 255],
        getLineWidth: 5,
        lineWidthUnits: 'pixels'
      })
    ];
  }

  // Area query: show the search radius and its centre.
  return [
    new ScatterplotLayer({
      id: 'ai-query-area',
      data: [{position}],
      pickable: false,
      filled: true,
      stroked: true,
      radiusUnits: 'meters',
      getRadius: radiusMetres,
      getPosition: row => row.position,
      getFillColor: [0, 145, 255, 35],
      getLineColor: [0, 145, 255, 220],
      getLineWidth: 3,
      lineWidthUnits: 'pixels'
    }),

    new ScatterplotLayer({
      id: 'ai-query-area-centre',
      data: [{position}],
      pickable: false,
      filled: true,
      stroked: true,
      radiusUnits: 'meters',
      getRadius: 24,
      getPosition: row => row.position,
      getFillColor: [0, 145, 255, 230],
      getLineColor: [255, 255, 255, 255],
      getLineWidth: 2,
      lineWidthUnits: 'pixels'
    })
  ];
}

function createAiResultLayers() {
  if (
    !aiResultPoint ||
    !Number.isFinite(
      aiResultPoint.longitude
    ) ||
    !Number.isFinite(
      aiResultPoint.latitude
    )
  ) {
    return [];
  }

  return [
    new ScatterplotLayer({
      id:
        `ai-result-ring-` +
        `${aiResultPoint.countPointId}-` +
        `${aiResultPoint.year}`,

      data: [aiResultPoint],

      pickable: false,
      filled: true,
      stroked: true,

      radiusUnits: 'meters',
      getRadius: 82,

      getPosition: point => [
        point.longitude,
        point.latitude
      ],

      getFillColor: [
        255,
        190,
        0,
        45
      ],

      getLineColor: [
        255,
        174,
        0,
        255
      ],

      getLineWidth: 6,
      lineWidthUnits: 'pixels'
    }),

    new ScatterplotLayer({
      id:
        `ai-result-centre-` +
        `${aiResultPoint.countPointId}-` +
        `${aiResultPoint.year}`,

      data: [aiResultPoint],

      pickable: false,
      filled: true,
      stroked: true,

      radiusUnits: 'meters',
      getRadius: 25,

      getPosition: point => [
        point.longitude,
        point.latitude
      ],

      getFillColor: [
        255,
        174,
        0,
        245
      ],

      getLineColor: [
        255,
        255,
        255,
        255
      ],

      getLineWidth: 2,
      lineWidthUnits: 'pixels'
    })
  ];
}

const DIRECTION_BEARINGS = {
  N: 0,
  E: 90,
  S: 180,
  W: 270
};

const ROAD_AXIS_BEARING_MAX_DISTANCE_METRES = 30;

const ROAD_AXIS_SITES_BY_POINT =
  ROAD_AXIS_BEARING_SITES.reduce((index, site) => {
    const pointId = String(site.countPointId);

    if (!index[pointId]) {
      index[pointId] = [];
    }

    index[pointId].push(site);
    return index;
  }, {});

function normalizeBearing(bearing) {
  return ((bearing % 360) + 360) % 360;
}

function angularDifference(first, second) {
  return Math.abs(
    ((first - second + 540) % 360) - 180
  );
}

function coordinateDistanceMetres(
  firstLongitude,
  firstLatitude,
  secondLongitude,
  secondLatitude
) {
  const latitudeRadians =
    ((firstLatitude + secondLatitude) / 2) *
    Math.PI / 180;

  const eastMetres =
    (secondLongitude - firstLongitude) *
    111320 * Math.cos(latitudeRadians);

  const northMetres =
    (secondLatitude - firstLatitude) * 110540;

  return Math.hypot(eastMetres, northMetres);
}

function getRoadAxisSite(row) {
  const candidates =
    ROAD_AXIS_SITES_BY_POINT[
      String(row.count_point_id)
    ] || [];

  let nearestSite = null;
  let nearestDistance = Infinity;

  for (const site of candidates) {
    const distance = coordinateDistanceMetres(
      row.longitude,
      row.latitude,
      site.longitude,
      site.latitude
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSite = site;
    }
  }

  if (
    !nearestSite ||
    nearestDistance >
      ROAD_AXIS_BEARING_MAX_DISTANCE_METRES
  ) {
    return null;
  }

  return {
    ...nearestSite,
    pointDistanceMetres: nearestDistance
  };
}

function getDirectionBearing(row) {
  const cardinalBearing =
    DIRECTION_BEARINGS[row.direction_of_travel];

  const roadAxisSite = getRoadAxisSite(row);

  const roadAxisBearing =
    roadAxisSite?.bearing;

  if (!Number.isFinite(roadAxisBearing)) {
    return {
      bearing: cardinalBearing,
      bearingSource: 'cardinal fallback',
      roadAxisBearing: null,
      roadAxisSite: null
    };
  }

  const firstCandidate =
    normalizeBearing(roadAxisBearing);

  const secondCandidate =
    normalizeBearing(roadAxisBearing + 180);

  const bearing =
    angularDifference(
      firstCandidate,
      cardinalBearing
    ) <=
    angularDifference(
      secondCandidate,
      cardinalBearing
    )
      ? firstCandidate
      : secondCandidate;

  return {
    bearing,
    bearingSource:
      `${roadAxisSite.confidence} confidence road axis`,
    roadAxisBearing: firstCandidate,
    roadAxisSite
  };
}


const DIRECTION_ARROW_MIN_LENGTH = 55;
const DIRECTION_ARROW_MAX_LENGTH = 150;
const DIRECTION_ARROW_HEAD_LENGTH = 22;
const DIRECTION_ARROW_HEAD_WIDTH = 18;
const DIRECTION_ARROW_ELEVATION = 8;

function offsetDirectionCoordinate(
  longitude,
  latitude,
  eastMetres,
  northMetres
) {
  const latitudeRadians =
    latitude * Math.PI / 180;

  return [
    longitude +
      eastMetres /
      (
        111320 *
        Math.cos(latitudeRadians)
      ),

    latitude +
      northMetres / 110540,

    DIRECTION_ARROW_ELEVATION
  ];
}

function createDirectionArrowData() {
  const directionRecords =
    getSelectedDirectionData()
      .filter(row =>
        Object.prototype.hasOwnProperty.call(
          DIRECTION_BEARINGS,
          row.direction_of_travel
        )
      )
      .map(row => ({
        ...row,

        directionValue:
          getMetricValue(row)
      }))
      .filter(row =>
        row.directionValue !== null
      );

  const total =
    directionRecords.reduce(
      (sum, row) =>
        sum + row.directionValue,

      0
    );

  if (total <= 0) {
  return [];
}


return directionRecords.map(row => {
  const share =
    row.directionValue / total;

  const {
    bearing,
    bearingSource,
    roadAxisBearing
  } = getDirectionBearing(row);

    const angle =
      bearing * Math.PI / 180;

    const east =
      Math.sin(angle);

    const north =
      Math.cos(angle);

    const rightEast =
      Math.cos(angle);

    const rightNorth =
      -Math.sin(angle);

    const length =
      DIRECTION_ARROW_MIN_LENGTH +
      share *
      (
        DIRECTION_ARROW_MAX_LENGTH -
        DIRECTION_ARROW_MIN_LENGTH
      );

    const tip =
      offsetDirectionCoordinate(
        row.longitude,
        row.latitude,
        east * length,
        north * length
      );

    const headBaseEast =
      east *
      (
        length -
        DIRECTION_ARROW_HEAD_LENGTH
      );

    const headBaseNorth =
      north *
      (
        length -
        DIRECTION_ARROW_HEAD_LENGTH
      );

    const halfHeadWidth =
      DIRECTION_ARROW_HEAD_WIDTH / 2;

    const left =
      offsetDirectionCoordinate(
        row.longitude,
        row.latitude,

        headBaseEast -
          rightEast * halfHeadWidth,

        headBaseNorth -
          rightNorth * halfHeadWidth
      );

    const right =
      offsetDirectionCoordinate(
        row.longitude,
        row.latitude,

        headBaseEast +
          rightEast * halfHeadWidth,

        headBaseNorth +
          rightNorth * halfHeadWidth
      );

    const shaftStart =
      offsetDirectionCoordinate(
        row.longitude,
        row.latitude,
        east * 38,
        north * 38
      );

    return {
        ...row,

        share,
        bearing,
        bearingSource,
        roadAxisBearing,

        path: [
            shaftStart,
            tip
        ],

      head: [
        tip,
        left,
        right
      ]
    };
  });
}

function createDirectionLayers() {
  const arrowData =
    createDirectionArrowData();

  if (arrowData.length === 0) {
    return [];
  }

  const directionYear =
    getDirectionYear();

  return [
    new PathLayer({
      id:
        `direction-shafts-` +
        `${selectedPointId}-` +
        `${directionYear}-` +
        `${selectedMetric}`,

      data: arrowData,

      pickable: true,

      getPath: row =>
        row.path,

    getColor: row => {
      if (row.bearingSource.startsWith('high')) {
        return [0, 104, 255, 245];
      }

      if (row.bearingSource.startsWith('medium')) {
        return [245, 166, 35, 245];
      }

      return [220, 65, 65, 245];
    },

      getWidth: row =>
        4 + row.share * 7,

      widthUnits: 'pixels',
      widthMinPixels: 4
    }),

    new PolygonLayer({
      id:
        `direction-heads-` +
        `${selectedPointId}-` +
        `${directionYear}-` +
        `${selectedMetric}`,

      data: arrowData,

      pickable: true,
      filled: true,
      stroked: true,

      getPolygon: row =>
        row.head,

    getFillColor: row => {
      if (row.bearingSource.startsWith('high')) {
        return [0, 104, 255, 245];
      }

      if (row.bearingSource.startsWith('medium')) {
        return [245, 166, 35, 245];
      }

      return [220, 65, 65, 245];
    },

      getLineColor: [
        255,
        255,
        255,
        230
      ],

      getLineWidth: 1,
      lineWidthUnits: 'pixels'
    })
  ];
}

function createComparisonData(data) {
  const spacingMetres = 17;
  const centreIndex =
    (COMPARISON_METRICS.length - 1) / 2;

  return data.flatMap(record =>
    COMPARISON_METRICS.map(
      (metric, index) => {
        const value = record[metric.key];
        const position =
          offsetDirectionCoordinate(
            record.longitude,
            record.latitude,
            (index - centreIndex) *
              spacingMetres,
            0
          );

        position[2] = 0;

        return {
          ...record,
          comparisonMetric: metric.key,
          comparisonLabel: metric.label,
          comparisonColor: metric.color,
          comparisonValue:
            Number.isFinite(value)
              ? value
              : null,
          comparisonPosition: position
        };
      }
    )
  );
}

function createComparisonLayers(data) {
  const comparisonData =
  createComparisonData(data);

  const layers = [
    new ScatterplotLayer({
      id: `comparison-bases-${selectedYear}`,
      data,
      pickable: false,
      filled: true,
      stroked: true,
      radiusUnits: 'meters',
      getRadius: 58,
      getPosition: row => [
        row.longitude,
        row.latitude
      ],
      getFillColor: [40, 40, 40, 75],
      getLineColor: [255, 255, 255, 180],
      getLineWidth: 1,
      lineWidthUnits: 'pixels'
    }),

    new ColumnLayer({
      id: `comparison-columns-${selectedYear}`,
      data: comparisonData,
      pickable: true,
      autoHighlight: true,
      onClick: handlePointClick,
      diskResolution: 16,
      radius: 7,
      extruded: true,
      wireframe: false,
      elevationScale: 1,
      getPosition: row =>
        row.comparisonPosition,
      getElevation: row => {
        if (
         row.comparisonValue === null ||
         row.comparisonValue <= 0
         ) {
         return 0;
         }

         return (
         row.comparisonValue *
         ABSOLUTE_HEIGHT_SCALE
  );
},
      getFillColor: row =>
        row.comparisonValue === null
          ? [120, 120, 120, 35]
          : row.comparisonColor,
      getLineColor: [255, 255, 255, 190],
      highlightColor: [255, 255, 0, 190],
      material: {
        ambient: 0.35,
        diffuse: 0.65,
        shininess: 28,
        specularColor: [80, 80, 80]
      }
    })
  ];

  const selectedPointLayer =
    createSelectedPointLayer(data);

  if (selectedPointLayer) {
    layers.push(selectedPointLayer);
  }

  return layers;
}

function createTrafficLayers(data) {
  const layers = [
    new ScatterplotLayer({
      id: `traffic-point-bases-${selectedYear}`,
      data,

      pickable: false,
      filled: true,
      stroked: true,

      radiusUnits: 'meters',
      getRadius: 35,

      getPosition: row => [
        row.longitude,
        row.latitude
      ],

      getFillColor: [40, 40, 40, 100],
      getLineColor: [255, 255, 255, 180],

      getLineWidth: 1,
      lineWidthUnits: 'pixels'
    }),

    new ColumnLayer({
      id: `traffic-columns-${selectedYear}`,
      data,

      pickable: true,
      autoHighlight: true,
      onClick: handlePointClick,

      diskResolution: 20,
      radius: 30,
      extruded: true,
      wireframe: false,

      elevationScale: 1,

      getPosition: row => [
        row.longitude,
        row.latitude
      ],

      getElevation: row => {
      const value = getMetricValue(row);

      return value === null
         ? 0
         : value * ABSOLUTE_HEIGHT_SCALE;
      },

      getFillColor: row =>
       getTrafficColor(getMetricValue(row)),

      getLineColor: [255, 255, 255, 180],
      highlightColor: [255, 255, 0, 180],

      material: {
        ambient: 0.35,
        diffuse: 0.65,
        shininess: 32,
        specularColor: [80, 80, 80]
      },

      updateTriggers: {
        getElevation: [
          selectedYear,
          selectedMetric
        ],

        getFillColor: [
          selectedYear,
          selectedMetric
        ]
      }
    })
  ];
  const selectedPointLayer =
    createSelectedPointLayer(data);

  if (selectedPointLayer) {
    layers.push(selectedPointLayer);
  }
    layers.push(
     ...createDirectionLayers()
  );
  return layers;
}

function createStackedData() {
  const selectedRecords = allTrafficData.filter(
    row =>
      row.year >= startYear &&
      row.year <= endYear
  );

  const recordsByPoint = new Map();

  for (const record of selectedRecords) {
    if (!recordsByPoint.has(record.count_point_id)) {
      recordsByPoint.set(
        record.count_point_id,
        []
      );
    }

    recordsByPoint
      .get(record.count_point_id)
      .push(record);
  }

  const years = [];

//
  for (
    let year = endYear;
    year >= startYear;
    year--
  ) {
    years.push(year);
  }

  const pointBases = [];
  const stackedSegments = [];

  for (
    const [countPointId, records]
    of recordsByPoint
  ) {
    const sortedRecords = [...records].sort(
      (a, b) => a.year - b.year
    );

    //
    const latestRecord =
      sortedRecords[sortedRecords.length - 1];

    const recordByYear = new Map(
      records.map(record => [
        record.year,
        record
      ])
    );

    pointBases.push({
      ...latestRecord,
      count_point_id: countPointId
    });

    let baseElevation = 0;

    for (
      let index = 0;
      index < years.length;
      index++
    ) {
      const year = years[index];
      const record = recordByYear.get(year);
      const isMissing = !record;

      const metricValue = record
        ? getMetricValue(record)
        : null;

      const segmentHeight =
        isMissing || metricValue === null
          ? MISSING_SEGMENT_HEIGHT
          : metricValue * STACK_HEIGHT_SCALE;

      stackedSegments.push({
        ...(record || latestRecord),

        count_point_id: countPointId,
        year,

        longitude: latestRecord.longitude,
        latitude: latestRecord.latitude,

        baseElevation,
        segmentHeight,
        isMissing,

        metricValue
      });
      baseElevation += segmentHeight;

      if (index < years.length - 1) {
        baseElevation += STACK_SEGMENT_GAP;
      }
    }
  }

  return {
    pointBases,
    stackedSegments
  };
}

function createStackedLayers() {
  const {
    pointBases,
    stackedSegments
  } = createStackedData();

  const layers = [
    new ScatterplotLayer({
      id:
        `stacked-bases-${startYear}-${endYear}`,

      data: pointBases,

      pickable: false,
      filled: true,
      stroked: true,

      radiusUnits: 'meters',
      getRadius: 35,

      getPosition: row => [
        row.longitude,
        row.latitude
      ],

      getFillColor: [40, 40, 40, 100],
      getLineColor: [255, 255, 255, 180],

      getLineWidth: 1,
      lineWidthUnits: 'pixels'
    }),

    new ColumnLayer({
      id:
        `stacked-columns-${startYear}-${endYear}`,

      data: stackedSegments,

      pickable: true,
      autoHighlight: true,
      onClick: handlePointClick,

      diskResolution: 20,
      radius: 30,
      extruded: true,
      wireframe: false,

      getPosition: row => [
        row.longitude,
        row.latitude,
        row.baseElevation
      ],

      getElevation: row =>
        row.segmentHeight,

      //
      getFillColor: row => {
        if (row.isMissing) {
          return [120, 120, 120, 20];
        }

        const alpha =
          highlightedYear === null ||
          row.year === highlightedYear
             ? 230
             : 55;

        return getTrafficColor(
          row.metricValue,
          alpha
        );
      },

      highlightColor: [255, 255, 0, 180],

      material: {
        ambient: 0.4,
        diffuse: 0.6,
        shininess: 20,
        specularColor: [60, 60, 60]
      },
        updateTriggers: {
          getFillColor:[
              highlightedYear,
              selectedMetric
          ]
      }
    })
  ];
  const selectedPointLayer =
    createSelectedPointLayer(pointBases);

  if (selectedPointLayer) {
    layers.push(selectedPointLayer);
  }
    layers.push(
     ...createDirectionLayers()
  );
  return layers;
}


function createCurrentLayers() {
  let layers;

  if (viewMode === 'range') {
    layers = createStackedLayers();
  } else if (viewMode === 'comparison') {
    layers = createComparisonLayers(
      getSelectedYearData()
    );
  } else {
    layers = createTrafficLayers(
      getSelectedYearData()
    );
  }

  return [
  ...layers,
  ...createAiSelectionLayers(),
  ...createAiResultLayers()
  ];
}

const deckOverlay = new MapboxOverlay({
  interleaved: false,

  layers: createCurrentLayers(),

  getTooltip: ({object}) => {
  if (!object) {
    return null;
  }

  if (object.comparisonMetric) {
    return {
      text:
        `Count point: ${object.count_point_id}\n` +
        `Year: ${object.year}\n` +
        `Category: ${object.comparisonLabel}\n` +
        `AADF: ${object.comparisonValue
          ?.toLocaleString() ?? 'Not available'}\n` +
        `Height scale: consistent absolute scale`
    };
  }

    if (
    Number.isFinite(object.share) &&
    Number.isFinite(object.directionValue)
  ) {
    return {
      text:
        `Count point: ` +
        `${object.count_point_id}\n` +

        `Year: ${object.year}\n` +

        `Direction: ` +
        `${object.direction_of_travel}\n` +

        `Rendered bearing: ` +
        `${object.bearing.toFixed(1)}°\n` +

        `Bearing source: ` +
        `${object.bearingSource}\n` +

        `${getSelectedMetric().label}: ` +

        `${object.directionValue
          .toLocaleString()}\n` +

        `Directional share: ` +
        `${(object.share * 100)
          .toFixed(1)}%`
    };
  }

  if (object.isMissing) {
    return {
      text:
        `Count point: ${object.count_point_id}\n` +
        `Year: ${object.year}\n` +
        `Status: No AADF record`
    };
  }

  const startJunction =
    object.start_junction_road_name ||
    'Not available';

  const endJunction =
    object.end_junction_road_name ||
    'Not available';

  return {
    text:
      `Count point: ${object.count_point_id}\n` +
      `Year: ${object.year}\n` +
      `Road: ${object.road_name}\n` +
      `Road type: ${object.road_type}\n` +
      `Start junction: ${startJunction}\n` +
      `End junction: ${endJunction}\n` +
      `${getSelectedMetric().label}: ` +
      `${getMetricValue(object)?.toLocaleString() ??
      'Not available'}\n` +
      `Method: ${object.estimation_method}`
  };
}
});

map.on('load', () => {
  map.addControl(deckOverlay);
});

map.on('error', event => {
  console.error(
    'MapLibre error:',
    event.error
  );
});

//DOM

const viewModeSelect =
  document.getElementById('view-mode');

const singleYearControls =
  document.getElementById(
    'single-year-controls'
  );

const rangeYearControls =
  document.getElementById(
    'range-year-controls'
  );

const yearSelect =
  document.getElementById('year-select');

const startYearSelect =
  document.getElementById(
    'start-year-select'
  );

const endYearSelect =
  document.getElementById(
    'end-year-select'
  );

const highlightYearSelect =
  document.getElementById(
    'highlight-year-select'
  );

const displayDescription =
  document.getElementById(
    'display-description'
  );

const visibleCountElement =
  document.getElementById(
    'visible-count'
  );

const missingCountElement =
  document.getElementById(
    'missing-count'
  );

const legendMinElement =
  document.getElementById(
    'legend-min'
  );

const legendMaxElement =
  document.getElementById(
    'legend-max'
  );

const trafficMetricSelect =
  document.getElementById(
    'traffic-metric-select'
  );

const metricDescription =
  document.getElementById(
    'metric-description'
  );

const legendTitleElement =
  document.getElementById(
    'legend-title'
  );

const legendGradientElement =
  document.querySelector('.legend-gradient');

const legendValuesElement =
  document.querySelector('.legend-values');

const legendNoteElement =
  document.querySelector('.legend-note');

const comparisonLegendElement =
  document.getElementById(
    'comparison-legend'
  );


if (
  !trafficMetricSelect ||
  !metricDescription ||
  !legendTitleElement ||
  !legendGradientElement ||
  !legendValuesElement ||
  !legendNoteElement ||
  !comparisonLegendElement ||
  !viewModeSelect ||
  !singleYearControls ||
  !rangeYearControls ||
  !yearSelect ||
  !startYearSelect ||
  !endYearSelect ||
  !highlightYearSelect ||
  !displayDescription ||
  !visibleCountElement ||
  !missingCountElement ||
  !legendMinElement ||
  !legendMaxElement
) {
  throw new Error(
    'Display controls are missing from index.html'
  );
}

for (const metric of COMPARISON_METRICS) {
  const item = document.createElement('div');
  item.className = 'comparison-legend-item';

  const swatch = document.createElement('span');
  swatch.className = 'comparison-legend-swatch';
  swatch.style.backgroundColor =
    `rgb(${metric.color.slice(0, 3).join(',')})`;

  const label = document.createElement('span');
  label.textContent = metric.label;

  item.append(swatch, label);
  comparisonLegendElement.appendChild(item);
}


for (const year of availableYears) {
  const singleOption =
    document.createElement('option');

  singleOption.value = String(year);
  singleOption.textContent = String(year);
  singleOption.selected =
    year === selectedYear;

  yearSelect.appendChild(singleOption);

  const startOption =
    document.createElement('option');

  startOption.value = String(year);
  startOption.textContent = String(year);
  startOption.selected =
    year === startYear;

  startYearSelect.appendChild(startOption);

  const endOption =
    document.createElement('option');

  endOption.value = String(year);
  endOption.textContent = String(year);
  endOption.selected =
    year === endYear;

  endYearSelect.appendChild(endOption);
}

function updateHighlightYearOptions() {
  const rangeYears = availableYears.filter(
    year =>
      year >= startYear &&
      year <= endYear
  );

  if (
    highlightedYear !== null &&
    !rangeYears.includes(highlightedYear)
  ) {
    highlightedYear = null;
  }

  highlightYearSelect.replaceChildren();

  const noneOption =
    document.createElement('option');

  noneOption.value = '';
  noneOption.textContent = 'None';
  noneOption.selected =
    highlightedYear === null;

  highlightYearSelect.appendChild(
    noneOption
  );

  for (const year of rangeYears) {
    const option =
      document.createElement('option');

    option.value = String(year);
    option.textContent = String(year);
    option.selected =
      year === highlightedYear;

    highlightYearSelect.appendChild(
      option
    );
  }
}

function updateMetricInformation() {
  const isComparison =
    viewMode === 'comparison';

  trafficMetricSelect.disabled = isComparison;
  legendGradientElement.classList.toggle(
    'hidden',
    isComparison
  );
  legendValuesElement.classList.toggle(
    'hidden',
    isComparison
  );
  legendNoteElement.classList.toggle(
    'hidden',
    isComparison
  );
  comparisonLegendElement.classList.toggle(
    'hidden',
    !isComparison
  );

  if (isComparison) {
  metricDescription.textContent =
    'Six-category comparison';

  legendTitleElement.textContent =
    'Traffic categories — consistent absolute height';

  return;
}

  const metric = getSelectedMetric();

  const {
    minimum,
    maximum
  } = getMetricRange();

  metricDescription.textContent =
    metric.label;

  legendTitleElement.textContent =
    `${metric.label} - annual average daily flow`;

  legendMinElement.textContent =
    minimum.toLocaleString();

  legendMaxElement.textContent =
    maximum.toLocaleString();
}

function updateVisualization() {
  updateMetricInformation();

  deckOverlay.setProps({
    layers: createCurrentLayers()
  });

  if (viewMode === 'single') {
    const selectedData =
      getSelectedYearData();

    displayDescription.textContent =
      String(selectedYear);

    visibleCountElement.textContent =
      String(selectedData.length);
    missingCountElement.textContent = '0';

    return;
  }

  if (viewMode === 'comparison') {
    const selectedData =
      getSelectedYearData();

    displayDescription.textContent =
      `${selectedYear} - six categories`;
    visibleCountElement.textContent =
      String(selectedData.length);
    missingCountElement.textContent =
      String(
        createComparisonData(selectedData)
          .filter(row =>
            row.comparisonValue === null
          ).length
      );
    return;
  }

  const {
    pointBases,
    stackedSegments
  } = createStackedData();

  const missingCount =
    stackedSegments.filter(
      segment => segment.isMissing
    ).length;

  displayDescription.textContent =
    `${startYear}-${endYear}`;

  visibleCountElement.textContent =
    String(pointBases.length);

  missingCountElement.textContent =
    String(missingCount);
}


trafficMetricSelect.addEventListener(
  'change',
  event => {
    selectedMetric = event.target.value;

    updateVisualization();
  }
);

yearSelect.addEventListener(
  'change',
  event => {
    selectedYear = Number(
      event.target.value
    );

    updateVisualization();
  }
);

viewModeSelect.addEventListener(
  'change',
  event => {
    viewMode = event.target.value;

    singleYearControls.classList.toggle(
      'hidden',
      viewMode === 'range'
    );

    rangeYearControls.classList.toggle(
      'hidden',
      viewMode !== 'range'
    );

    updateVisualization();
  }
);

highlightYearSelect.addEventListener(
  'change',
  event => {
    highlightedYear = event.target.value
      ? Number(event.target.value)
      : null;

    updateVisualization();
  }
);

startYearSelect.addEventListener(
  'change',
  event => {
    startYear = Number(
      event.target.value
    );

    if (startYear > endYear) {
      endYear = startYear;
      endYearSelect.value =
        String(endYear);
    }
    updateHighlightYearOptions();
    updateVisualization();
  }
);

endYearSelect.addEventListener(
  'change',
  event => {
    endYear = Number(
      event.target.value
    );

    if (endYear < startYear) {
      startYear = endYear;
      startYearSelect.value =
        String(startYear);
    }
    updateHighlightYearOptions();
    updateVisualization();
  }
);
updateHighlightYearOptions();
updateVisualization();

setupMapAiAssistant({
  map,
  getTrafficData: () => allTrafficData,
  getYear: () => selectedYear,
  getMetric: () => selectedMetric,

  onSelectionChange: selection => {
  if (!selection) {
    // AI panel closed: remove all AI and point highlights.
    aiMapSelection = null;
    aiResultPoint = null;
    selectedPointId = null;
    updateVisualization();
    return;
  }

  aiMapSelection = selection;

// A new map query invalidates the previous AI result.
  aiResultPoint = null;
  if (selection.countPointId !== null) {
    selectedPointId = Number(
      selection.countPointId
    );
  } else {
    // Area query: remove an old point selection and arrows.
    selectedPointId = null;
  }

  updateVisualization();
 },

   onResultPointSelect: point => {
  if (!point) {
    aiResultPoint = null;
    selectedPointId = null;

    updateVisualization();
    return;
  }

  const longitude =
    Number(point.longitude);

  const latitude =
    Number(point.latitude);

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude)
  ) {
    console.warn(
      'AI result point has invalid coordinates:',
      point
    );
    return;
  }

  aiResultPoint = {
    ...point,
    longitude,
    latitude
  };

  selectedPointId = Number(
    point.countPointId
  );

  updateVisualization();

  map.flyTo({
    center: [
      longitude,
      latitude
    ],

    zoom: Math.max(
      map.getZoom(),
      14
    ),

    duration: 1200,
    essential: true
  });
}
});
