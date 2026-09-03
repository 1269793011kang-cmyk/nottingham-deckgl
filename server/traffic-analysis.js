import fs from 'node:fs';
import Papa from 'papaparse';

const METRIC_LABELS = {
    all_motor_vehicles: 'All motor vehicles',
    cars_and_taxis: 'Cars and taxis',
    lgvs: 'LGVs',
    all_hgvs: 'All HGVs',
    buses_and_coaches: 'Buses and coaches',
    two_wheeled_motor_vehicles: 'Two-wheeled motor vehicles',
    pedal_cycles: 'Pedal cycles'
};

const METRICS =
    new Set(Object.keys(METRIC_LABELS));

function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function haversineMetres(a, b) {
    const toRadians = degrees => degrees * Math.PI / 180;
    const earthRadius = 6371008.8;
    const latitudeDelta = toRadians(b.latitude - a.latitude);
    const longitudeDelta = toRadians(b.longitude - a.longitude);
    const latitude1 = toRadians(a.latitude);
    const latitude2 = toRadians(b.latitude);
    const value =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(latitude1) * Math.cos(latitude2) *
        Math.sin(longitudeDelta / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(value));
}

function publicPoint(row, metric, extra = {}) {
    return {
      countPointId: row.count_point_id,
      year: row.year,
      roadName: row.road_name,
      roadType: row.road_type,
      latitude: row.latitude,
      longitude: row.longitude,
      value: row[metric],

      estimationMethod:
        row.estimation_method ||
        'Not available',

      ...extra
  };
}

function median(values) {
    if (!values.length) {
        return null;
    }

    const sorted = [...values].sort(
        (a, b) => a - b
    );

    const middle =
        Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
        ? (
        sorted[middle - 1] +
        sorted[middle]
    ) / 2
        : sorted[middle];
}

function round(value, digits = 2) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const factor = 10 ** digits;

    return Math.round(value * factor) /
        factor;
}

//统计异常点-候选,线性趋势残差 + MAD修正Z分数,阈值：|score| ≥ 3.5

export function summariseTrend(
    points
) {
    if (!Array.isArray(points) ||
        points.length === 0) {
        return null;
    }

    const first = points[0];
    const last = points.at(-1);

    const maximum = points.reduce(
        (current, point) =>
            point.value > current.value
                ? point
                : current,
        first
    );

    const minimum = points.reduce(
        (current, point) =>
            point.value < current.value
                ? point
                : current,
        first
    );

    const meanYear =
        points.reduce(
            (sum, point) => sum + point.year,
            0
        ) / points.length;

    const meanValue =
        points.reduce(
            (sum, point) => sum + point.value,
            0
        ) / points.length;

    const regressionNumerator =
        points.reduce(
            (sum, point) =>
                sum +
                (point.year - meanYear) *
                (point.value - meanValue),
            0
        );

    const regressionDenominator =
        points.reduce(
            (sum, point) =>
                sum +
                (point.year - meanYear) ** 2,
            0
        );

    const slopePerYear =
        regressionDenominator === 0
            ? 0
            : regressionNumerator /
            regressionDenominator;

    const intercept =
        meanValue -
        slopePerYear * meanYear;

    const slopePercentPerYear =
        meanValue > 0
            ? slopePerYear / meanValue * 100
            : null;

    let direction = 'stable';

    if (
        Number.isFinite(slopePercentPerYear) &&
        slopePercentPerYear > 0.5
    ) {
        direction = 'increasing';
    } else if (
        Number.isFinite(slopePercentPerYear) &&
        slopePercentPerYear < -0.5
    ) {
        direction = 'decreasing';
    }

    const residuals = points.map(point => ({
        ...point,
        residual:
            point.value -
            (
                intercept +
                slopePerYear * point.year
            )
    }));

    const medianResidual = median(
        residuals.map(point => point.residual)
    );

    const medianAbsoluteDeviation = median(
        residuals.map(point =>
            Math.abs(
                point.residual -
                medianResidual
            )
        )
    );

    const outlierCandidates =
        points.length >= 5 &&
        Number.isFinite(
            medianAbsoluteDeviation
        ) &&
        medianAbsoluteDeviation > 0
            ? residuals
                .map(point => {
                    const score =
                        0.6745 *
                        (
                            point.residual -
                            medianResidual
                        ) /
                        medianAbsoluteDeviation;

                    return {
                        year: point.year,
                        value: point.value,
                        deviationScore:
                            round(score, 2)
                    };
                })
                .filter(point =>
                    Math.abs(
                        point.deviationScore
                    ) >= 3.5
                )
            : [];

    const absoluteChange =
        last.value - first.value;

    const percentChange =
        first.value > 0
            ? absoluteChange /
            first.value * 100
            : null;

    const yearSpan =
        last.year - first.year;

    const annualisedChangePercent =
        yearSpan > 0 &&
        first.value > 0 &&
        last.value > 0
            ? (
            (
                last.value /
                first.value
            ) ** (1 / yearSpan) -
            1
        ) * 100
            : null;

    const recordedYears =
        new Set(
            points.map(point => point.year)
        );

    const missingYears = [];

    for (
        let year = first.year;
        year <= last.year;
        year++
    ) {
        if (!recordedYears.has(year)) {
            missingYears.push(year);
        }
    }

    return {
        startYear: first.year,
        endYear: last.year,
        recordsAvailable: points.length,

        startValue: first.value,
        endValue: last.value,

        absoluteChange,
        percentChange:
            round(percentChange, 2),

        annualisedChangePercent:
            round(
                annualisedChangePercent,
                2
            ),

        linearSlopePerYear:
            round(slopePerYear, 2),

        linearSlopePercentPerYear:
            round(
                slopePercentPerYear,
                2
            ),

        direction,

        maximumYear: maximum.year,
        maximumValue: maximum.value,

        minimumYear: minimum.year,
        minimumValue: minimum.value,

        outlierMethod:
            'Linear-trend residual using modified z-score; threshold 3.5',

        outlierCandidates,
        missingYears
    };
}

function buildHistogram(
    values,
    highlightedPoint = null
) {
    const numericValues = values
        .map(number)
        .filter(value =>
            value !== null &&
            value >= 0
        )
        .sort((a, b) => a - b);

    if (numericValues.length === 0) {
        return null;
    }

    const minimum =
        numericValues[0];

    const maximum =
        numericValues.at(-1);

    const mean =
        numericValues.reduce(
            (sum, value) => sum + value,
            0
        ) / numericValues.length;

    const medianValue =
        median(numericValues);

    let binCount = Math.ceil(
        Math.log2(
            numericValues.length
        ) + 1
    );

    binCount = Math.min(
        10,
        Math.max(5, binCount)
    );

    if (minimum === maximum) {
        binCount = 1;
    }

    const binWidth =
        binCount === 1
            ? 1
            : (
            maximum - minimum
        ) / binCount;

    const bins = Array.from(
        {length: binCount},
        (_, index) => ({
            index,

            lowerBound:
                minimum +
                index * binWidth,

            upperBound:
                index === binCount - 1
                    ? maximum
                    : minimum +
                    (index + 1) *
                    binWidth,

            count: 0
        })
    );

    numericValues.forEach(value => {
        const index =
            minimum === maximum
                ? 0
                : Math.min(
                    Math.floor(
                        (
                            value - minimum
                        ) / binWidth
                    ),
                    binCount - 1
                );

        bins[index].count += 1;
    });

    let highlightedBinIndex = null;

    if (
        highlightedPoint &&
        Number.isFinite(
            highlightedPoint.value
        )
    ) {
        highlightedBinIndex =
            minimum === maximum
                ? 0
                : Math.min(
                    Math.floor(
                        (
                            highlightedPoint.value -
                            minimum
                        ) / binWidth
                    ),
                    binCount - 1
                );
    }

    return {
        sampleSize:
        numericValues.length,

        minimum,
        maximum,

        mean:
            round(mean, 2),

        median:
            round(medianValue, 2),

        binCount,
        binWidth:
            round(binWidth, 2),

        bins: bins.map(bin => ({
            index: bin.index,
            lowerBound:
                round(bin.lowerBound, 2),
            upperBound:
                round(bin.upperBound, 2),
            count: bin.count
        })),

        highlightedPoint:
            highlightedPoint
                ? {
                    countPointId:
                    highlightedPoint
                        .countPointId,

                    roadName:
                    highlightedPoint
                        .roadName,

                    value:
                    highlightedPoint.value,

                    binIndex:
                    highlightedBinIndex
                }
                : null
    };
}

export function loadTrafficRows(csvPath) {
    const text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: header => header.trim()
    });

    if (parsed.errors.length) {
        console.warn(
            `Traffic CSV contains ${parsed.errors.length} row-level parsing warning(s); ` +
            'valid rows will still be loaded.'
        );
    }

    const numericFields = [
        'count_point_id', 'year', 'latitude', 'longitude', ...METRICS
    ];

    return parsed.data.map(source => {
        const row = {...source};
        for (const field of numericFields) row[field] = number(row[field]);
        return row;
    }).filter(row =>
        row.count_point_id !== null && row.year !== null &&
        row.latitude !== null && row.longitude !== null
    );
}

export function analyseTraffic(rows, request) {
    const metric = METRICS.has(request.metric)
        ? request.metric
        : 'all_motor_vehicles';
    const requestedYear = number(request.year);
    const availableYears = [...new Set(rows.map(row => row.year))].sort((a, b) => a - b);
    const year = availableYears.includes(requestedYear)
        ? requestedYear
        : availableYears.at(-1);
    const pointId = number(request.countPointId);
    const location = request.location && {
        latitude: number(request.location.latitude),
        longitude: number(request.location.longitude)
    };
    const radiusMetres = Math.min(Math.max(number(request.radiusMetres) ?? 1000, 100), 10000);

    const yearRows = rows
        .filter(row => row.year === year && number(row[metric]) !== null)
        .sort((a, b) => b[metric] - a[metric]);
    const maximum = yearRows[0] ?? null;
    const topPoints =
          yearRows.slice(0, 5);
    const selected = pointId === null
        ? null
        : yearRows.find(row => row.count_point_id === pointId) ?? null;
    const selectedRank = selected
        ? yearRows.findIndex(row => row.count_point_id === selected.count_point_id) + 1
        : null;
    const higherPoints = selected
        ? yearRows.filter(row => row[metric] > selected[metric]).slice(0, 10)
        : [];

    const hasValidLocation =
        Number.isFinite(location?.latitude) &&
        Number.isFinite(location?.longitude);

    const nearbyMatches = hasValidLocation
        ? yearRows
            .map(row => ({
                row,
                distanceMetres:
                    haversineMetres(location, row)
            }))
            .filter(item =>
                item.distanceMetres <= radiusMetres
            )
            .sort((a, b) =>
                b.row[metric] - a.row[metric]
            )
        : [];

// Keep the total count before limiting the
// detailed records sent to the AI.
    const nearbyPoints =
        nearbyMatches.slice(0, 20);

    const areaMaximum =
        nearbyMatches[0] ?? null;

    const wholeMapHistogram =
        buildHistogram(
            yearRows.map(
                row => row[metric]
            ),

            selected
                ? {
                    countPointId:
                    selected.count_point_id,

                    roadName:
                    selected.road_name,

                    value:
                        selected[metric]
                }
                : null
        );

    const radiusAreaHistogram =
        buildHistogram(
            nearbyMatches.map(
                item => item.row[metric]
            ),

            areaMaximum
                ? {
                    countPointId:
                    areaMaximum.row
                        .count_point_id,

                    roadName:
                    areaMaximum.row
                        .road_name,

                    value:
                        areaMaximum.row[metric]
                }
                : null
        );

    const trend = selected
        ? rows
            .filter(row =>
                row.count_point_id ===
                selected.count_point_id &&
                row.year <= year &&
                number(row[metric]) !== null
            )
            .sort((a, b) =>
                a.year - b.year
            )
            .map(row => ({
                year: row.year,
                value: row[metric]
            }))
        : [];

    const recentTenYearTrend =
        trend.filter(point =>
            point.year >= year - 9
        );

    const trendSummary =
        summariseTrend(trend);

    const recentTenYearSummary =
        summariseTrend(
            recentTenYearTrend
        );

    return {
        scope: {
            scopeMode: selected
                ? 'selected-point'
                : 'radius-area',

            year,
            metric,
            metricLabel: METRIC_LABELS[metric],

            // Total points across the whole map.
            pointsInYear: yearRows.length,

            // Total points inside the selected radius.
            pointsInRadius: nearbyMatches.length,

            radiusMetres,

            availableYearRange: [
                availableYears[0],
                availableYears.at(-1)
            ]
        },

        selectedPoint: selected
            ? publicPoint(selected, metric, {rank: selectedRank})
            : null,
        maximumPoint: maximum
            ? publicPoint(
                maximum,
                metric,
                {rank: 1}
            )
            : null,

        topPoints:
            topPoints.map(
            (row, index) =>
              publicPoint(
                row,
                metric,
            {rank: index + 1}
            )
         ),

        areaMaximumPoint: areaMaximum
            ? publicPoint(
                areaMaximum.row,
                metric,
                {
                    distanceMetres: Math.round(
                        areaMaximum.distanceMetres
                    )
                }
            )
            : null,

        higherPoints: higherPoints.map((row, index) =>
            publicPoint(row, metric, {
                rank: yearRows.findIndex(item => item.count_point_id === row.count_point_id) + 1
            })
        ),
        nearbyPoints: nearbyPoints.map(item =>
            publicPoint(item.row, metric, {
                distanceMetres: Math.round(item.distanceMetres)
            })
        ),
        trend,
        trendSummary,
        recentTenYearTrend,
        recentTenYearSummary,
        distributionHistograms: {
            wholeMap: wholeMapHistogram,
            radiusArea: radiusAreaHistogram
        }
    };
}

export function deterministicAnswer(analysis, question = '') {
    const format = value =>
        Number(value).toLocaleString('en-GB');

    const {
        scope,
        selectedPoint,
        maximumPoint,
        nearbyPoints,
        trendSummary,
        recentTenYearSummary
    } = analysis;

    const normalizedQuestion =
        question.toLowerCase();

    const asksForTrend =
        /trend|histor|over time|outlier|highest year/.test(
            normalizedQuestion
        );

    if (
        asksForTrend &&
        selectedPoint &&
        recentTenYearSummary
    ) {
        const summary =
            normalizedQuestion.includes(
                'highest year'
            )
                ? trendSummary
                : recentTenYearSummary;

        if (!summary) {
            return `There are not enough historical records to analyse a trend for count point ${selectedPoint.countPointId}.`;
        }

        const percentText =
            Number.isFinite(
                summary.percentChange
            )
                ? `${summary.percentChange >= 0
                    ? '+'
                    : ''}${summary.percentChange}%`
                : 'not available';

        const outlierText =
            summary.outlierCandidates.length
                ? ` Statistical outlier candidates: ${
                    summary.outlierCandidates
                        .map(point =>
                            `${point.year} (${format(
                                point.value
                            )})`
                        )
                        .join(', ')
                }.`
                : ' No statistical outlier candidate was detected.';

        const missingText =
            summary.missingYears.length
                ? ` Missing years: ${
                    summary.missingYears.join(', ')
                }.`
                : '';

        return `Count point ${
            selectedPoint.countPointId
        } on ${
            selectedPoint.roadName
        } shows a ${
            summary.direction
        } trend from ${
            summary.startYear
        } to ${
            summary.endYear
        }. Traffic changed from ${
            format(summary.startValue)
        } to ${
            format(summary.endValue)
        } vehicles per day (${
            percentText
        }). The highest available value was ${
            format(summary.maximumValue)
        } in ${
            summary.maximumYear
        }.${outlierText}${missingText}`;
    }

    if (selectedPoint && maximumPoint) {
        if (selectedPoint.rank === 1) {
            return `Yes. Count point ${selectedPoint.countPointId} on ${selectedPoint.roadName} has the highest ${scope.metricLabel.toLowerCase()} value in ${scope.year}: ${format(selectedPoint.value)} vehicles per day among ${scope.pointsInYear} available points.`;
        }
        const difference = maximumPoint.value - selectedPoint.value;
        return `No. Count point ${selectedPoint.countPointId} ranks ${selectedPoint.rank} of ${scope.pointsInYear} in ${scope.year}, with ${format(selectedPoint.value)} vehicles per day. The highest point is ${maximumPoint.countPointId} on ${maximumPoint.roadName}, with ${format(maximumPoint.value)}—${format(difference)} higher.`;
    }

    if (nearbyPoints.length) {
        const busiest = nearbyPoints[0];

        return `Within ${format(
            scope.radiusMetres
        )} metres of the selected location in ${
            scope.year
        }, ${format(
            scope.pointsInRadius
        )} points are available. The busiest is count point ${
            busiest.countPointId
        } on ${
            busiest.roadName
        }, with ${format(
            busiest.value
        )} vehicles per day.`;
    }

    return `No traffic count point with ${scope.metricLabel.toLowerCase()} data was found for the selected location and ${scope.year}. Try a larger radius or another year.`;
}
