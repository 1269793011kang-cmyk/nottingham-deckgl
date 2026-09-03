import Papa from 'papaparse';

const NUMERIC_FIELDS = [
  'count_point_id',
  'year',
  'easting',
  'northing',
  'latitude',
  'longitude',
  'link_length_km',
  'link_length_miles',
  'pedal_cycles',
  'two_wheeled_motor_vehicles',
  'cars_and_taxis',
  'buses_and_coaches',
  'lgvs',
  'hgvs_2_rigid_axle',
  'hgvs_3_rigid_axle',
  'hgvs_4_or_more_rigid_axle',
  'hgvs_3_or_4_articulated_axle',
  'hgvs_5_articulated_axle',
  'hgvs_6_articulated_axle',
  'all_hgvs',
  'all_motor_vehicles'
];

function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function convertRow(row) {
  const converted = {...row};

  for (const field of NUMERIC_FIELDS) {
    converted[field] = parseNumber(row[field]);
  }

  return converted;
}

function convertDirectionRow(row) {
  const converted = convertRow(row);

  converted.direction_of_travel =
    String(row.direction_of_travel || '')
      .trim()
      .toUpperCase();

  return converted;
}


export async function loadTrafficData() {
  const response = await fetch('/data/aadf_2000_2025_clean.csv');

  if (!response.ok) {
    throw new Error(
      `Unable to load traffic CSV: ${response.status} ${response.statusText}`
    );
  }

  const csvText = await response.text();

  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: header => header.trim()
  });

  if (result.errors.length > 0) {
    console.warn('CSV parsing warnings:', result.errors);
  }

  const rows = result.data
    .map(convertRow)
    .filter(row =>
      row.count_point_id !== null &&
      row.year !== null &&
      row.latitude !== null &&
      row.longitude !== null &&
      row.all_motor_vehicles !== null
    );


  return rows;
}

export async function loadDirectionData() {
  const response = await fetch(
    '/data/aadf_by_direction_2000_2025_clean.csv'
  );

  if (!response.ok) {
    throw new Error(
      `Unable to load direction traffic CSV: ` +
      `${response.status} ` +
      `${response.statusText}`
    );
  }

  const csvText = await response.text();

  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: header =>
      header.trim()
  });

  if (result.errors.length > 0) {
    console.warn(
      'Direction CSV parsing warnings:',
      result.errors
    );
  }

  const rows = result.data
    .map(convertDirectionRow)
    .filter(row =>
      row.count_point_id !== null &&
      row.year !== null &&
      row.latitude !== null &&
      row.longitude !== null &&
      row.direction_of_travel !== '' &&
      row.all_motor_vehicles !== null
    );


  return rows;
}