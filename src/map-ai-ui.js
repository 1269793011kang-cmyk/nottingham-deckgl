const METRIC_LABELS = {
    all_motor_vehicles: 'All motor vehicles',
    cars_and_taxis: 'Cars and taxis',
    lgvs: 'LGVs',
    all_hgvs: 'All HGVs',
    buses_and_coaches: 'Buses and coaches',
    two_wheeled_motor_vehicles: 'Two-wheeled motor vehicles',
    pedal_cycles: 'Pedal cycles'
};

const POINT_QUESTION_SUGGESTIONS = [
    {
        intent: 'point_busiest',
        label: 'Is this the busiest point?',
        question:
            'Is this the busiest point on the whole Nottingham map?'
    },
    {
        intent: 'point_rank',
        label: 'Show its city-wide rank',
        question:
            'How does this point rank against all other available count points in Nottingham this year?'
    },
    {
        intent: 'point_higher_nearby',
        label: 'Find higher points nearby',
        question:
            'Which traffic count points within 1 km have higher traffic flow than this point?'
    },
    {
        intent: 'point_trend',
        label: 'Explore the 10-year trend',
        question:
            'Do you see any patterns, trends, or outliers in the traffic passing through this point over the last 10 years?'
    },
    {
        intent: 'point_highest_year',
        label: 'Find its highest year',
        question:
            'In which available year did this point record its highest traffic flow, and how does that compare with the current year?'
    },
    {
        intent: 'point_compare_city_max',
        label: 'Compare with city maximum',
        question:
            'How does this point compare with the city-wide maximum traffic point for the selected year?'
    },
    {
        intent: 'point_distribution',
        label: 'Show traffic distribution',
        question:
            'Show the distribution of traffic flow across all Nottingham count points for the selected year, and indicate where this point falls.'
    }
];

const AREA_QUESTION_SUGGESTIONS = [
    {
        intent: 'area_busiest',
        label: 'Find the busiest nearby point',
        question:
            'Which traffic count point has the highest traffic flow within 1 km of this location?'
    },
    {
        intent: 'area_top_five',
        label: 'Show five busiest points',
        question:
            'What are the five busiest traffic count points within 1 km of this location?'
    },
    {
        intent: 'area_compare_city_max',
        label: 'Compare area with city maximum',
        question:
            'How does the busiest point within this 1 km area compare with the city-wide maximum?'
    },
    {
        intent: 'area_contains_city_max',
        label: 'Is the city maximum nearby?',
        question:
            'Is the city-wide maximum traffic point located within this 1 km area?'
    },
    {
        intent: 'area_top_three',
        label: 'Compare nearby roads',
        question:
            'Compare the three busiest nearby roads within this 1 km area.'
    },
    {
        intent: 'area_distribution',
        label: 'Show area distribution',
        question:
            'Show the distribution of traffic flow among count points within this 1 km area.'
    }
];
const POINT_SELECTION_THRESHOLD_METRES = 40;

function distanceMetres(a, b) {
    const latitudeScale = 111320;
    const longitudeScale = latitudeScale * Math.cos(a.latitude * Math.PI / 180);
    return Math.hypot(
        (b.latitude - a.latitude) * latitudeScale,
        (b.longitude - a.longitude) * longitudeScale
    );
}

function formatTrafficValue(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue)
        ? numericValue.toLocaleString('en-GB')
        : 'Not available';
}

function getResultRoleLabel(role) {
    const labels = {
        maximum:
            'City-wide highest traffic point',

        'whole-map-ranking':
            'Nottingham-wide ranked point',

        higher:
            'Higher-traffic point',

        'nearby-higher':
            'Higher nearby point',

        nearby:
            'Nearby point',

        'area-maximum':
            'Highest point in area',

        selected:
            'Selected point'
    };

    return labels[role] || 'Referenced point';
}

const SVG_NAMESPACE =
    'http://www.w3.org/2000/svg';

function createSvgElement(
    name,
    attributes = {},
    text = null
) {
    const element =
        document.createElementNS(
            SVG_NAMESPACE,
            name
        );

    Object.entries(attributes).forEach(
        ([key, value]) => {
            element.setAttribute(
                key,
                String(value)
            );
        }
    );

    if (text !== null) {
        element.textContent = text;
    }

    return element;
}

function createChartSection(chart) {
    const section =
        document.createElement('section');

    section.className =
        'map-ai-chart-section';

    const heading =
        document.createElement('div');

    heading.className =
        'map-ai-chart-heading';

    const title =
        document.createElement('strong');

    title.textContent =
        chart?.title ?? '';

    const subtitle =
        document.createElement('span');

    subtitle.textContent =
        chart?.subtitle ?? '';

    heading.append(title, subtitle);
    section.appendChild(heading);

    return section;
}

function renderTrendChart(
    container,
    chart
) {
    const seriesValues =
        chart?.series?.[0]?.values;

    const points =
        Array.isArray(seriesValues)
            ? seriesValues.map(point => ({
                year: point.x,
                value: point.y
            }))
            : [];

    const summary = {
        startYear:
        chart?.scope?.startYear,

        endYear:
        chart?.scope?.endYear,

        requestedStartYear:
        chart?.scope?.requestedStartYear,

        requestedEndYear:
        chart?.scope?.requestedEndYear,

        maximumYear:
        chart?.annotations
            ?.maximum?.x,

        maximumValue:
        chart?.annotations
            ?.maximum?.y,

        outlierCandidates:
            chart?.annotations
                ?.outliers?.map(point => ({
                year: point.x,
                value: point.y
            })) ?? [],

        missingYears:
            chart?.annotations
                ?.missingYears ?? []
    };

    if (
        points.length < 2 ||
        !Number.isFinite(
            summary.startYear
        ) ||
        !Number.isFinite(
            summary.endYear
        )
    ) {
        return;
    }

    const section =
        createChartSection(chart);

    const width = 640;
    const height = 280;

    const margin = {
        top: 24,
        right: 24,
        bottom: 46,
        left: 72
    };

    const plotWidth =
        width -
        margin.left -
        margin.right;

    const plotHeight =
        height -
        margin.top -
        margin.bottom;

    const firstYear =
        Number.isFinite(
            summary.requestedStartYear
        )
            ? summary.requestedStartYear
            : points[0].year;

    const lastYear =
        Number.isFinite(
            summary.requestedEndYear
        )
            ? summary.requestedEndYear
            : points.at(-1).year;

    const yearSpan =
        Math.max(
            lastYear - firstYear,
            1
        );

    const values =
        points.map(point => point.value);

    // Start at zero to avoid visually
    // exaggerating small changes.
    const maximumValue =
        Math.max(...values);

    const yMaximum =
        maximumValue > 0
            ? maximumValue * 1.1
            : 1;

    const xPosition = year =>
        margin.left +
        (
            (year - firstYear) /
            yearSpan
        ) * plotWidth;

    const yPosition = value =>
        margin.top +
        plotHeight -
        (
            value /
            yMaximum
        ) * plotHeight;

    const svg =
        createSvgElement('svg', {
            viewBox:
                `0 0 ${width} ${height}`,

            role: 'img',

            'aria-label':
                `${chart.title}, ` +
                `${summary.startYear} to ` +
                `${summary.endYear}`
        });

    svg.classList.add(
        'map-ai-trend-chart'
    );

    const yTickCount = 4;

    for (
        let index = 0;
        index <= yTickCount;
        index++
    ) {
        const value =
            yMaximum *
            index /
            yTickCount;

        const y = yPosition(value);

        svg.appendChild(
            createSvgElement('line', {
                x1: margin.left,
                x2: width - margin.right,
                y1: y,
                y2: y,
                class: 'map-ai-chart-grid'
            })
        );

        svg.appendChild(
            createSvgElement(
                'text',
                {
                    x: margin.left - 10,
                    y: y + 4,
                    'text-anchor': 'end',
                    class:
                        'map-ai-chart-axis-label'
                },
                Math.round(value)
                    .toLocaleString('en-GB')
            )
        );
    }

    const xTickCount =
        Math.min(5, yearSpan);

    const tickYears =
        [
            ...new Set(
                Array.from(
                    {
                        length: xTickCount + 1
                    },
                    (_, index) =>
                        Math.round(
                            firstYear +
                            yearSpan *
                            index /
                            xTickCount
                        )
                )
            )
        ];

    tickYears.forEach(year => {
        const x = xPosition(year);

        svg.appendChild(
            createSvgElement('line', {
                x1: x,
                x2: x,
                y1:
                    margin.top + plotHeight,
                y2:
                    margin.top +
                    plotHeight + 5,
                class: 'map-ai-chart-tick'
            })
        );

        svg.appendChild(
            createSvgElement(
                'text',
                {
                    x,
                    y:
                        margin.top +
                        plotHeight + 22,
                    'text-anchor': 'middle',
                    class:
                        'map-ai-chart-axis-label'
                },
                year
            )
        );
    });

    svg.appendChild(
        createSvgElement(
            'text',
            {
                x: 16,
                y: margin.top +
                    plotHeight / 2,
                transform:
                    `rotate(-90 16 ${
                        margin.top +
                        plotHeight / 2
                    })`,
                'text-anchor': 'middle',
                class:
                    'map-ai-chart-axis-title'
            },
            'Vehicles per day'
        )
    );

    // Create separate line segments when
    // one or more years are missing.
    const segments = [];
    let currentSegment = [];

    points.forEach((point, index) => {
        const previous =
            points[index - 1];

        if (
            previous &&
            point.year >
            previous.year + 1
        ) {
            if (currentSegment.length) {
                segments.push(
                    currentSegment
                );
            }

            currentSegment = [];
        }

        currentSegment.push(point);
    });

    if (currentSegment.length) {
        segments.push(currentSegment);
    }

    segments.forEach(segment => {
        if (segment.length < 2) {
            return;
        }

        const polylinePoints =
            segment.map(point =>
                `${xPosition(point.year)},` +
                `${yPosition(point.value)}`
            ).join(' ');

        svg.appendChild(
            createSvgElement(
                'polyline',
                {
                    points: polylinePoints,
                    class:
                        'map-ai-chart-line'
                }
            )
        );
    });

    const outlierYears =
        new Set(
            summary.outlierCandidates.map(
                point => point.year
            )
        );

    points.forEach(point => {
        const isOutlier =
            outlierYears.has(point.year);

        const isMaximum =
            point.year ===
            summary.maximumYear;

        const circle =
            createSvgElement('circle', {
                cx: xPosition(point.year),
                cy: yPosition(point.value),
                r: isOutlier ? 7 : 5,
                class:
                    isOutlier
                        ? 'map-ai-chart-point outlier'
                        : isMaximum
                            ? 'map-ai-chart-point maximum'
                            : 'map-ai-chart-point'
            });

        circle.appendChild(
            createSvgElement(
                'title',
                {},
                `${point.year}: ${
                    point.value.toLocaleString(
                        'en-GB'
                    )
                } vehicles/day${
                    isOutlier
                        ? ' · statistical outlier candidate'
                        : ''
                }`
            )
        );

        svg.appendChild(circle);
    });

    section.appendChild(svg);

    const legend =
        document.createElement('div');

    legend.className =
        'map-ai-chart-legend';

    legend.innerHTML = `
    <span><i class="observed"></i>Observed value</span>
    <span><i class="maximum"></i>Period maximum</span>
    <span><i class="outlier"></i>Outlier candidate</span>
  `;

    section.appendChild(legend);

    const note =
        document.createElement('p');

    note.className =
        'map-ai-chart-note';

    const requestedRange =
        `${firstYear}–${lastYear}`;

    const observedRange =
        `${summary.startYear}–${
            summary.endYear
        }`;

    note.textContent =
        summary.missingYears.length
            ? `Requested range: ${
                requestedRange
            }. Observations available: ${
                observedRange
            }. Missing years: ${
                summary.missingYears.join(', ')
            }. Missing years are left blank, and lines are not connected across internal gaps.`
            : `Complete annual series for ${
                requestedRange
            }.`;

    section.appendChild(note);

    const details =
        document.createElement('details');

    details.className =
        'map-ai-chart-data';

    const detailsTitle =
        document.createElement('summary');

    detailsTitle.textContent =
        'View year-by-year values';

    const table =
        document.createElement('table');

    const tableHead =
        document.createElement('thead');

    tableHead.innerHTML = `
    <tr>
      <th>Year</th>
      <th>Vehicles/day</th>
      <th>Status</th>
    </tr>
  `;

    const tableBody =
        document.createElement('tbody');

    points.forEach(point => {
        const row =
            document.createElement('tr');

        const status =
            outlierYears.has(point.year)
                ? 'Outlier candidate'
                : point.year ===
                summary.maximumYear
                    ? 'Period maximum'
                    : '';

        row.innerHTML = `
      <td>${point.year}</td>
      <td>${
            point.value.toLocaleString(
                'en-GB'
            )
        }</td>
      <td>${status}</td>
    `;

        tableBody.appendChild(row);
    });

    table.append(
        tableHead,
        tableBody
    );

    details.append(
        detailsTitle,
        table
    );

    section.appendChild(details);
    container.appendChild(section);
}

function renderDistributionHistogram(
    container,
    chart
) {
    const histogram = {
        bins:
            chart?.bins ?? [],

        highlightedPoint:
            chart?.highlight ?? null,

        sampleSize:
        chart?.statistics?.sampleSize,

        minimum:
        chart?.statistics?.minimum,

        median:
        chart?.statistics?.median,

        mean:
        chart?.statistics?.mean,

        maximum:
        chart?.statistics?.maximum
    };

    const histogramScope =
        chart?.scope?.type ===
        'radius-area'
            ? 'radiusArea'
            : 'wholeMap';

    if (histogram.bins.length === 0) {
        return;
    }


    const section =
        createChartSection(chart);

    const width = 640;
    const height = 330;

    const margin = {
        top: 24,
        right: 24,
        bottom: 88,
        left: 62
    };

    const plotWidth =
        width -
        margin.left -
        margin.right;

    const plotHeight =
        height -
        margin.top -
        margin.bottom;

    const maximumCount =
        Math.max(
            ...histogram.bins.map(
                bin => bin.count
            ),
            1
        );

    const barSlotWidth =
        plotWidth /
        histogram.bins.length;

    const barWidth =
        barSlotWidth * 0.76;

    const yPosition = count =>
        margin.top +
        plotHeight -
        (
            count /
            maximumCount
        ) * plotHeight;

    const svg =
        createSvgElement('svg', {
            viewBox:
                `0 0 ${width} ${height}`,

            role: 'img',

            'aria-label':
                `${chart.title} · ${chart.subtitle}`
        });

    svg.classList.add(
        'map-ai-histogram-chart'
    );

    const yTickCount = Math.min(
        4,
        maximumCount
    );

    for (
        let index = 0;
        index <= yTickCount;
        index++
    ) {
        const count =
            maximumCount *
            index /
            yTickCount;

        const y = yPosition(count);

        svg.appendChild(
            createSvgElement('line', {
                x1: margin.left,
                x2: width - margin.right,
                y1: y,
                y2: y,
                class: 'map-ai-chart-grid'
            })
        );

        svg.appendChild(
            createSvgElement(
                'text',
                {
                    x: margin.left - 10,
                    y: y + 4,
                    'text-anchor': 'end',
                    class:
                        'map-ai-chart-axis-label'
                },
                Math.round(count)
                    .toLocaleString('en-GB')
            )
        );
    }

    histogram.bins.forEach(
        (bin, index) => {
            const x =
                margin.left +
                index * barSlotWidth +
                (
                    barSlotWidth -
                    barWidth
                ) / 2;

            const y =
                yPosition(bin.count);

            const barHeight =
                margin.top +
                plotHeight -
                y;

            const isHighlighted =
                histogram.highlightedPoint
                    ?.binIndex === bin.index;

            const rectangle =
                createSvgElement('rect', {
                    x,
                    y,
                    width: barWidth,
                    height: Math.max(
                        barHeight,
                        0
                    ),
                    rx: 3,

                    class:
                        isHighlighted
                            ? 'map-ai-histogram-bar highlighted'
                            : 'map-ai-histogram-bar'
                });

            const lower =
                Math.round(
                    bin.lowerBound
                ).toLocaleString('en-GB');

            const upper =
                Math.round(
                    bin.upperBound
                ).toLocaleString('en-GB');

            rectangle.appendChild(
                createSvgElement(
                    'title',
                    {},
                    `${lower}–${upper} vehicles/day: ${bin.count} points`
                )
            );

            svg.appendChild(rectangle);

            const labelX =
                x + barWidth / 2;

            const labelY =
                margin.top +
                plotHeight + 18;

            svg.appendChild(
                createSvgElement(
                    'text',
                    {
                        x: labelX,
                        y: labelY,
                        'text-anchor': 'end',

                        transform:
                            `rotate(-35 ${labelX} ${labelY})`,

                        class:
                            'map-ai-chart-axis-label'
                    },
                    `${lower}–${upper}`
                )
            );

            if (bin.count > 0) {
                svg.appendChild(
                    createSvgElement(
                        'text',
                        {
                            x: labelX,
                            y: y - 6,
                            'text-anchor': 'middle',
                            class:
                                'map-ai-histogram-count'
                        },
                        bin.count
                    )
                );
            }
        }
    );

    svg.appendChild(
        createSvgElement(
            'text',
            {
                x: 16,
                y:
                    margin.top +
                    plotHeight / 2,

                transform:
                    `rotate(-90 16 ${
                        margin.top +
                        plotHeight / 2
                    })`,

                'text-anchor': 'middle',
                class:
                    'map-ai-chart-axis-title'
            },
            'Count points'
        )
    );

    section.appendChild(svg);

    const statistics =
        document.createElement('div');

    statistics.className =
        'map-ai-histogram-statistics';

    statistics.innerHTML = `
    <span><strong>Minimum</strong>${
        Math.round(
            histogram.minimum
        ).toLocaleString('en-GB')
    }</span>

    <span><strong>Median</strong>${
        Math.round(
            histogram.median
        ).toLocaleString('en-GB')
    }</span>

    <span><strong>Mean</strong>${
        Math.round(
            histogram.mean
        ).toLocaleString('en-GB')
    }</span>

    <span><strong>Maximum</strong>${
        Math.round(
            histogram.maximum
        ).toLocaleString('en-GB')
    }</span>
  `;

    section.appendChild(statistics);

    if (histogram.highlightedPoint) {
        const note =
            document.createElement('p');

        note.className =
            'map-ai-chart-note';

        note.textContent =
            `Highlighted bin contains ${
                histogramScope ===
                'radiusArea'
                    ? 'the area maximum'
                    : 'the selected point'
            }: Point ${
                histogram.highlightedPoint
                    .countPointId
            } on ${
                histogram.highlightedPoint
                    .roadName
            }, ${
                histogram.highlightedPoint
                    .value.toLocaleString(
                    'en-GB'
                )
            } vehicles/day.`;

        section.appendChild(note);
    }

    const details =
        document.createElement('details');

    details.className =
        'map-ai-chart-data';

    const detailsTitle =
        document.createElement('summary');

    detailsTitle.textContent =
        'View histogram bins';

    const table =
        document.createElement('table');

    const tableHead =
        document.createElement('thead');

    tableHead.innerHTML = `
    <tr>
      <th>Traffic range</th>
      <th>Points</th>
    </tr>
  `;

    const tableBody =
        document.createElement('tbody');

    histogram.bins.forEach(bin => {
        const row =
            document.createElement('tr');

        const lower =
            Math.round(
                bin.lowerBound
            ).toLocaleString('en-GB');

        const upper =
            Math.round(
                bin.upperBound
            ).toLocaleString('en-GB');

        row.innerHTML = `
      <td>${lower}–${upper}</td>
      <td>${bin.count}</td>
    `;

        tableBody.appendChild(row);
    });

    table.append(
        tableHead,
        tableBody
    );

    details.append(
        detailsTitle,
        table
    );

    section.appendChild(details);
    container.appendChild(section);
}

function renderRankingBarChart(
    container,
    chart
) {
    const bars =
        Array.isArray(chart?.bars)
            ? chart.bars
                .filter(bar =>
                    Number.isFinite(
                        Number(bar.value)
                    )
                )
                .map(bar => ({
                    ...bar,
                    value: Number(bar.value)
                }))
            : [];

    if (bars.length === 0) {
        return;
    }

    const section =
        createChartSection(chart);

    const width = 640;
    const rowHeight = 52;

    const margin = {
        top: 20,
        right: 90,
        bottom: 52,
        left: 215
    };

    const plotWidth =
        width -
        margin.left -
        margin.right;

    const plotHeight =
        bars.length * rowHeight;

    const height =
        margin.top +
        plotHeight +
        margin.bottom;

    const maximumValue =
        Math.max(
            ...bars.map(bar =>
                bar.value
            ),
            1
        );

    const xPosition = value =>
        margin.left +
        (
            value /
            maximumValue
        ) * plotWidth;

    const svg =
        createSvgElement('svg', {
            viewBox:
                `0 0 ${width} ${height}`,

            role: 'img',

            'aria-label':
                `${chart.title}. ${chart.subtitle}`
        });

    svg.classList.add(
        'map-ai-ranking-chart'
    );

    const tickCount = 4;

    for (
        let index = 0;
        index <= tickCount;
        index++
    ) {
        const value =
            maximumValue *
            index /
            tickCount;

        const x =
            xPosition(value);

        svg.appendChild(
            createSvgElement('line', {
                x1: x,
                x2: x,
                y1: margin.top,
                y2:
                    margin.top +
                    plotHeight -
                    12,
                class: 'map-ai-chart-grid'
            })
        );

        svg.appendChild(
            createSvgElement(
                'text',
                {
                    x,
                    y:
                        margin.top +
                        plotHeight +
                        10,

                    'text-anchor': 'middle',

                    class:
                        'map-ai-chart-axis-label'
                },

                Math.round(value)
                    .toLocaleString('en-GB')
            )
        );
    }

    bars.forEach(
        (bar, index) => {
            const y =
                margin.top +
                index * rowHeight +
                5;

            const barHeight = 28;

            const barWidth =
                Math.max(
                    (
                        bar.value /
                        maximumValue
                    ) * plotWidth,
                    1
                );

            const roadName =
                bar.roadName ||
                'Unnamed road';

            const shortenedRoadName =
                roadName.length > 20
                    ? `${roadName.slice(0, 19)}…`
                    : roadName;

            const estimationMethodText =
                bar.estimationMethod
                    ? `, method: ${
                        bar.estimationMethod
                    }`
                    : '';

            const rectangle =
                createSvgElement('rect', {
                    x: margin.left,
                    y,
                    width: barWidth,
                    height: barHeight,
                    rx: 4,

                    class:
                        (
                            bar.emphasis === true ||
                            (
                                bar.emphasis === undefined &&
                                index === 0
                            )
                        )
                            ? 'map-ai-ranking-bar leading'
                            : 'map-ai-ranking-bar'
                });

            rectangle.appendChild(
                createSvgElement(
                    'title',
                    {},
                    `${bar.label ?? `Rank ${bar.rank}`}: ` +
                    `${roadName}, ` +
                    `Point ${bar.countPointId}, ` +
                    `${bar.value.toLocaleString(
                        'en-GB'
                    )} vehicles/day` +
                    estimationMethodText
                )
            );

            svg.appendChild(rectangle);

            svg.appendChild(
                createSvgElement(
                    'text',
                    {
                        x: margin.left - 12,
                        y: y + 19,
                        'text-anchor': 'end',
                        class:
                            'map-ai-ranking-label'
                    },

                    bar.label
                        ? `${bar.label} · ` +
                        `${shortenedRoadName} · ` +
                        `Point ${bar.countPointId}`
                        : `${bar.rank}. ` +
                        `${shortenedRoadName} · ` +
                        `Point ${bar.countPointId}`
                )
            );

            svg.appendChild(
                createSvgElement(
                    'text',
                    {
                        x:
                            margin.left +
                            barWidth +
                            8,

                        y: y + 19,

                        class:
                            'map-ai-ranking-value'
                    },

                    bar.value.toLocaleString(
                        'en-GB'
                    )
                )
            );
        }
    );

    svg.appendChild(
        createSvgElement(
            'text',
            {
                x:
                    margin.left +
                    plotWidth / 2,

                y: height - 8,

                'text-anchor': 'middle',

                class:
                    'map-ai-chart-axis-title'
            },

            chart.axes?.x?.label ??
            'Vehicles per day'
        )
    );

    section.appendChild(svg);
    container.appendChild(section);
}

function renderChart(
    container,
    chart
) {
    switch (chart.type) {
        case 'line':
            renderTrendChart(
                container,
                chart
            );
            break;

        case 'histogram':
            renderDistributionHistogram(
                container,
                chart
            );
            break;

        case 'bar':
            renderRankingBarChart(
                container,
                chart
            );
            break;

        default:
            console.warn(
                'Unsupported chart type:',
                chart.type
            );
    }
}

function renderCharts(
    container,
    charts
) {
    if (!Array.isArray(charts)) {
        return;
    }

    charts.forEach(chart => {
        renderChart(
            container,
            chart
        );
    });
}

function renderChartRequestSummary(
    container,
    chartRequest
) {
    if (!chartRequest) {
        return;
    }

    const metricLabel =
        METRIC_LABELS[
            chartRequest.metric
            ] ??
        chartRequest.metric;

    let parts;

    if (chartRequest.type === 'line') {
        parts = [
            'Recognised chart request: Trend line',
            metricLabel,

            `${chartRequest.startYear}–${
                chartRequest.endYear
            }`,

            'Selected point'
        ];
    } else if (
        chartRequest.type ===
        'histogram'
    ) {
        parts = [
            'Recognised chart request: Distribution histogram',
            metricLabel,
            String(chartRequest.year),

            chartRequest.scope ===
            'radius-area'
                ? 'Selected 1 km area'
                : 'Whole Nottingham map'
        ];
    } else {
        parts = [
            'Recognised chart request: Comparison bars',
            metricLabel,
            String(chartRequest.year),

            chartRequest.variant ===
            'point-city-comparison'
                ? 'Selected point vs city maximum'
                : chartRequest.variant ===
                'whole-map-ranking'
                    ? `Top ${
                        chartRequest.limit
                    } across Nottingham`
                    : `Top ${
                        chartRequest.limit
                    } in selected 1 km area`
        ];
    }

    const summary =
        document.createElement('p');

    summary.className =
        'map-ai-chart-note';

    summary.textContent =
        parts.join(' · ');

    container.appendChild(summary);
}

function renderAnswer(
    container,
    answerText,
    referencedPoints,
    onResultPointSelect,
    charts,
    chartRequest
) {
    container.replaceChildren();

    const text = document.createElement('p');
    text.className = 'map-ai-answer-text';
    text.textContent = answerText;
    container.appendChild(text);

    renderChartRequestSummary(
        container,
        chartRequest
    );

    renderCharts(
        container,
        charts
    );

    if (
        !Array.isArray(referencedPoints) ||
        referencedPoints.length === 0
    ) {
        return;
    }

    const heading = document.createElement('strong');
    heading.className = 'map-ai-results-heading';
    heading.textContent = 'Map results';
    container.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'map-ai-result-list';

    referencedPoints.forEach(point => {
        const item = document.createElement('div');
        item.className = 'map-ai-result-item';

        const details = document.createElement('div');
        details.className = 'map-ai-result-details';

        const role = document.createElement('span');
        role.className = 'map-ai-result-role';
        role.textContent =
            getResultRoleLabel(point.role);

        const title = document.createElement('strong');
        title.textContent =
            `${point.roadName || 'Unnamed road'} · ` +
            `Point ${point.countPointId}`;

        const metadata = document.createElement('span');

        const parts = [
            `${formatTrafficValue(point.value)} vehicles/day`
        ];

        if (Number.isFinite(point.rank)) {
            parts.push(`rank ${point.rank}`);
        }

        if (point.estimationMethod) {
            parts.push(
                `method: ${point.estimationMethod}`
            );
        }

        if (Number.isFinite(point.distanceMetres)) {
            parts.push(
                `${point.distanceMetres.toLocaleString('en-GB')} m away`
            );
        }

        metadata.textContent = parts.join(' · ');

        details.append(
            role,
            title,
            metadata
        );

        const button = document.createElement('button');
        button.type = 'button';
        button.className =
            'map-ai-locate-button';
        button.textContent = 'View on map';

        button.addEventListener('click', () => {
            onResultPointSelect(point);

            list
                .querySelectorAll(
                    '.map-ai-result-item'
                )
                .forEach(element => {
                    element.classList.remove('active');
                });

            item.classList.add('active');
        });

        item.append(details, button);
        list.appendChild(item);
    });

    container.appendChild(list);
}

function renderQuestionSuggestions(
    container,
    suggestions,
    questionInput,
    onQuestionSelect = () => {
    }
) {
    container.replaceChildren();

    suggestions.forEach(suggestion => {
        const button =
            document.createElement('button');

        button.type = 'button';
        button.dataset.question =
            suggestion.question;
        button.textContent =
            suggestion.label;

        button.addEventListener(
            'click',
            () => {
                questionInput.value =
                    suggestion.question;

                questionInput.dataset.intent =
                    suggestion.intent;

                onQuestionSelect();
                questionInput.focus();
            }
        );

        container.appendChild(button);
    });
}

function createInterface() {
    const panel = document.createElement('aside');
    panel.id = 'map-ai-panel';
    panel.className = 'map-ai-panel hidden';
    panel.innerHTML = `
    <div class="map-ai-header">
      <div><strong>Ask AI about the map</strong><span id="map-ai-context"></span></div>
      <button id="map-ai-close" type="button" aria-label="Close AI panel">×</button>
    </div>
    
    <div
  id="map-ai-suggestions"
  class="map-ai-suggestions"
  aria-label="Suggested questions"
></div>

<details
  id="map-ai-chart-builder"
  class="map-ai-chart-builder"
>
  <summary>Create custom chart</summary>

  <div class="map-ai-chart-controls">
    <label>
      Chart type
      <select id="map-ai-chart-type">
        <option value="line">
          Trend line
        </option>
        <option value="histogram">
          Distribution histogram
        </option>
        <option value="bar">
          Comparison bars
        </option>
      </select>
    </label>

    <label>
      Traffic metric
      <select id="map-ai-chart-metric">
      </select>
    </label>

    <label>
      Scope
      <select id="map-ai-chart-scope">
        <option value="selected-point">
          Selected point
        </option>
        <option value="whole-map">
          Whole Nottingham map
        </option>
        <option value="radius-area">
          Selected 1 km area
        </option>
      </select>
    </label>

    <div
      id="map-ai-chart-year-range"
      class="map-ai-chart-year-range"
    >
      <label>
        Start year
        <select id="map-ai-chart-start-year">
        </select>
      </label>

      <label>
        End year
        <select id="map-ai-chart-end-year">
        </select>
      </label>
    </div>

    <label
      id="map-ai-chart-single-year-control"
      class="hidden"
     >
       Year
       <select id="map-ai-chart-year">
      </select>
    </label>
    
    <label
      id="map-ai-chart-ranking-limit-control"
      class="hidden"
    >
      Number of points

    <select id="map-ai-chart-ranking-limit">
      <option value="3">
        Top 3
      </option>

      <option value="5" selected>
        Top 5
      </option>
    </select>
  </label>

    <button
      id="map-ai-generate-chart"
      type="button"
      class="map-ai-generate-chart"
    >
      Generate chart
    </button>
  </div>
</details>

<form id="map-ai-form">
    
      <label for="map-ai-question">Question</label>
      <textarea id="map-ai-question" maxlength="1000" rows="3" placeholder="Ask about traffic flow, ranking, nearby points, or trends…" required></textarea>
      <div class="map-ai-actions">
        <span id="map-ai-status" role="status"></span>
        <button id="map-ai-submit" type="submit">Ask</button>
      </div>
    </form>
    <div id="map-ai-answer" class="map-ai-answer" aria-live="polite"></div>`;
    document.body.append(panel);
    return panel;
}

export function setupMapAiAssistant({
                                        map,
                                        getTrafficData,
                                        getYear,
                                        getMetric,
                                        onSelectionChange = () => {
                                        },
                                        onResultPointSelect = () => {
                                        }
                                    }) {
    const panel = createInterface();
    const context =
        panel.querySelector('#map-ai-context');

    const suggestions =
        panel.querySelector(
            '#map-ai-suggestions'
        );

    const chartBuilder =
        panel.querySelector(
            '#map-ai-chart-builder'
        );

    const chartType =
        panel.querySelector(
            '#map-ai-chart-type'
        );

    const chartMetric =
        panel.querySelector(
            '#map-ai-chart-metric'
        );

    const chartScope =
        panel.querySelector(
            '#map-ai-chart-scope'
        );

    const chartYearRange =
        panel.querySelector(
            '#map-ai-chart-year-range'
        );

    const chartStartYear =
        panel.querySelector(
            '#map-ai-chart-start-year'
        );

    const chartEndYear =
        panel.querySelector(
            '#map-ai-chart-end-year'
        );

    const chartSingleYearControl =
        panel.querySelector(
            '#map-ai-chart-single-year-control'
        );

    const chartYear =
        panel.querySelector(
            '#map-ai-chart-year'
        );

    const chartRankingLimitControl =
        panel.querySelector(
            '#map-ai-chart-ranking-limit-control'
        );

    const chartRankingLimit =
        panel.querySelector(
            '#map-ai-chart-ranking-limit'
        );

    const generateChartButton =
        panel.querySelector(
            '#map-ai-generate-chart'
        );

    const form =
        panel.querySelector('#map-ai-form');
    const question = panel.querySelector('#map-ai-question');
    question.addEventListener(
        'input',
        () => {
            delete question.dataset.intent;
            pendingChartRequest = null;
        }
    );
    const answer = panel.querySelector('#map-ai-answer');
    const status = panel.querySelector('#map-ai-status');
    const submit = panel.querySelector('#map-ai-submit');
    let selection = null;
    let pendingChartRequest = null;

    Object.entries(
        METRIC_LABELS
    ).forEach(([value, label]) => {
        const option =
            document.createElement('option');

        option.value = value;
        option.textContent = label;

        chartMetric.appendChild(option);
    });

    const chartYears = [
        ...new Set(
            getTrafficData().map(
                row => row.year
            )
        )
    ].sort((a, b) => a - b);

    [
        chartStartYear,
        chartEndYear,
        chartYear
    ].forEach(select => {
        chartYears.forEach(year => {
            const option =
                document.createElement('option');

            option.value = String(year);
            option.textContent =
                String(year);

            select.appendChild(option);
        });
    });

    function updateChartControls() {
        if (!selection) {
            return;
        }

        const hasSelectedPoint =
            selection.countPointId !== null;

        const lineOption =
            chartType.querySelector(
                'option[value="line"]'
            );

        const selectedPointOption =
            chartScope.querySelector(
                'option[value="selected-point"]'
            );

        lineOption.disabled =
            !hasSelectedPoint;

        selectedPointOption.disabled =
            !hasSelectedPoint;

        if (
            !hasSelectedPoint &&
            chartType.value === 'line'
        ) {
            chartType.value = 'histogram';
        }

        const isLine =
            chartType.value === 'line';

        const isHistogram =
            chartType.value ===
            'histogram';

        const isBar =
            chartType.value === 'bar';

        chartYearRange.classList.toggle(
            'hidden',
            !isLine
        );

        chartSingleYearControl
            .classList.toggle(
            'hidden',
            isLine
        );

        if (isLine) {
            chartScope.value =
                'selected-point';

            chartScope.disabled = true;

            chartRankingLimitControl
                .classList.add('hidden');

            return;
        }

        if (isBar) {
            chartScope.disabled = false;

            if (
                !hasSelectedPoint &&
                chartScope.value ===
                'selected-point'
            ) {
                chartScope.value =
                    'radius-area';
            }

            const isSelectedPointComparison =
                hasSelectedPoint &&
                chartScope.value ===
                'selected-point';

            chartRankingLimitControl
                .classList.toggle(
                'hidden',
                isSelectedPointComparison
            );

            return;
        }

        if (isHistogram) {
            chartScope.disabled = false;

            chartRankingLimitControl
                .classList.add('hidden');

            if (
                chartScope.value ===
                'selected-point'
            ) {
                chartScope.value =
                    hasSelectedPoint
                        ? 'whole-map'
                        : 'radius-area';
            }
        }
    }

    chartType.addEventListener(
        'change',
        updateChartControls
    );

    chartScope.addEventListener(
        'change',
        updateChartControls
    );

    panel.querySelector('#map-ai-close').addEventListener(
        'click',
        () => {
            selection = null;
            onSelectionChange(null);
            onResultPointSelect(null);

            panel.classList.add('hidden');
        }
    );

    map.on('contextmenu', event => {
        event.preventDefault?.();
        const year = getYear();
        const metric = getMetric();
        const location = {longitude: event.lngLat.lng, latitude: event.lngLat.lat};
        const candidates = getTrafficData().filter(row => row.year === year);
        const nearest = candidates.map(row => ({row, distance: distanceMetres(location, row)}))
            .sort((a, b) => a.distance - b.distance)[0];
        const selectedPoint = nearest?.distance <= POINT_SELECTION_THRESHOLD_METRES ? nearest.row : null;

        selection = {
            year,
            metric,
            countPointId: selectedPoint?.count_point_id ?? null,
            location,
            radiusMetres: 1000
        };

        pendingChartRequest = null;

        chartType.value =
            selectedPoint
                ? 'line'
                : 'histogram';

        chartMetric.value = metric;

        chartEndYear.value =
            String(year);

        chartYear.value =
            String(year);

        chartRankingLimit.value = '5';

        const preferredStartYear =
            year - 9;

        const startYear =
            chartYears.find(
                candidate =>
                    candidate >= preferredStartYear
            ) ?? chartYears[0];

        chartStartYear.value =
            String(startYear);

        chartScope.value =
            selectedPoint
                ? 'selected-point'
                : 'radius-area';

        chartBuilder.open = false;

        updateChartControls();

        onSelectionChange(selection);

        context.textContent = selectedPoint
            ? `Point ${selectedPoint.count_point_id} · ${selectedPoint.road_name} · ${year}`
            : `Area within 1 km · ${year}`;

        renderQuestionSuggestions(
            suggestions,
            selectedPoint
                ? POINT_QUESTION_SUGGESTIONS
                : AREA_QUESTION_SUGGESTIONS,
            question,
            () => {
                pendingChartRequest = null;
            }
        );

        // Prevent a question from a previous
        // location being submitted accidentally.
        question.value = '';
        delete question.dataset.intent;
        answer.textContent = '';
        status.textContent = '';
        panel.classList.remove('hidden');
        question.focus();
    });

    generateChartButton.addEventListener(
        'click',
        () => {
            if (!selection) {
                return;
            }

            const type =
                chartType.value;

            const metric =
                chartMetric.value;

            const metricLabel =
                METRIC_LABELS[metric];

            if (type === 'line') {
                const startYear =
                    Number(
                        chartStartYear.value
                    );

                const endYear =
                    Number(
                        chartEndYear.value
                    );

                if (startYear >= endYear) {
                    status.textContent =
                        'Start year must be earlier than end year.';

                    return;
                }

                pendingChartRequest = {
                    type: 'line',
                    metric,
                    scope: 'selected-point',
                    startYear,
                    endYear
                };

                question.value =
                    `Plot ${metricLabel} at this ` +
                    `point from ${startYear} to ` +
                    `${endYear}.`;

                question.dataset.intent =
                    'point_trend';
            } else if (
                type === 'histogram'
            ) {
                const year =
                    Number(chartYear.value);

                const scope =
                    chartScope.value;

                pendingChartRequest = {
                    type: 'histogram',
                    metric,
                    scope,
                    year
                };

                question.value =
                    scope === 'radius-area'
                        ? `Show the ${metricLabel} ` +
                        `distribution within this ` +
                        `1 km area in ${year}.`
                        : `Show the ${metricLabel} ` +
                        `distribution across ` +
                        `Nottingham in ${year}.`;

                question.dataset.intent =
                    scope === 'radius-area'
                        ? 'area_distribution'
                        : selection.countPointId !==
                        null
                            ? 'point_distribution'
                            : 'whole_map_distribution';
            } else if (type === 'bar') {
                const year =
                    Number(chartYear.value);

                const hasSelectedPoint =
                    selection.countPointId !== null;

                const scope =
                    chartScope.value;

                if (
                    scope === 'selected-point' &&
                    hasSelectedPoint
                ) {
                    pendingChartRequest = {
                        type: 'bar',

                        variant:
                            'point-city-comparison',

                        metric,
                        scope: 'selected-point',
                        year
                    };

                    question.value =
                        `Compare this point with ` +
                        `the Nottingham city-wide ` +
                        `maximum for ${metricLabel} ` +
                        `in ${year}.`;

                    question.dataset.intent =
                        'point_compare_city_max';
                } else {
                    const limit =
                        Number(
                            chartRankingLimit.value
                        ) === 3
                            ? 3
                            : 5;

                    const isWholeMap =
                        scope === 'whole-map';

                    pendingChartRequest = {
                        type: 'bar',

                        variant:
                            isWholeMap
                                ? 'whole-map-ranking'
                                : 'area-ranking',

                        metric,

                        scope:
                            isWholeMap
                                ? 'whole-map'
                                : 'radius-area',

                        year,
                        limit
                    };

                    question.value =
                        isWholeMap
                            ? `Show the ${limit} busiest ` +
                            `count points across ` +
                            `Nottingham for ${metricLabel} ` +
                            `in ${year}.`
                            : `Show the ${limit} busiest ` +
                            `count points within this ` +
                            `1 km area for ${metricLabel} ` +
                            `in ${year}.`;

                    question.dataset.intent =
                        isWholeMap
                            ? limit === 3
                                ? 'whole_map_top_three'
                                : 'whole_map_top_five'
                            : limit === 3
                                ? 'area_top_three'
                                : 'area_top_five';
                }
            } else {
                return;
            }

            form.requestSubmit();
        }
    );

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!selection) return;

        const chartWasRequested =
            pendingChartRequest !== null;

        submit.disabled = true;
        generateChartButton.disabled = true;

        status.textContent =
            chartWasRequested
                ? 'Generating chart…'
                : 'Analysing data…';

        answer.textContent = '';

        try {
            const response = await fetch('/api/ask-map', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    ...selection,

                    metric:
                        pendingChartRequest?.metric ??
                        selection.metric,

                    year:
                        pendingChartRequest?.type ===
                        'line'
                            ? pendingChartRequest.endYear
                            : pendingChartRequest?.year ??
                            selection.year,

                    question:
                        question.value.trim(),

                    intent:
                        question.dataset.intent || null,

                    chartRequest:
                    pendingChartRequest
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Request failed');


            renderAnswer(
                answer,
                result.answer,
                result.referencedPoints,
                onResultPointSelect,
                result.charts,
                result.chartRequest
            );

            const chartWasReturned =
                Array.isArray(result.charts) &&
                result.charts.length > 0;
            const resolvedChartWasRequested =
                result.chartRequest !== null &&
                typeof result.chartRequest ===
                'object';

            if (
                resolvedChartWasRequested &&
                !chartWasReturned
            ) {
                status.textContent =
                    'No chart is available for the selected scope or year range.';
            } else if (resolvedChartWasRequested) {
                status.textContent =
                    result.mode === 'ai-assisted'
                        ? 'Chart generated · AI-assisted answer'
                        : 'Chart generated · Data analysis answer';
            } else {
                status.textContent =
                    result.mode === 'ai-assisted'
                        ? 'AI-assisted answer'
                        : 'Data analysis answer';
            }

        } catch (error) {
            status.textContent = 'Unavailable';
            answer.textContent = `${error.message}. Confirm that the local Node.js server is running.`;
        } finally {
            submit.disabled = false;
            generateChartButton.disabled = false;
        }
    });


}

