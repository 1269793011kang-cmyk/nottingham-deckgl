import OpenAI from 'openai';
import {
    analyseTraffic,
    deterministicAnswer,
    summariseTrend
} from './traffic-analysis.js';

const SYSTEM_INSTRUCTIONS = `You answer questions about the Nottingham traffic map.
Use only the supplied deterministic analysis. Never invent values, locations, ranks, trends, or road capacity.
When a valid deterministic chart specification is supplied, assume that the interface renders the chart immediately.
Do not ask whether the user wants the chart to be produced, restricted, or reformatted.
Explain missing observations and limitations briefly, but treat the chart request as already confirmed.
Do not say "I can produce" a chart when the chart specification has already been generated.

Respect the scope fields exactly:
- scope.scopeMode "selected-point" means the user right-clicked a count point.
- scope.scopeMode "radius-area" means the user right-clicked a map area.
- scope.pointsInYear is the number of available points across the whole Nottingham map for that year.
- scope.pointsInRadius is the number of points inside the selected radius.
- maximumPoint is the highest point across the whole map.
- topPoints contains up to the five highest traffic count points across the whole Nottingham map for the selected year and metric, ordered by rank.
- estimationMethod is the source AADF estimation method for that individual point record. Do not confuse it with the trend outlier-detection method or histogram method.
- areaMaximumPoint is the highest point inside the selected radius.
- trendSummary describes all available records up to the selected year.
- recentTenYearSummary describes the selected year and previous nine calendar years.
- direction is a deterministic classification based on the linear trend.
- outlierCandidates are statistical candidates, not confirmed errors or causal events.
- missingYears must be mentioned when they materially limit a trend conclusion.

For a radius-area question, use areaMaximumPoint and nearbyPoints by default. Use maximumPoint only when the user explicitly asks for a whole-map or Nottingham-wide comparison.
Never describe pointsInYear as the number of points inside the selected radius.
For trend questions, use the supplied trend summaries rather than estimating values from the raw trend array.
Do not claim that an outlier was caused by a specific event unless that cause is supplied in the data.
Do not interpret traffic flow as road capacity.

Always state the year, metric, and geographic/statistical scope relevant to the answer.
If the evidence does not answer the question, say what is missing.
Do not claim to perform interface actions that are not currently implemented.

The current interface supports plain-text answers, referenced map-point navigation, controlled line charts, controlled histograms, and deterministic ranking bar charts.
A line chart may use a validated custom year range and selected traffic metric for a selected count point.
A histogram may use a selected metric and year, with either whole-map or radius-area scope.
A ranking bar chart may show the three or five busiest count points either inside the selected radius or across the whole Nottingham map. Its scope, ordering, and values are supplied by the deterministic chart specification. Its ordering and values are supplied by the deterministic chart specification.
A comparison bar chart may compare the selected count point with the city-wide maximum for the same metric and year.
When a chart request is supplied, describe its values, metric, years, and scope using the deterministic chart specification.
Do not claim support for unsupported chart types, arbitrary code-generated charts, chart downloads, or transport simulations.
When topPoints is used for a Nottingham-wide ranking request, the analytical scope of the answer is the whole Nottingham map, even if scope.scopeMode records the selected point or radius used to open the interface. Do not present that interface-selection scope as the ranking scope.

When the user asks for nearby points with higher traffic, include only nearbyPoints whose value is greater than selectedPoint.value.
When the user asks for three or five points, return no more than that requested number in the answer.
For radius-area questions, distinguish areaMaximumPoint from maximumPoint.
When comparing an area with the city-wide maximum, describe both locations and do not imply that the city-wide maximum is inside the radius unless the coordinates or point IDs show that it is.
When the user asks for a Nottingham-wide top-three or top-five list, use topPoints and return no more than the requested number.
When the user asks for the statistical or estimation method of a site, report its estimationMethod when available.
Answer concisely in the same language as the user's question.`;


function buildReferencedPoints(
    analysis,
    question,
    intent = '',
    chartRequest = null
) {
    const normalizedQuestion =
        question.toLowerCase();

    const selectedPoint =
        analysis.selectedPoint;

    const tag = (point, role) =>
        point
            ? {
                ...point,
                referenceRole: role
            }
            : null;

    const areaMaximum =
        tag(
            analysis.areaMaximumPoint,
            'area-maximum'
        );

    const cityMaximum =
        tag(
            analysis.maximumPoint,
            'maximum'
        );

    const nearbyPoints =
        analysis.nearbyPoints.map(
            point => tag(point, 'nearby')
        );

    const topPoints =
        (analysis.topPoints ?? []).map(
            point => tag(point, 'whole-map-ranking'
            )
        );

    const effectiveIntent =
        chartRequest?.type === 'line'
            ? 'point_trend'
            : chartRequest?.type ===
            'histogram'
                ? chartRequest.scope ===
                'radius-area'
                    ? 'area_distribution'
                    : selectedPoint
                        ? 'point_distribution'
                        : 'whole_map_distribution'
                : chartRequest?.type === 'bar'
                    ? chartRequest.variant ===
                    'point-city-comparison'
                        ? 'point_compare_city_max'
                        : chartRequest.variant ===
                        'whole-map-ranking'
                            ? chartRequest.limit === 3
                                ? 'whole_map_top_three'
                                : 'whole_map_top_five'
                            : chartRequest.limit === 3
                                ? 'area_top_three'
                                : 'area_top_five'
                    : intent;

    let candidates = [];
    let resultLimit = 5;

    switch (effectiveIntent) {
        case 'whole_map_top_three':
            candidates = topPoints;
            resultLimit = 3;
            break;

        case 'whole_map_top_five':
            candidates = topPoints;
            resultLimit = 5;
            break;
        case 'point_busiest':
        case 'point_compare_city_max':
            candidates = [cityMaximum];
            resultLimit = 1;
            break;

        case 'point_rank':
            candidates = [
                cityMaximum,
                ...analysis.higherPoints.map(
                    point => tag(point, 'higher')
                )
            ];
            resultLimit = 5;
            break;

        case 'point_higher_nearby':
            candidates =
                analysis.nearbyPoints
                    .filter(point =>
                        point.countPointId !==
                        selectedPoint?.countPointId &&
                        point.value >
                        selectedPoint?.value
                    )
                    .map(point =>
                        tag(
                            point,
                            'nearby-higher'
                        )
                    );

            resultLimit = 5;
            break;

        case 'point_trend':
        case 'point_highest_year':
            candidates = [
                tag(
                    selectedPoint,
                    'selected'
                )
            ];
            resultLimit = 1;
            break;

        case 'point_distribution':
            candidates = [
                tag(
                    selectedPoint,
                    'selected'
                )
            ];
            resultLimit = 1;
            break;

        case 'whole_map_distribution':
            candidates = [];
            resultLimit = 0;
            break;

        case 'area_distribution':
            candidates = [
                areaMaximum
            ];
            resultLimit = 1;
            break;

        case 'area_busiest':
            candidates = [areaMaximum];
            resultLimit = 1;
            break;

        case 'area_top_five':
            candidates = [
                areaMaximum,
                ...nearbyPoints
            ];
            resultLimit = 5;
            break;

        case 'area_compare_city_max':
        case 'area_contains_city_max':
            candidates = [
                areaMaximum,
                cityMaximum
            ];
            resultLimit = 2;
            break;

        case 'area_top_three':
            candidates = [
                areaMaximum,
                ...nearbyPoints
            ];
            resultLimit = 3;
            break;

        default: {
            // Fallback for manually typed questions.
            const asksForTrend =
                /trend|histor|outlier|last 10|which available year|highest year|趋势|历史|异常|最高年份/.test(
                    normalizedQuestion
                );

            const asksForNearby =
                /nearby|within|附近|周边|半径/.test(
                    normalizedQuestion
                );

            const asksForHigher =
                /higher|greater|above|更高|超过/.test(
                    normalizedQuestion
                );

            const asksForCityMaximum =
                /city-wide maximum|whole.*map|nottingham-wide|全图|全市/.test(
                    normalizedQuestion
                );

            const asksForThree =
                /\btop\s*3\b|\bthree\b|前三|前\s*3|三个/.test(
                    normalizedQuestion
                );

            const asksForFive =
                /\btop\s*5\b|\bfive\b|前五|前\s*5|五个/.test(
                    normalizedQuestion
                );

            const asksForRanking =
                /\btop\b|\bbusiest\b|\bhighest\b|排名|最繁忙|最高流量/.test(
                    normalizedQuestion
                );

            const explicitlyAsksForArea =
                /nearby|within|radius|selected area|local area|1\s*km|附近|周边|区域|范围|半径/.test(
                    normalizedQuestion
                );

            const asksForWholeMapRanking =
                (
                    asksForThree ||
                    asksForFive
                ) &&
                asksForRanking &&
                !explicitlyAsksForArea;

            const isArea =
                analysis.scope.scopeMode ===
                'radius-area';

            if (asksForWholeMapRanking) {
                candidates = topPoints;

                resultLimit =
                    asksForThree
                        ? 3
                        : 5;
            } else if (
                asksForTrend &&
                selectedPoint
            ) {
                candidates = [
                    tag(
                        selectedPoint,
                        'selected'
                    )
                ];
                resultLimit = 1;
            } else if (
                isArea &&
                asksForCityMaximum
            ) {
                candidates = [
                    areaMaximum,
                    cityMaximum
                ];
                resultLimit = 2;
            } else if (isArea) {
                candidates = [
                    areaMaximum,
                    ...nearbyPoints
                ];

                resultLimit =
                    /\bthree\b|\b3\b|三个|前三/.test(
                        normalizedQuestion
                    )
                        ? 3
                        : 5;
            } else if (
                asksForNearby &&
                selectedPoint
            ) {
                candidates =
                    analysis.nearbyPoints
                        .filter(point =>
                            point.countPointId !==
                            selectedPoint.countPointId &&
                            (
                                !asksForHigher ||
                                point.value >
                                selectedPoint.value
                            )
                        )
                        .map(point =>
                            tag(
                                point,
                                asksForHigher
                                    ? 'nearby-higher'
                                    : 'nearby'
                            )
                        );
            } else if (
                asksForCityMaximum
            ) {
                candidates = [cityMaximum];
                resultLimit = 1;
            } else {
                candidates = [
                    cityMaximum,

                    ...analysis.higherPoints.map(
                        point =>
                            tag(point, 'higher')
                    )
                ];
            }

            break;
        }
    }

    const referencedPoints = [];
    const usedIds = new Set();

    for (const point of candidates) {
        if (
            !point ||
            usedIds.has(point.countPointId)
        ) {
            continue;
        }

        if (
            !Number.isFinite(point.longitude) ||
            !Number.isFinite(point.latitude)
        ) {
            continue;
        }

        usedIds.add(point.countPointId);

        referencedPoints.push({
            countPointId: point.countPointId,
            roadName: point.roadName,
            roadType: point.roadType,
            year: point.year,
            longitude: point.longitude,
            latitude: point.latitude,
            value: point.value,

            estimationMethod:
                point.estimationMethod ?? null,

            rank: point.rank ?? null,
            distanceMetres:
                point.distanceMetres ?? null,
            metric: analysis.scope.metric,
            metricLabel:
            analysis.scope.metricLabel,
            role: point.referenceRole
        });

        if (
            referencedPoints.length >=
            resultLimit
        ) {
            break;
        }
    }

    return referencedPoints;
}

function inferMetricFromQuestion(
    text,
    fallbackMetric
) {
    const metricPatterns = [
        {
            metric: 'pedal_cycles',
            pattern:
                /\bpedal cycles?\b|\bpedal bikes?\b|\bbicycles?\b|\bcycling\b|自行车|脚踏车/
        },
        {
            metric:
                'two_wheeled_motor_vehicles',
            pattern:
                /\btwo[-\s]?wheeled motor vehicles?\b|\bmotorcycles?\b|\bmotorbikes?\b|两轮机动车|摩托车/
        },
        {
            metric: 'buses_and_coaches',
            pattern:
                /\bbuses?\b|\bcoaches?\b|公交车|巴士|长途客车/
        },
        {
            metric: 'all_hgvs',
            pattern:
                /\ball hgvs?\b|\bhgvs?\b|\bheavy goods vehicles?\b|\bheavy trucks?\b|重型货车|重型车辆/
        },
        {
            metric: 'lgvs',
            pattern:
                /\blgvs?\b|\blight goods vehicles?\b|\blight vans?\b|轻型货车|轻型车辆/
        },
        {
            metric: 'cars_and_taxis',
            pattern:
                /\bcars?(?:\s+and\s+taxis?)?\b|\btaxis?\b|汽车和出租车|小汽车|出租车/
        },
        {
            metric: 'all_motor_vehicles',
            pattern:
                /\ball motor vehicles?\b|\btotal motor traffic\b|所有机动车|全部机动车|机动车总量/
        }
    ];

    const match =
        metricPatterns.find(item =>
            item.pattern.test(text)
        );

    return (
        match?.metric ??
        fallbackMetric
    );
}

function inferChartRequestFromQuestion(
    question,
    source
) {
    const text =
        String(question ?? '')
            .toLowerCase();

    const years = [
        ...text.matchAll(
            /\b(?:19|20)\d{2}\b/g
        )
    ].map(match =>
        Number(match[0])
    );

    const selectedYear =
        Number(source.year);

    const metric =
        inferMetricFromQuestion(
            text,
            source.metric
        );

    const hasSelectedPoint =
        source.countPointId !== null &&
        source.countPointId !==
        undefined;

    const asksToCompare =
        /\bcompare\b|\bcomparison\b|\bversus\b|\bvs\.?\b|比较|对比/.test(
            text
        );

    const mentionsSelectedPoint =
        /\b(?:this|selected|current)\s+(?:count\s+)?point\b|该点|此点|选中点|当前点/.test(
            text
        );

    const mentionsCityMaximum =
        /(?:city(?:-wide)?|nottingham(?:-wide)?|whole\s+(?:nottingham\s+)?map).*(?:maximum|highest)|(?:maximum|highest).*(?:city(?:-wide)?|nottingham(?:-wide)?|whole\s+(?:nottingham\s+)?map)|(?:全市|全图|诺丁汉).*(?:最高|最大)|(?:最高|最大).*(?:全市|全图|诺丁汉)/.test(
            text
        );

    const asksForPointCityComparison =
        hasSelectedPoint &&
        asksToCompare &&
        mentionsSelectedPoint &&
        mentionsCityMaximum;

    const asksForThree =
        /\btop\s*3\b|\bthree\b|前三|前\s*3|三个/.test(
            text
        );

    const asksForFive =
        /\btop\s*5\b|\bfive\b|前五|前\s*5|五个/.test(
            text
        );

    const mentionsRanking =
        /\bbusiest\b|\bhighest(?:[-\s]+traffic)?\b|\btop\b|最繁忙|最高流量|流量最高/.test(
            text
        );

    const mentionsArea =
        /within\s+(?:this\s+)?1\s*km|nearby|radius|selected area|local area|附近|周边|区域|范围|半径/.test(
            text
        );

    const asksForAreaRanking =
        (
            asksForThree ||
            asksForFive
        ) &&
        mentionsRanking &&
        mentionsArea;

    const asksForWholeMapRanking =
        (
            asksForThree ||
            asksForFive
        ) &&
        mentionsRanking &&
        !mentionsArea;

    const asksForHistogram =
        /histogram|distribution|直方图|分布图|流量分布/.test(
            text
        );

    const asksForLine =
        /line\s*(?:chart|graph)|trend|over time|time series|historical|折线图|趋势图|随时间|历年|近\s*10\s*年/.test(
            text
        ) ||
        (
            /\bplot\b|\bdraw\b|\bgraph\b|绘制|画出|生成图/.test(
                text
            ) &&
            years.length >= 2
        );

    if (
        !asksForPointCityComparison &&
        !asksForAreaRanking &&
        !asksForWholeMapRanking &&
        !asksForHistogram &&
        !asksForLine
    ) {
        return null;
    }

    /*
     * Bar-chart checks come before
     * histogram and line checks so that
     * a request such as "bar chart of
     * the top five nearby points" is not
     * mistaken for another chart type.
     */
    if (asksForPointCityComparison) {
        return {
            type: 'bar',

            variant:
                'point-city-comparison',

            metric,
            scope: 'selected-point',

            year:
                years.at(-1) ??
                selectedYear
        };
    }

    if (asksForWholeMapRanking) {
        return {
            type: 'bar',
            variant: 'whole-map-ranking',
            metric,
            scope: 'whole-map',

            year:
                years.at(-1) ??
                selectedYear,

            limit:
                asksForThree
                    ? 3
                    : 5
        };
    }

    if (asksForAreaRanking) {
        return {
            type: 'bar',
            variant: 'area-ranking',

            metric,
            scope: 'radius-area',

            year:
                years.at(-1) ??
                selectedYear,

            limit:
                asksForThree
                    ? 3
                    : 5
        };
    }

    if (asksForHistogram) {
        const asksForWholeMap =
            /whole(?:\s+nottingham)?\s+map|across\s+nottingham|nottingham-wide|city-wide|whole city|全图|全市|整个诺丁汉|诺丁汉全市/.test(
                text
            );

        const asksForRadius =
            /within\s+(?:this\s+)?1\s*km|nearby|radius|selected area|local area|区域|范围|附近|周边|半径/.test(
                text
            );

        const scope =
            asksForWholeMap
                ? 'whole-map'
                : asksForRadius
                    ? 'radius-area'
                    : source.countPointId == null
                        ? 'radius-area'
                        : 'whole-map';

        return {
            type: 'histogram',
            metric,
            scope,

            year:
                years.at(-1) ??
                selectedYear
        };
    }

    const endYear =
        years.at(-1) ??
        selectedYear;

    const startYear =
        years.length >= 2
            ? years[0]
            : Number.isFinite(endYear)
                ? endYear - 9
                : undefined;

    return {
        type: 'line',
        metric,
        scope: 'selected-point',
        startYear,
        endYear
    };
}

function normaliseChartRequest(
    source,
    analysis
) {
    if (
        !source ||
        typeof source !== 'object'
    ) {
        return null;
    }

    const [
        firstAvailableYear,
        lastAvailableYear
    ] =
        analysis.scope
            .availableYearRange;

    const clampYear = (
        value,
        fallback
    ) => {
        const numericValue =
            Number(value);

        if (
            !Number.isFinite(numericValue)
        ) {
            return fallback;
        }

        return Math.min(
            lastAvailableYear,
            Math.max(
                firstAvailableYear,
                Math.round(numericValue)
            )
        );
    };

    if (source.type === 'line') {
        if (!analysis.selectedPoint) {
            return null;
        }

        const requestedStart =
            clampYear(
                source.startYear,
                firstAvailableYear
            );

        const requestedEnd =
            clampYear(
                source.endYear,
                analysis.scope.year
            );

        return {
            type: 'line',

            metric:
            analysis.scope.metric,

            scope: 'selected-point',

            startYear:
                Math.min(
                    requestedStart,
                    requestedEnd
                ),

            endYear:
                Math.max(
                    requestedStart,
                    requestedEnd
                )
        };
    }

    if (
        source.type === 'histogram'
    ) {
        return {
            type: 'histogram',

            metric:
            analysis.scope.metric,

            scope:
                source.scope ===
                'radius-area'
                    ? 'radius-area'
                    : 'whole-map',

            year:
            analysis.scope.year
        };
    }

    if (source.type === 'bar') {
        if (
            source.variant ===
            'point-city-comparison'
        ) {
            if (!analysis.selectedPoint) {
                return null;
            }

            return {
                type: 'bar',

                variant:
                    'point-city-comparison',

                metric:
                analysis.scope.metric,

                scope: 'selected-point',

                year:
                analysis.scope.year
            };
        }

        if (
            source.variant ===
            'whole-map-ranking'
        ) {
            return {
                type: 'bar',
                variant: 'whole-map-ranking',

                metric:
                analysis.scope.metric,

                scope: 'whole-map',

                year:
                analysis.scope.year,

                limit:
                    Number(source.limit) === 3
                        ? 3
                        : 5
            };
        }

        if (
            source.variant ===
            'area-ranking'
        ) {
            return {
                type: 'bar',

                variant: 'area-ranking',

                metric:
                analysis.scope.metric,

                scope: 'radius-area',

                year:
                analysis.scope.year,

                limit:
                    Number(source.limit) === 3
                        ? 3
                        : 5
            };
        }

        return null;
    }

    return null;
}

function buildChartSpecs(
    analysis,
    question,
    intent = '',
    chartRequest = null
) {
    const normalizedQuestion =
        question.toLowerCase();

    const charts = [];

    const wantsTrend =
        chartRequest?.type === 'line' ||
        intent === 'point_trend' ||
        intent === 'point_highest_year' ||
        (
            !intent &&
            /trend|histor|outlier|last 10|highest year|趋势|历史|异常|最高年份/.test(
                normalizedQuestion
            )
        );

    const wantsHistogram =
        chartRequest?.type ===
        'histogram' ||
        intent === 'point_distribution' ||
        intent === 'area_distribution' ||
        intent === 'whole_map_distribution' ||
        (
            !intent &&
            /histogram|distribution|直方图|分布/.test(
                normalizedQuestion
            )
        );

    const areaRankingLimit =
        chartRequest?.type === 'bar' &&
        chartRequest.variant ===
        'area-ranking'
            ? chartRequest.limit
            : intent === 'area_top_three'
                ? 3
                : intent === 'area_top_five'
                    ? 5
                    : null;

    const wholeMapRankingLimit =
        chartRequest?.type === 'bar' &&
        chartRequest.variant ===
        'whole-map-ranking'
            ? chartRequest.limit
            : intent ===
            'whole_map_top_three'
                ? 3
                : intent ===
                'whole_map_top_five'
                    ? 5
                    : null;

    const wantsPointCityComparison =
        (
            chartRequest?.type === 'bar' &&
            chartRequest.variant ===
            'point-city-comparison'
        ) ||
        intent ===
        'point_compare_city_max';

    const linePoints =
        chartRequest?.type === 'line'
            ? analysis.trend.filter(
                point =>
                    point.year >=
                    chartRequest.startYear &&
                    point.year <=
                    chartRequest.endYear
            )
            : analysis.recentTenYearTrend;

    const lineSummary =
        summariseTrend(linePoints);
    const displayedStartYear =
        chartRequest?.type === 'line'
            ? chartRequest.startYear
            : lineSummary?.startYear;

    const displayedEndYear =
        chartRequest?.type === 'line'
            ? chartRequest.endYear
            : lineSummary?.endYear;

    const observedYearSet =
        new Set(
            linePoints.map(point => point.year)
        );

    const displayedMissingYears =
        Number.isFinite(displayedStartYear) &&
        Number.isFinite(displayedEndYear)
            ? Array.from(
                {
                    length:
                        displayedEndYear -
                        displayedStartYear +
                        1
                },
                (_, index) =>
                    displayedStartYear + index
            ).filter(
                year => !observedYearSet.has(year)
            )
            : [];

    if (
        wantsTrend &&
        analysis.selectedPoint &&
        linePoints.length >= 2 &&
        lineSummary
    ) {
        const summary =
            lineSummary;

        charts.push({
            id: 'selected-point-trend',
            type: 'line',

            title:
                `Traffic trend · Point ${
                    analysis.selectedPoint
                        .countPointId
                }`,

            subtitle:
                `${analysis.scope.metricLabel} · ` +
                `${displayedStartYear}–${
                    displayedEndYear
                }`,

            scope: {
                type: 'selected-point',

                countPointId:
                analysis.selectedPoint
                    .countPointId,

                roadName:
                analysis.selectedPoint
                    .roadName,

                startYear:
                summary.startYear,

                endYear:
                summary.endYear,
                requestedStartYear:
                    chartRequest?.type ===
                    'line'
                        ? chartRequest.startYear
                        : summary.startYear,

                requestedEndYear:
                    chartRequest?.type ===
                    'line'
                        ? chartRequest.endYear
                        : summary.endYear
            },

            metric: {
                key:
                analysis.scope.metric,

                label:
                analysis.scope.metricLabel,

                unit: 'vehicles/day'
            },

            axes: {
                x: {
                    field: 'year',
                    label: 'Year'
                },

                y: {
                    field: 'value',
                    label: 'Vehicles per day',
                    zeroBaseline: true
                }
            },

            series: [
                {
                    id: 'observed',
                    label: 'Observed value',

                    values:
                        linePoints.map(point => ({
                            x: point.year,
                            y: point.value
                        }))
                }
            ],

            annotations: {
                maximum: {
                    x: summary.maximumYear,
                    y: summary.maximumValue,
                    label: 'Period maximum'
                },

                outliers:
                    summary
                        .outlierCandidates
                        .map(point => ({
                            x: point.year,
                            y: point.value,
                            label:
                                'Statistical outlier candidate'
                        })),

                missingYears:
                displayedMissingYears
            },

            statistics: {
                direction:
                summary.direction,

                absoluteChange:
                summary.absoluteChange,

                percentChange:
                summary.percentChange,

                annualisedChangePercent:
                summary
                    .annualisedChangePercent,

                linearSlopePerYear:
                summary.linearSlopePerYear
            }
        });
    }

    if (wantsHistogram) {
        const histogramScope =
            chartRequest?.type ===
            'histogram'
                ? chartRequest.scope
                : intent ===
                'area_distribution' ||
                (
                    !intent &&
                    analysis.scope.scopeMode ===
                    'radius-area'
                )
                    ? 'radius-area'
                    : 'whole-map';

        const histogram =
            histogramScope === 'radius-area'
                ? analysis
                    .distributionHistograms
                    ?.radiusArea
                : analysis
                    .distributionHistograms
                    ?.wholeMap;

        if (
            histogram &&
            Array.isArray(histogram.bins) &&
            histogram.bins.length > 0
        ) {
            charts.push({
                id:
                    histogramScope ===
                    'radius-area'
                        ? 'radius-area-distribution'
                        : 'whole-map-distribution',

                type: 'histogram',

                title:
                    histogramScope ===
                    'radius-area'
                        ? 'Traffic distribution · 1 km area'
                        : 'Traffic distribution · Nottingham',

                subtitle:
                    `${analysis.scope.metricLabel} · ` +
                    `${analysis.scope.year} · ` +
                    `${histogram.sampleSize} points`,

                scope: {
                    type: histogramScope,
                    year:
                    analysis.scope.year,

                    radiusMetres:
                        histogramScope ===
                        'radius-area'
                            ? analysis.scope
                                .radiusMetres
                            : null
                },

                metric: {
                    key:
                    analysis.scope.metric,

                    label:
                    analysis.scope.metricLabel,

                    unit: 'vehicles/day'
                },

                axes: {
                    x: {
                        field: 'trafficRange',
                        label: 'Vehicles per day'
                    },

                    y: {
                        field: 'count',
                        label: 'Count points',
                        zeroBaseline: true
                    }
                },

                bins:
                    histogram.bins.map(
                        bin => ({
                            index: bin.index,
                            lowerBound:
                            bin.lowerBound,
                            upperBound:
                            bin.upperBound,
                            count: bin.count
                        })
                    ),

                highlight:
                    histogram.highlightedPoint
                        ? {
                            countPointId:
                            histogram
                                .highlightedPoint
                                .countPointId,

                            roadName:
                            histogram
                                .highlightedPoint
                                .roadName,

                            value:
                            histogram
                                .highlightedPoint
                                .value,

                            binIndex:
                            histogram
                                .highlightedPoint
                                .binIndex
                        }
                        : null,

                statistics: {
                    sampleSize:
                    histogram.sampleSize,

                    minimum:
                    histogram.minimum,

                    median:
                    histogram.median,

                    mean:
                    histogram.mean,

                    maximum:
                    histogram.maximum
                }
            });
        }
    }

    if (areaRankingLimit !== null) {
        const rankingPoints =
            analysis.nearbyPoints.slice(
                0,
                areaRankingLimit
            );

        if (rankingPoints.length > 0) {
            charts.push({
                id:
                    `radius-area-top-${
                        rankingPoints.length
                    }`,

                type: 'bar',
                variant: 'area-ranking',

                title:
                    `Busiest count points · ${
                        analysis.scope.radiusMetres /
                        1000
                    } km area`,

                subtitle:
                    `${analysis.scope.metricLabel} · ` +
                    `${analysis.scope.year} · ` +
                    `top ${rankingPoints.length} of ` +
                    `${analysis.scope.pointsInRadius} points`,

                scope: {
                    type: 'radius-area',
                    year: analysis.scope.year,
                    radiusMetres:
                    analysis.scope.radiusMetres
                },

                metric: {
                    key: analysis.scope.metric,
                    label:
                    analysis.scope.metricLabel,
                    unit: 'vehicles/day'
                },

                axes: {
                    x: {
                        field: 'value',
                        label: 'Vehicles per day',
                        zeroBaseline: true
                    },

                    y: {
                        field: 'point',
                        label: 'Count point'
                    }
                },

                bars:
                    rankingPoints.map(
                        (point, index) => ({
                            rank: index + 1,

                            countPointId:
                            point.countPointId,

                            roadName:
                            point.roadName,

                            value:
                            point.value,

                            estimationMethod:
                            point.estimationMethod,

                            distanceMetres:
                            point.distanceMetres
                        })
                    )
            });
        }
    }

    if (wholeMapRankingLimit !== null) {
        const rankingPoints =
            (analysis.topPoints ?? []).slice(
                0,
                wholeMapRankingLimit
            );

        if (rankingPoints.length > 0) {
            charts.push({
                id:
                    `whole-map-top-${
                        rankingPoints.length
                    }`,

                type: 'bar',
                variant: 'whole-map-ranking',

                title:
                    'Busiest count points · Nottingham',

                subtitle:
                    `${analysis.scope.metricLabel} · ` +
                    `${analysis.scope.year} · ` +
                    `top ${rankingPoints.length} of ` +
                    `${analysis.scope.pointsInYear} points`,

                scope: {
                    type: 'whole-map',
                    year: analysis.scope.year
                },

                metric: {
                    key: analysis.scope.metric,
                    label:
                    analysis.scope.metricLabel,
                    unit: 'vehicles/day'
                },

                axes: {
                    x: {
                        field: 'value',
                        label: 'Vehicles per day',
                        zeroBaseline: true
                    },

                    y: {
                        field: 'point',
                        label: 'Count point'
                    }
                },

                bars:
                    rankingPoints.map(
                        (point, index) => ({
                            rank:
                                point.rank ??
                                index + 1,

                            countPointId:
                            point.countPointId,

                            roadName:
                            point.roadName,

                            value:
                            point.value,

                            estimationMethod:
                            point.estimationMethod
                        })
                    )
            });
        }
    }

    if (
        wantsPointCityComparison &&
        analysis.selectedPoint &&
        analysis.maximumPoint
    ) {
        const selectedPoint =
            analysis.selectedPoint;

        const cityMaximum =
            analysis.maximumPoint;

        charts.push({
            id:
                'selected-point-city-maximum',

            type: 'bar',
            variant:
                'point-city-comparison',

            title:
                'Selected point vs city-wide maximum',

            subtitle:
                `${analysis.scope.metricLabel} · ` +
                `${analysis.scope.year}`,

            scope: {
                type: 'selected-point',
                year: analysis.scope.year,

                selectedCountPointId:
                selectedPoint.countPointId,

                maximumCountPointId:
                cityMaximum.countPointId
            },

            metric: {
                key: analysis.scope.metric,
                label:
                analysis.scope.metricLabel,
                unit: 'vehicles/day'
            },

            axes: {
                x: {
                    field: 'value',
                    label: 'Vehicles per day',
                    zeroBaseline: true
                },

                y: {
                    field: 'point',
                    label: 'Count point'
                }
            },

            bars: [
                {
                    label: 'Selected',
                    rank: selectedPoint.rank,

                    countPointId:
                    selectedPoint.countPointId,

                    roadName:
                    selectedPoint.roadName,

                    value:
                    selectedPoint.value,

                    estimationMethod:
                    selectedPoint.estimationMethod,

                    emphasis: false
                },
                {
                    label: 'City maximum',
                    rank: cityMaximum.rank,

                    countPointId:
                    cityMaximum.countPointId,

                    roadName:
                    cityMaximum.roadName,

                    value:
                    cityMaximum.value,

                    estimationMethod:
                    cityMaximum.estimationMethod,

                    emphasis: true
                }
            ]
        });
    }

    return charts;
}

export function createAskMapHandler(rows) {
    return async function askMap(request, response) {
        try {
            const question = String(request.body?.question ?? '').trim().slice(0, 1000);
            const intent = String(
                request.body?.intent ?? ''
            )
                .trim()
                .slice(0, 100);
            if (!question) {
                return response.status(400).json({error: 'Please enter a question.'});
            }

            const requestData =
                request.body ?? {};

            const requestedChart =
                requestData.chartRequest ??
                inferChartRequestFromQuestion(
                    question,
                    requestData
                );

            const chartYear =
                requestedChart?.type === 'line'
                    ? requestedChart.endYear
                    : requestedChart?.year;

            const analysisRequest = {
                ...requestData,

                ...(
                    requestedChart?.metric
                        ? {
                            metric:
                            requestedChart.metric
                        }
                        : {}
                ),

                ...(
                    Number.isFinite(chartYear)
                        ? {year: chartYear}
                        : {}
                )
            };

            const analysis =
                analyseTraffic(
                    rows,
                    analysisRequest
                );

            const chartRequest =
                normaliseChartRequest(
                    requestedChart,
                    analysis
                );

            const fallbackAnswer =
                deterministicAnswer(
                    analysis,
                    question
                );

            const referencedPoints =
                buildReferencedPoints(
                    analysis,
                    question,
                    intent,
                    chartRequest
                );
            const charts =
                buildChartSpecs(
                    analysis,
                    question,
                    intent,
                    chartRequest
                );

            const apiKey =
                process.env.OPENAI_API_KEY?.trim();


            if (!apiKey) {
                return response.json({
                    answer: fallbackAnswer,
                    mode: 'data-only',

                    requestIntent:
                        intent || 'custom-question',
                    chartRequest,

                    referencedPoints,
                    charts,

                    notice:
                        'OPENAI_API_KEY is not configured; a deterministic answer was returned.'
                });
            }

            const client = new OpenAI({apiKey});
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);

            try {
                const modelResponse = await client.responses.create({
                    model: process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini',
                    reasoning: {effort: 'low'},
                    instructions: SYSTEM_INSTRUCTIONS,
                    input:
                        `Preset intent:\n${
                            intent || 'custom-question'
                        }\n\n` +

                        `Chart request:\n${
                            JSON.stringify(chartRequest)
                        }\n\n` +

                        `User question:\n${question}\n\n` +

                        `Deterministic analysis:\n${
                            JSON.stringify(analysis)
                        }\n\n` +

                        `Deterministic chart specifications:\n${
                            JSON.stringify(charts)
                        }`,

                    max_output_tokens: 1200,
                    store: false
                }, {signal: controller.signal});

                return response.json({
                    answer:
                        modelResponse.output_text ||
                        fallbackAnswer,

                    mode: 'ai-assisted',

                    requestIntent:
                        intent || 'custom-question',

                    chartRequest,
                    referencedPoints,
                    charts
                });
            } finally {
                clearTimeout(timeout);
            }
        } catch (error) {
            console.error('Ask-map request failed:', error);
            return response.status(502).json({
                error: 'The AI service is unavailable. The map itself can continue to be used.',
                detail: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    };
}

