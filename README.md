# Nottingham Traffic Visual Analytics

An interactive web-based visual analytics prototype for exploring long-term road traffic patterns across Nottingham, United Kingdom.

The project combines a 3D traffic map, temporal and spatial comparisons, direction-aware visualisation, deterministic statistical analysis, and a constrained natural-language assistant. It was investigate how urban traffic data can be made easier to explore and interpret.

## Research focus

The system supports three main research questions:

1. How does traffic volume change over time at individual count points and across Nottingham?
2. Where are relatively high- and low-traffic count points located?
3. How do different vehicle categories affect the observed spatial and temporal patterns?


## features

- Interactive MapLibre and deck.gl map centred on Nottingham.
- Single-year and multi-year views covering the available 2000–2025 records.
- 3D columns whose height and colour represent annual average daily traffic (AADF).
- Logarithmic colour encoding for comparing a wide range of traffic volumes.
- Seven traffic metrics:
  - all motor vehicles;
  - cars and taxis;
  - light goods vehicles (LGVs);
  - heavy goods vehicles (HGVs);
  - buses and coaches;
  - two-wheeled motor vehicles;
  - pedal cycles.
- Multi-year stacks, highlighted years, visible-point counts, and missing-observation indicators.
- Point selection with map highlighting and detailed tooltips.
- Directional traffic arrows and a direction comparison view for selected count points.
- Road-aligned arrow bearings derived from OS Open Roads geometry, with cardinal-direction fallback where a suitable road-axis match is unavailable.
- Right-click queries for either a selected count point or a 1 km map area.
- Suggested questions and free-text natural-language queries.
- Clickable result cards that navigate back to referenced count points.
- Controlled chart generation:
  - traffic trend line charts for a selected point and validated year range;
  - traffic-distribution histograms for a selected year and spatial scope;
  - selected-point versus Nottingham-wide maximum comparison bars;
  - Top 3 or Top 5 ranking bars for supported area and Nottingham-wide scopes.
- Deterministic fallback answers when no OpenAI API key is configured.

## Data

The project uses three main data components:

1. **DfT annual AADF data** — annual average daily traffic estimates by count point and vehicle category from 2000 to 2025.
2. **DfT directional AADF data** — traffic values divided by direction of travel for displaying directional flows.
3. **OS Open Roads geometry** — generalised road-centreline geometry used during preprocessing to derive local road-axis bearings.

Relevant official sources:

- [Department for Transport Road Traffic Statistics](https://roadtraffic.dft.gov.uk/)
- [DfT Road Traffic API documentation](https://roadtraffic.dft.gov.uk/api-documentation)
- [OS Open Roads](https://osdatahub.os.uk/downloads/open/OpenRoads)


## Technology stack

- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) — basemap rendering and map interaction.
- [deck.gl](https://deck.gl/) — 3D traffic columns, highlights, and direction layers.
- [Vite](https://vite.dev/) — frontend development and build tooling.
- [Express](https://expressjs.com/) — local analysis API.
- [OpenAI API](https://platform.openai.com/docs/) — optional natural-language explanation.
- [Papa Parse](https://www.papaparse.com/) — CSV parsing.
- CARTO and OpenStreetMap — raster basemap and map data attribution.

## Project structure

```text
nottingham-traffic-ai-local/
├── public/
│   └── data/
│       ├── aadf_2000_2025_clean.csv
│       └── aadf_by_direction_2000_2025_clean.csv
├── server/
│   ├── ask-map.js
│   ├── index.js
│   └── traffic-analysis.js
├── src/
│   ├── data.js
│   ├── generated-road-bearings.js
│   ├── main.js
│   ├── map-ai-ui.js
│   └── style.css
├── .env.example
├── .gitignore
├── index.html
├── package.json
└── vite.config.js
```

## Requirements

- Node.js `20.19.0+` or `22.12.0+`
- npm

- A CARTO Basemaps API key for the raster basemap
- An OpenAI API key only if AI-generated explanations are required

## Installation

Create a local environment file:

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

Configure `.env`:

```env
# Required for the CARTO raster basemap
VITE_CARTO_BASEMAP_KEY=

# Optional: enables OpenAI-generated explanations
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini

# Optional: local API port
PORT=3001
```

## Running the application

Start the Vite frontend and local API together:

```bash
npm run dev:all
```

Then open:

```text
http://localhost:5173
```

To confirm that the local analysis service is running, open:

```text
http://127.0.0.1:3001/api/health
```

The health response reports whether the traffic data loaded successfully and whether OpenAI mode is configured.

## Basic use

1. Choose a traffic metric.
2. Select a single year or a year range.
3. Inspect the 3D columns and map tooltip values.
4. Select a count point to view its details and directional traffic.
5. Right-click a point for point-specific questions, or right-click away from a point to analyse the surrounding 1 km area.
6. Choose a suggested question, enter a free-text question, or use the controlled chart builder.
7. Select a referenced result card to navigate back to that map location.


