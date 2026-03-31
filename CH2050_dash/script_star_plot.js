const starOutcomeConfig = [
    {
        key: 'pnm',
        labelLines: ['Mortality 1–59 months'],
        shortLabel: 'Mortality 1–59 months'
    },
    {
        key: 'nnm',
        labelLines: ['Neonatal', 'mortality'],
        shortLabel: 'Neonatal mortality'
    },
    {
        key: 'math',
        labelLines: ['Gap in math score', 'relative to Singapore'],
        shortLabel: 'Math gap'
    },
    {
        key: 'hgap',
        labelLines: ['Height gap relative', 'to top 10 countries'],
        shortLabel: 'Height gap'
    },
    {
        key: 'q5_19',
        labelLines: ['Mortality', '5–19 years'],
        shortLabel: 'Mortality 5–19 years'
    }
];

let starDataCache = null;
const traditionalStarScaleState = {};
let traditionalStarDerivedCache = null;

function parseStarSex(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === '1') { return 'male'; }
    if (normalized === '2') { return 'female'; }
    if (normalized === '3') { return 'both'; }
    return normalized;
}

function roundStarValue(value) {
    if (!Number.isFinite(value)) {
        return '';
    }
    return value < 10 ? (Math.round(value * 10) / 10).toFixed(1) : String(Math.round(value));
}

async function loadStarData(csvFilePath) {
    if (starDataCache) {
        return starDataCache;
    }

    starDataCache = await d3.csv(csvFilePath, (d) => {
        const rawValue = Number(d.value);
        const outcomeKey = String(d.ageg ?? '').trim();
        const plotValue = Number.isFinite(rawValue) ? rawValue : null;

        return {
            lid: String(d.lid ?? '').trim(),
            sex: parseStarSex(d.sex),
            year: Number(d.year),
            outcomeKey,
            rawValue,
            plotValue
        };
    });

    starDataCache = starDataCache.filter(d =>
        d.lid !== '' &&
        d.outcomeKey !== '' &&
        Number.isFinite(d.year) &&
        Number.isFinite(d.plotValue)
    );

    return starDataCache;
}

function buildTraditionalStarDerivedData(rows) {
    if (traditionalStarDerivedCache) {
        return traditionalStarDerivedCache;
    }

    const rawExtentByOutcomeSex = new Map();
    const percentileValuesByOutcomeSexYear = new Map();
    const rowsByLidSex = new Map();

    rows.forEach((row) => {
        const extentKey = `${row.sex}||${row.outcomeKey}`;
        const currentExtent = rawExtentByOutcomeSex.get(extentKey);
        if (!currentExtent) {
            rawExtentByOutcomeSex.set(extentKey, {
                min: row.plotValue,
                max: row.plotValue
            });
        } else {
            currentExtent.min = Math.min(currentExtent.min, row.plotValue);
            currentExtent.max = Math.max(currentExtent.max, row.plotValue);
        }

        const percentileKey = `${row.sex}||${row.outcomeKey}||${row.year}`;
        if (!percentileValuesByOutcomeSexYear.has(percentileKey)) {
            percentileValuesByOutcomeSexYear.set(percentileKey, []);
        }
        percentileValuesByOutcomeSexYear.get(percentileKey).push(row.plotValue);

        const lidSexKey = `${row.lid}||${row.sex}`;
        if (!rowsByLidSex.has(lidSexKey)) {
            rowsByLidSex.set(lidSexKey, []);
        }
        rowsByLidSex.get(lidSexKey).push(row);
    });

    percentileValuesByOutcomeSexYear.forEach((values, key) => {
        percentileValuesByOutcomeSexYear.set(key, values.filter(Number.isFinite).sort((a, b) => a - b));
    });

    rowsByLidSex.forEach((groupRows) => {
        groupRows.sort((a, b) => {
            if (a.outcomeKey === b.outcomeKey) {
                return a.year - b.year;
            }
            return a.outcomeKey.localeCompare(b.outcomeKey);
        });
    });

    traditionalStarDerivedCache = {
        rawExtentByOutcomeSex,
        percentileValuesByOutcomeSexYear,
        rowsByLidSex
    };

    return traditionalStarDerivedCache;
}

function drawStarFigures(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const dataFile = container.getAttribute('data-file') || 'data/stardata.csv';
    container.innerHTML = '';
    const chartHost = d3.select(`#${containerId}`).append('div').attr('id', `${containerId}-charts`);

    function renderMessage(message) {
        chartHost.html('');
        chartHost.append('div')
            .attr('class', 'no-data-message-box')
            .append('p')
            .attr('class', 'no-data-message-text')
            .text(message);
    }

    function buildOutcomeSummary(rows, outcome) {
        function describeYear(row, label) {
            if (!row) {
                return '';
            }
            const suffix = row.rawValue < 0 ? ' (above benchmark)' : '';
            return `${row.year} ${label}${suffix}`;
        }

        const matching = rows
            .filter(row => row.outcomeKey === outcome.key)
            .sort((a, b) => a.year - b.year);

        if (matching.length === 0) {
            return {
                ...outcome,
                status: 'missing'
            };
        }

        const earliest = matching[0];
        const latest = matching[matching.length - 1];
        const scaleMaxValue = Math.max(0, earliest.plotValue, latest.plotValue);
        const baseline = earliest.plotValue >= latest.plotValue ? earliest : latest;
        const comparison = matching.length > 1 ? earliest : null;
        const goalValue = latest.rawValue >= 0 ? latest.plotValue / 2 : null;
        const canShowOnTrack = Boolean(
            comparison &&
            earliest.rawValue >= 0 &&
            latest.rawValue >= 0 &&
            earliest.year < latest.year &&
            latest.year < 2050 &&
            (2050 - latest.year) > 0
        );

        let onTrackValue = null;
        if (canShowOnTrack) {
            // On-track threshold for the green spoke marker.
            // Current rule: use the observed proportional decline from the baseline year
            // to the most recent year, then ask what most-recent value would be consistent
            // with halving by 2050 under that same average annual rate of decline.
            // This is the place to change if you want to switch to a 10-year baseline
            // window or back to a midpoint/linear rule later.
            // TODO: Precompute/store derived plotting values in the input dataset instead
            // of calculating them in the browser. A clean approach would be long-format
            // rows with a point_type such as baseline, recent, on_track, and goal.
            const elapsedYears = latest.year - earliest.year;
            const remainingYears = 2050 - latest.year;
            onTrackValue = earliest.plotValue * (0.5 ** (elapsedYears / remainingYears));
        }

        let yearCaption = `${describeYear(earliest, 'baseline year')} | ${describeYear(latest, 'most recent')}`;
        if (!comparison) {
            yearCaption = describeYear(latest, 'only');
        }

        return {
            ...outcome,
            status: 'ok',
            rows: matching,
            earliest,
            latest,
            baseline,
            comparison,
            goalValue,
            onTrackValue,
            yearCaption,
            scaleMaxValue,
            // When only one year is available, show just the most recent marker (blue).
            earliestVisible: Boolean(comparison && earliest.rawValue >= 0),
            latestVisible: latest.rawValue >= 0,
            goalVisible: Number.isFinite(goalValue) && goalValue >= 0
        };
    }

    function valueToRadius(value, baselineValue, innerRadius, outerRadius) {
        if (!Number.isFinite(value) || !Number.isFinite(baselineValue) || baselineValue <= 0) {
            return innerRadius;
        }
        const share = 1 - Math.max(0, Math.min(value, baselineValue)) / baselineValue;
        return innerRadius + share * (outerRadius - innerRadius);
    }

    function applyPointOffset(point, angle, distance) {
        return {
            x: point.x + Math.cos(angle) * distance,
            y: point.y + Math.sin(angle) * distance
        };
    }

    function getSideLabelOffset(spokeAngle, side = 1, tangentDistance = 12, radialDistance = 4) {
        const tangentAngle = spokeAngle + (Math.PI / 2);
        return {
            x: (Math.cos(tangentAngle) * tangentDistance * side) + (Math.cos(spokeAngle) * radialDistance),
            y: (Math.sin(tangentAngle) * tangentDistance * side) + (Math.sin(spokeAngle) * radialDistance)
        };
    }

    function drawValueLabel(group, point, text, spokeAngle, color, side = 1, extraClass = '', tangentDistance = 12, radialDistance = 4) {
        if (!text) {
            return null;
        }
        const offset = getSideLabelOffset(spokeAngle, side, tangentDistance, radialDistance);
        return group.append('text')
            .attr('x', point.x + offset.x)
            .attr('y', point.y + offset.y)
            .attr('fill', color)
            .attr('class', extraClass)
            .attr('font-size', 12)
            .attr('font-weight', 600)
            .attr('text-anchor', offset.x >= 0 ? 'start' : 'end')
            .attr('dominant-baseline', Math.abs(offset.y) < 4 ? 'middle' : (offset.y >= 0 ? 'hanging' : 'ideographic'))
            .text(text);
    }

    function triangleRotationForDirection(spokeAngle, pointsOutward) {
        return (spokeAngle * 180 / Math.PI) + (pointsOutward ? 90 : -90);
    }

    function getPointerTrianglePath(length, baseWidth) {
        const halfBase = baseWidth / 2;
        const tipY = -length / 2;
        const baseY = length / 2;
        return `M0,${tipY}L${halfBase},${baseY}L${-halfBase},${baseY}Z`;
    }

    function drawTriangleMarker(group, point, size, fill, stroke, rotationDegrees, strokeWidth = 1.1) {
        const markerLength = Math.sqrt(size) * 1.55;
        const markerBaseWidth = markerLength * 0.52;
        return group.append('path')
            .attr('d', getPointerTrianglePath(markerLength, markerBaseWidth))
            .attr('transform', `translate(${point.x}, ${point.y}) rotate(${rotationDegrees})`)
            .attr('fill', fill)
            .attr('stroke', stroke)
            .attr('stroke-width', strokeWidth)
            .attr('stroke-linejoin', 'round');
    }

    function renderLegend(wrapper, legendSvgId, width) {
        const legendItems = [
            { label: 'Baseline year value', shape: 'triangle', color: '#d62728' },
            { label: 'Most recent value', shape: 'triangle', color: '#1f4aff' },
            { label: '50x50 goal for 2050', shape: 'star', color: '#666666' },
            { label: 'On-track value for the recent year', shape: 'crossline', color: '#2c8a4b' }
        ];

        const legendHeight = 74;
        const legendPaddingLeft = 14;
        const legendColumnWidth = (width - legendPaddingLeft - 8) / 2;
        const svg = wrapper.append('svg')
            .attr('id', legendSvgId)
            .attr('class', 'star-legend-svg')
            .attr('width', width)
            .attr('height', legendHeight);

        const entry = svg.selectAll('g.star-legend-entry')
            .data(legendItems)
            .enter()
            .append('g')
            .attr('class', 'star-legend-entry')
            .attr('transform', (d, i) => {
                const row = i < 2 ? 0 : 1;
                const col = i % 2;
                return `translate(${legendPaddingLeft + col * legendColumnWidth}, ${row * 28 + 14})`;
            });

        entry.each(function(d) {
            const g = d3.select(this);
            if (d.shape === 'triangle') {
                drawTriangleMarker(
                    g,
                    { x: 7, y: 0 },
                    170,
                    d.color,
                    '#ffffff',
                    -90,
                    1
                );
            } else if (d.shape === 'crossline') {
                g.append('line')
                    .attr('x1', 1)
                    .attr('y1', -7)
                    .attr('x2', 13)
                    .attr('y2', 7)
                    .attr('stroke', d.color)
                    .attr('stroke-width', 2);
            } else {
                const symbolType = d.shape === 'star' ? d3.symbolStar : d3.symbolDiamond;
                g.append('path')
                    .attr('d', d3.symbol().type(symbolType).size(140)())
                    .attr('transform', `translate(${d.shape === 'star' ? 9 : 7},0)`)
                    .attr('fill', d.shape === 'star' ? '#2c8a4b' : d.color)
                    .attr('stroke', d.shape === 'star' ? '#1f6b39' : d.color)
                    .attr('stroke-width', d.shape === 'star' ? 1.1 : 1.1);
            }

            g.append('text')
                .attr('x', 24)
                .attr('y', 4)
                .attr('font-size', 13)
                .text(d.label);
        });

    }

    function renderStarChart(country, sex, rows) {
        const chartId = `${containerId}-${country}-${sex}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
        const chartSvgId = `star-chart-${chartId}`;
        const legendSvgId = `star-legend-${chartId}`;
        const viewportWidth = Math.max(window.innerWidth - 28, 280);
        const isMobile = viewportWidth <= 420;
        const wrapper = chartHost.append('div').attr('class', 'multi-outcome-chart star-chart-wrapper').attr('id', chartId);
        const locationLabel = getCountryLabel(country);
        const titleText = sex === 'both' ? locationLabel : `${locationLabel} (${sex})`;
        const downloadFileName = `${titleText.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim()}.png`;

        wrapper.append('h3')
            .attr('class', 'multi-outcome-title')
            .text(titleText);

        const width = isMobile ? Math.max(viewportWidth + 120, 430) : Math.min(viewportWidth, 720);
        const height = width * 0.9;
        const outerRadius = Math.min(width, height) * 0.33;
        const innerRadius = outerRadius * 0.23;
        const labelRadius = outerRadius + (isMobile ? 26 : 40);
        const centerX = (width / 2) + 4;
        const centerY = height / 2 - 6;
        const ringCount = 5;
        const baseAngle = -Math.PI / 2;
        const axisLabelFontSize = isMobile ? 12 : 14;
        const axisSubtitleFontSize = isMobile ? 10 : 11;
        const zeroLabelFontSize = isMobile ? 10 : 11;
        const pointLabelFontSize = isMobile ? 9 : 12;
        const pointLabelTangentDistance = isMobile ? 8 : 12;
        const pointLabelRadialDistance = isMobile ? 2 : 4;
        const goalLabelTangentDistance = isMobile ? 11 : 15;
        const goalLabelRadialDistance = isMobile ? 4 : 7;
        const triangleMarkerSize = isMobile ? 95 : 180;
        const goalStarSize = isMobile ? 80 : 160;
        const trackBarHalf = isMobile ? 4.5 : 7;
        const getAxisLabelPoint = (angle, outcomeKey) => {
            if (outcomeKey === 'pnm') {
                return {
                    x: centerX + (labelRadius + (isMobile ? 10 : 18)) * Math.cos(angle),
                    y: centerY + (labelRadius + (isMobile ? 10 : 18)) * Math.sin(angle) - (isMobile ? 8 : 12)
                };
            }
            return {
                x: centerX + labelRadius * Math.cos(angle),
                y: centerY + labelRadius * Math.sin(angle)
            };
        };

        const svgRoot = wrapper.append('svg')
            .attr('id', chartSvgId)
            .attr('width', width)
            .attr('height', height)
            .style('font-family', 'Arial, sans-serif');

        const svg = svgRoot.append('g');
        const summaries = starOutcomeConfig.map(outcome => buildOutcomeSummary(rows, outcome));
        const gridGroup = svg.append('g');
        const webGroup = svg.append('g');
        const goalMarkerGroup = svg.append('g');
        const markerGroup = svg.append('g');
        const valueLabelGroup = svg.append('g');
        const axisLabelGroup = svg.append('g');

        const innerPolygonPoints = d3.range(starOutcomeConfig.length).map(i => {
            const angle = baseAngle + (Math.PI * 2 * i / starOutcomeConfig.length);
            return [
                centerX + innerRadius * Math.cos(angle),
                centerY + innerRadius * Math.sin(angle)
            ];
        });
        gridGroup.append('path')
            .attr('d', d3.line().curve(d3.curveLinearClosed)(innerPolygonPoints))
            .attr('fill', 'none')
            .attr('stroke', '#dddddd')
            .attr('stroke-width', 1.1);

        const latestPathPoints = [];
        const goalPathPoints = [];

        summaries.forEach((summary, index) => {
            const angle = baseAngle + (Math.PI * 2 * index / starOutcomeConfig.length);
            const axisEnd = {
                x: centerX + outerRadius * Math.cos(angle),
                y: centerY + outerRadius * Math.sin(angle)
            };

            gridGroup.append('line')
                .attr('x1', centerX)
                .attr('y1', centerY)
                .attr('x2', axisEnd.x)
                .attr('y2', axisEnd.y)
                .attr('stroke', '#b8b8b8')
                .attr('stroke-width', 1.4);

            const arrowStart = {
                x: centerX + (outerRadius - 16) * Math.cos(angle),
                y: centerY + (outerRadius - 16) * Math.sin(angle)
            };
            const arrowEnd = {
                x: centerX + (outerRadius + 2) * Math.cos(angle),
                y: centerY + (outerRadius + 2) * Math.sin(angle)
            };
            gridGroup.append('line')
                .attr('x1', arrowStart.x)
                .attr('y1', arrowStart.y)
                .attr('x2', arrowEnd.x)
                .attr('y2', arrowEnd.y)
                .attr('stroke', '#8a8a8a')
                .attr('stroke-width', 1.4);
            gridGroup.append('path')
                .attr('d', d3.symbol().type(d3.symbolTriangle).size(42)())
                .attr('transform', `translate(${arrowEnd.x}, ${arrowEnd.y}) rotate(${(angle * 180 / Math.PI) + 90})`)
                .attr('fill', '#8a8a8a');

            const labelPoint = getAxisLabelPoint(angle, summary.key);
            const zeroPoint = {
                x: centerX + (outerRadius + 16) * Math.cos(angle),
                y: centerY + (outerRadius + 16) * Math.sin(angle)
            };
            const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
            const labelGroup = axisLabelGroup.append('text')
                .attr('x', labelPoint.x)
                .attr('y', labelPoint.y)
                .attr('text-anchor', anchor)
                .attr('class', 'star-axis-label')
                .attr('font-size', axisLabelFontSize);

            summary.labelLines.forEach((line, lineIndex) => {
                labelGroup.append('tspan')
                    .attr('x', labelPoint.x)
                    .attr('dy', lineIndex === 0 ? 0 : (isMobile ? 13 : 16))
                    .text(line);
            });

            const captionY = labelPoint.y + summary.labelLines.length * (isMobile ? 13 : 16) + 4;
            const captionText = axisLabelGroup.append('text')
                .attr('x', labelPoint.x)
                .attr('y', captionY)
                .attr('text-anchor', anchor)
                .attr('class', 'star-axis-subtitle')
                .attr('font-size', axisSubtitleFontSize);

            const captionLines = (summary.yearCaption || 'No data').split(' | ');
            captionLines.forEach((line, lineIndex) => {
                captionText.append('tspan')
                    .attr('x', labelPoint.x)
                    .attr('dy', lineIndex === 0 ? 0 : (isMobile ? 11 : 13))
                    .text(line);
            });

            axisLabelGroup.append('text')
                .attr('x', zeroPoint.x)
                .attr('y', zeroPoint.y)
                .attr('fill', '#555')
                .attr('font-size', zeroLabelFontSize)
                .attr('text-anchor', anchor)
                .text('0');

            if (summary.status !== 'ok') {
                return;
            }

            const basePoint = (() => {
                const radius = valueToRadius(summary.earliest.plotValue, summary.scaleMaxValue, innerRadius, outerRadius);
                return {
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                };
            })();
            const latestPoint = (() => {
                const radius = valueToRadius(summary.latest.plotValue, summary.scaleMaxValue, innerRadius, outerRadius);
                return {
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                };
            })();
            const goalPoint = (() => {
                const radius = valueToRadius(summary.goalValue, summary.scaleMaxValue, innerRadius, outerRadius);
                return {
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                };
            })();
            const goalPathPoint = summary.goalVisible
                ? goalPoint
                : {
                    x: centerX + outerRadius * Math.cos(angle),
                    y: centerY + outerRadius * Math.sin(angle)
                };

            latestPathPoints.push([latestPoint.x, latestPoint.y]);
            goalPathPoints.push([goalPathPoint.x, goalPathPoint.y]);

            const pointsOverlap = summary.earliestVisible &&
                summary.latestVisible &&
                Math.hypot(basePoint.x - latestPoint.x, basePoint.y - latestPoint.y) < 1;
            const markerBasePoint = pointsOverlap ? applyPointOffset(basePoint, angle + Math.PI / 2, -7) : basePoint;
            const markerLatestPoint = pointsOverlap ? applyPointOffset(latestPoint, angle + Math.PI / 2, 7) : latestPoint;
            const trianglesPointOutward = summary.latest.plotValue < summary.earliest.plotValue;
            const triangleRotation = triangleRotationForDirection(angle, trianglesPointOutward);

            if (summary.earliestVisible) {
                drawTriangleMarker(
                    markerGroup,
                    markerBasePoint,
                    triangleMarkerSize,
                    '#d62728',
                    '#ffffff',
                    triangleRotation,
                    1
                );
            }

            if (summary.latestVisible) {
                drawTriangleMarker(
                    markerGroup,
                    markerLatestPoint,
                    triangleMarkerSize,
                    '#1f4aff',
                    '#ffffff',
                    triangleRotation,
                    1.1
                );
            }

            if (summary.goalVisible) {
                goalMarkerGroup.append('path')
                    .attr('d', d3.symbol().type(d3.symbolStar).size(goalStarSize)())
                    .attr('transform', `translate(${goalPoint.x}, ${goalPoint.y})`)
                    .attr('fill', '#2c8a4b')
                    .attr('stroke', '#1f6b39')
                    .attr('stroke-width', 1.1);
            }

            if (Number.isFinite(summary.onTrackValue)) {
                const trackRadius = valueToRadius(summary.onTrackValue, summary.scaleMaxValue, innerRadius, outerRadius);
                const trackPoint = {
                    x: centerX + trackRadius * Math.cos(angle),
                    y: centerY + trackRadius * Math.sin(angle)
                };
                const tangentAngle = angle + (Math.PI / 2);
                markerGroup.append('line')
                    .attr('x1', trackPoint.x - Math.cos(tangentAngle) * trackBarHalf)
                    .attr('y1', trackPoint.y - Math.sin(tangentAngle) * trackBarHalf)
                    .attr('x2', trackPoint.x + Math.cos(tangentAngle) * trackBarHalf)
                    .attr('y2', trackPoint.y + Math.sin(tangentAngle) * trackBarHalf)
                    .attr('stroke', '#2c8a4b')
                    .attr('stroke-width', 2.2)
                    .attr('stroke-linecap', 'round');
            }

            if (summary.earliestVisible) {
                drawValueLabel(valueLabelGroup, markerBasePoint, roundStarValue(summary.earliest.plotValue), angle, '#d62728', -1, '', pointLabelTangentDistance, pointLabelRadialDistance)
                    .attr('font-size', pointLabelFontSize);
            }
            if (summary.latestVisible) {
                drawValueLabel(valueLabelGroup, markerLatestPoint, roundStarValue(summary.latest.plotValue), angle, '#1f4aff', 1, '', pointLabelTangentDistance, pointLabelRadialDistance)
                    .attr('font-size', pointLabelFontSize);
            }
            if (summary.goalVisible) {
                drawValueLabel(valueLabelGroup, goalPoint, roundStarValue(summary.goalValue), angle, '#444444', 1, '', goalLabelTangentDistance, goalLabelRadialDistance)
                    .attr('font-size', pointLabelFontSize);
            }
        });

        const line = d3.line().curve(d3.curveLinearClosed);
        if (latestPathPoints.length >= 3) {
            webGroup.append('path')
                .attr('d', line(latestPathPoints))
                .attr('fill', 'rgba(31, 74, 255, 0.07)')
                .attr('stroke', '#1f4aff')
                .attr('stroke-width', 1.2)
                .attr('stroke-dasharray', '4,4');
        }
        if (goalPathPoints.length >= 3) {
            webGroup.append('path')
                .attr('d', line(goalPathPoints))
                .attr('fill', 'none')
                .attr('stroke', '#777777')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '2,4');
        }

        renderLegend(wrapper, legendSvgId, Math.min(width, 620));

        wrapper.append('button')
            .attr('class', 'figure-download-btn')
            .text('Download figure')
            .on('click', function() {
                downloadCombinedSVG(chartSvgId, legendSvgId, downloadFileName, {
                    canvasPadding: 4,
                    bottomPadding: 0,
                    legendGap: 0,
                    legendOffsetY: -38,
                    centerLegend: true,
                    chart: {
                        titleText: titleText,
                        titleHeight: 30,
                        titleFontSize: 18,
                        margin: { top: 2, right: 24, bottom: 0, left: 14 },
                        crop: { top: 0, right: 0, bottom: 18, left: 0 }
                    },
                    legend: {
                        margin: { top: 0, right: 4, bottom: 0, left: 10 },
                        crop: { top: 0, right: 0, bottom: 10, left: 0 }
                    }
                });
            });
    }

    async function renderAll() {
        const rows = await loadStarData(dataFile);
        chartHost.html('');

        if (selectedCountries.length === 0 || selectedSex.length === 0) {
            renderMessage('Select location and sex');
            return;
        }

        let chartCount = 0;
        selectedCountries.forEach(country => {
            selectedSex.forEach(sex => {
                const countrySexRows = rows.filter(d => d.lid === String(country) && d.sex === sex);
                if (countrySexRows.length > 0) {
                    renderStarChart(country, sex, countrySexRows);
                    chartCount += 1;
                }
            });
        });

        if (chartCount === 0) {
            renderMessage('No spider-plot data for the current selection');
        }
    }

    function selectionChanged() {
        renderAll();
    }

    function collapsedHandler() {
        document.removeEventListener(`countrywasSelected-${containerId}`, selectionChanged);
        document.removeEventListener(`sexwasSelected-${containerId}`, selectionChanged);
        document.removeEventListener(`${containerId}-collapsed`, collapsedHandler);
    }

    document.addEventListener(`countrywasSelected-${containerId}`, selectionChanged);
    document.addEventListener(`sexwasSelected-${containerId}`, selectionChanged);
    document.addEventListener(`${containerId}-collapsed`, collapsedHandler);

    renderAll();
}

function drawStarLineFigures(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const dataFile = container.getAttribute('data-file') || 'data/stardata.csv';
    const linePlotOutcomeOrder = ['nnm', 'pnm', 'q5_19', 'hgap', 'math'];
    const linePlotOutcomeConfig = linePlotOutcomeOrder
        .map((key) => starOutcomeConfig.find((outcome) => outcome.key === key))
        .filter(Boolean);
    container.innerHTML = '';
    const chartHost = d3.select(`#${containerId}`).append('div').attr('id', `${containerId}-charts`);

    function renderMessage(message) {
        chartHost.html('');
        chartHost.append('div')
            .attr('class', 'no-data-message-box')
            .append('p')
            .attr('class', 'no-data-message-text')
            .text(message);
    }

    function getPointerTrianglePath(length, baseWidth) {
        const halfBase = baseWidth / 2;
        const tipY = -length / 2;
        const baseY = length / 2;
        return `M0,${tipY}L${halfBase},${baseY}L${-halfBase},${baseY}Z`;
    }

    function drawTriangleMarker(group, point, size, fill, stroke, rotationDegrees, strokeWidth = 1.1) {
        const markerLength = Math.sqrt(size) * 1.55;
        const markerBaseWidth = markerLength * 0.52;
        return group.append('path')
            .attr('d', getPointerTrianglePath(markerLength, markerBaseWidth))
            .attr('transform', `translate(${point.x}, ${point.y}) rotate(${rotationDegrees})`)
            .attr('fill', fill)
            .attr('stroke', stroke)
            .attr('stroke-width', strokeWidth)
            .attr('stroke-linejoin', 'round');
    }

    function buildOutcomeSummary(rows, outcome) {
        function describeYear(row, label) {
            if (!row) {
                return '';
            }
            const suffix = row.rawValue < 0 ? ' (above benchmark)' : '';
            return `${row.year} ${label}${suffix}`;
        }

        const matching = rows
            .filter(row => row.outcomeKey === outcome.key)
            .sort((a, b) => a.year - b.year);

        if (matching.length === 0) {
            return {
                ...outcome,
                status: 'missing'
            };
        }

        const earliest = matching[0];
        const latest = matching[matching.length - 1];
        const scaleMaxValue = Math.max(0, earliest.plotValue, latest.plotValue);
        const comparison = matching.length > 1 ? earliest : null;
        const goalValue = latest.rawValue >= 0 ? latest.plotValue / 2 : null;
        const canShowOnTrack = Boolean(
            comparison &&
            earliest.rawValue >= 0 &&
            latest.rawValue >= 0 &&
            earliest.year < latest.year &&
            latest.year < 2050 &&
            (2050 - latest.year) > 0
        );

        let onTrackValue = null;
        if (canShowOnTrack) {
            const elapsedYears = latest.year - earliest.year;
            const remainingYears = 2050 - latest.year;
            onTrackValue = earliest.plotValue * (0.5 ** (elapsedYears / remainingYears));
        }

        const canShowProjected2050 = Boolean(
            comparison &&
            earliest.rawValue >= 0 &&
            latest.rawValue >= 0 &&
            earliest.year < latest.year &&
            earliest.plotValue >= latest.plotValue &&
            latest.year < 2050 &&
            (2050 - latest.year) > 0 &&
            earliest.plotValue > 0
        );

        let projected2050Value = null;
        if (canShowProjected2050) {
            const elapsedYears = latest.year - earliest.year;
            const remainingYears = 2050 - latest.year;
            const annualChangeFactor = latest.plotValue / earliest.plotValue;
            projected2050Value = latest.plotValue * (annualChangeFactor ** (remainingYears / elapsedYears));
        }

        let yearCaption = `${describeYear(earliest, 'baseline year')} | ${describeYear(latest, 'most recent')}`;
        if (!comparison) {
            yearCaption = describeYear(latest, 'only');
        }

        return {
            ...outcome,
            status: 'ok',
            earliest,
            latest,
            comparison,
            goalValue,
            onTrackValue,
            projected2050Value,
            yearCaption,
            scaleMaxValue,
            // When only one year is available, show just the most recent marker (blue).
            earliestVisible: Boolean(comparison && earliest.rawValue >= 0),
            latestVisible: latest.rawValue >= 0,
            goalVisible: Number.isFinite(goalValue) && goalValue >= 0,
            projected2050Visible: Number.isFinite(projected2050Value) && projected2050Value >= 0
        };
    }

    function valueToX(value, scaleMaxValue, xStart, xEnd) {
        if (!Number.isFinite(value) || !Number.isFinite(scaleMaxValue) || scaleMaxValue <= 0) {
            return xEnd;
        }
        const share = 1 - Math.max(0, Math.min(value, scaleMaxValue)) / scaleMaxValue;
        return xStart + share * (xEnd - xStart);
    }

    function renderLegend(wrapper, legendSvgId, width) {
        const legendItems = [
            { label: 'Baseline year value', shape: 'triangle', color: '#d62728' },
            { label: 'Most recent value', shape: 'triangle', color: '#1f4aff' },
            { label: '50x50 goal for 2050', shape: 'star', color: '#666666' },
            // Commented out to hide the green on-track marker from the
            // 50x50x5 feasibility line plots while keeping the code easy to restore.
            // { label: 'On-track value for the recent year', shape: 'crossline', color: '#2c8a4b' },
            { label: 'Projected 2050 value under recent trend', shape: 'diamond', color: '#c97816' }
        ];

        const legendHeight = 102;
        const legendPaddingLeft = 14;
        const legendColumnWidth = (width - legendPaddingLeft - 8) / 2;
        const svg = wrapper.append('svg')
            .attr('id', legendSvgId)
            .attr('class', 'star-legend-svg')
            .attr('width', width)
            .attr('height', legendHeight);

        const entry = svg.selectAll('g.star-line-legend-entry')
            .data(legendItems)
            .enter()
            .append('g')
            .attr('class', 'star-line-legend-entry')
            .attr('transform', (d, i) => {
                const row = Math.floor(i / 2);
                const col = i % 2;
                return `translate(${legendPaddingLeft + col * legendColumnWidth}, ${row * 28 + 14})`;
            });

        entry.each(function(d) {
            const g = d3.select(this);
            if (d.shape === 'triangle') {
                drawTriangleMarker(
                    g,
                    { x: 7, y: 0 },
                    170,
                    d.color,
                    '#ffffff',
                    90,
                    1
                );
            } else if (d.shape === 'crossline') {
                g.append('line')
                    .attr('x1', 7)
                    .attr('y1', -7)
                    .attr('x2', 7)
                    .attr('y2', 7)
                    .attr('stroke', d.color)
                    .attr('stroke-width', 2.2)
                    .attr('stroke-linecap', 'round');
            } else if (d.shape === 'diamond') {
                g.append('path')
                    .attr('d', d3.symbol().type(d3.symbolDiamond).size(110)())
                    .attr('transform', 'translate(8,0)')
                    .attr('fill', '#f0a43b')
                    .attr('stroke', d.color)
                    .attr('stroke-width', 1.2);
            } else {
                g.append('path')
                    .attr('d', d3.symbol().type(d3.symbolStar).size(140)())
                    .attr('transform', 'translate(9,0)')
                    .attr('fill', '#2c8a4b')
                    .attr('stroke', '#1f6b39')
                    .attr('stroke-width', 1.1);
            }

            g.append('text')
                .attr('x', 24)
                .attr('y', 4)
                .attr('font-size', 13)
                .text(d.label);
        });

    }

    function renderStarLineChart(country, sex, rows) {
        const chartId = `${containerId}-${country}-${sex}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
        const chartSvgId = `star-line-chart-${chartId}`;
        const legendSvgId = `star-line-legend-${chartId}`;
        const viewportWidth = Math.max(window.innerWidth - 28, 280);
        const isMobile = viewportWidth <= 420;
        const wrapper = chartHost.append('div').attr('class', 'multi-outcome-chart star-chart-wrapper star-line-chart-wrapper').attr('id', chartId);
        const locationLabel = getCountryLabel(country);
        const titleText = sex === 'both' ? locationLabel : `${locationLabel} (${sex})`;
        const downloadFileName = `${titleText.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim()} feasibility line plot.png`;

        wrapper.append('h3')
            .attr('class', 'multi-outcome-title')
            .text(titleText);

        const summaries = linePlotOutcomeConfig.map(outcome => buildOutcomeSummary(rows, outcome));
        const width = isMobile ? Math.max(viewportWidth + 120, 470) : Math.min(viewportWidth, 760);
        const leftLabelWidth = isMobile ? 174 : 230;
        const rightPadding = isMobile ? 44 : 64;
        const topPadding = 28;
        const bottomPadding = 34;
        const rowGap = isMobile ? 74 : 82;
        const height = topPadding + bottomPadding + (Math.max(summaries.length, 1) * rowGap);
        const xStart = leftLabelWidth;
        const xEnd = width - rightPadding;
        const trackBarHalf = isMobile ? 9 : 11;
        const triangleMarkerSize = isMobile ? 95 : 180;
        const goalStarSize = isMobile ? 80 : 160;

        const svg = wrapper.append('svg')
            .attr('id', chartSvgId)
            .attr('class', 'star-line-chart-svg')
            .attr('width', width)
            .attr('height', height)
            .style('font-family', 'Arial, sans-serif');

        const lineGroup = svg.append('g');
        const labelGroup = svg.append('g');
        const markerGroup = svg.append('g');
        const valueLabelGroup = svg.append('g');

        summaries.forEach((summary, index) => {
            const y = topPadding + (index * rowGap) + (rowGap / 2);

            labelGroup.append('text')
                .attr('x', 8)
                .attr('y', y - 10)
                .attr('class', 'star-line-outcome-label')
                .text(summary.shortLabel);

            labelGroup.append('text')
                .attr('x', 8)
                .attr('y', y + 14)
                .attr('class', 'star-line-caption')
                .text(summary.yearCaption || 'No data');

            lineGroup.append('line')
                .attr('x1', xStart)
                .attr('y1', y)
                .attr('x2', xEnd)
                .attr('y2', y)
                .attr('stroke', '#b8b8b8')
                .attr('stroke-width', 2);

            lineGroup.append('line')
                .attr('x1', xEnd - 14)
                .attr('y1', y)
                .attr('x2', xEnd)
                .attr('y2', y)
                .attr('stroke', '#8a8a8a')
                .attr('stroke-width', 1.4);

            lineGroup.append('path')
                .attr('d', d3.symbol().type(d3.symbolTriangle).size(42)())
                .attr('transform', `translate(${xEnd + 2}, ${y}) rotate(90)`)
                .attr('fill', '#8a8a8a');

            labelGroup.append('text')
                .attr('x', xEnd + 14)
                .attr('y', y + 4)
                .attr('fill', '#555')
                .attr('font-size', isMobile ? 10 : 11)
                .attr('text-anchor', 'start')
                .text('0');

            if (summary.status !== 'ok') {
                return;
            }

            const baseX = valueToX(summary.earliest.plotValue, summary.scaleMaxValue, xStart, xEnd);
            const latestX = valueToX(summary.latest.plotValue, summary.scaleMaxValue, xStart, xEnd);
            const goalX = valueToX(summary.goalValue, summary.scaleMaxValue, xStart, xEnd);
            const pointsOverlap = summary.earliestVisible &&
                summary.latestVisible &&
                Math.abs(baseX - latestX) < 1;
            const markerBaseY = pointsOverlap ? y - 7 : y;
            const markerLatestY = pointsOverlap ? y + 7 : y;
            const triangleRotation = summary.latest.plotValue < summary.earliest.plotValue ? 90 : -90;
            const labelOffsetAbove = isMobile ? -14 : -16;
            const labelOffsetBelow = isMobile ? 22 : 24;

            const visibleMarkers = [];
            if (summary.earliestVisible) {
                visibleMarkers.push({
                    key: 'earliest',
                    value: summary.earliest.plotValue
                });
            }
            if (summary.latestVisible) {
                visibleMarkers.push({
                    key: 'latest',
                    value: summary.latest.plotValue
                });
            }
            if (summary.goalVisible) {
                visibleMarkers.push({
                    key: 'goal',
                    value: summary.goalValue
                });
            }
            // Commented out to hide the green on-track marker from the
            // 50x50x5 feasibility line plots while keeping the code easy to restore.
            // if (Number.isFinite(summary.onTrackValue)) {
            //     visibleMarkers.push({
            //         key: 'track',
            //         value: summary.onTrackValue
            //     });
            // }
            if (summary.projected2050Visible) {
                visibleMarkers.push({
                    key: 'projected2050',
                    value: summary.projected2050Value
                });
            }

            visibleMarkers
                .sort((a, b) => {
                    if (a.value !== b.value) {
                        return a.value - b.value;
                    }
                    return a.key.localeCompare(b.key);
                })
                .forEach((marker, markerIndex) => {
                    marker.labelOffsetY = markerIndex % 2 === 0 ? labelOffsetAbove : labelOffsetBelow;
                });

            const markerLabelOffsetByKey = new Map(
                visibleMarkers.map((marker) => [marker.key, marker.labelOffsetY])
            );

            if (summary.earliestVisible) {
                drawTriangleMarker(
                    markerGroup,
                    { x: baseX, y: markerBaseY },
                    triangleMarkerSize,
                    '#d62728',
                    '#ffffff',
                    triangleRotation,
                    1
                );
            }

            if (summary.latestVisible) {
                drawTriangleMarker(
                    markerGroup,
                    { x: latestX, y: markerLatestY },
                    triangleMarkerSize,
                    '#1f4aff',
                    '#ffffff',
                    triangleRotation,
                    1.1
                );
            }

            if (summary.goalVisible) {
                markerGroup.append('path')
                    .attr('d', d3.symbol().type(d3.symbolStar).size(goalStarSize)())
                    .attr('transform', `translate(${goalX}, ${y})`)
                    .attr('fill', '#2c8a4b')
                    .attr('stroke', '#1f6b39')
                    .attr('stroke-width', 1.1);
            }

            // Commented out to hide the green on-track marker from the
            // 50x50x5 feasibility line plots while keeping the code easy to restore.
            // if (Number.isFinite(summary.onTrackValue)) {
            //     const trackX = valueToX(summary.onTrackValue, summary.scaleMaxValue, xStart, xEnd);
            //     markerGroup.append('line')
            //         .attr('x1', trackX)
            //         .attr('y1', y - trackBarHalf)
            //         .attr('x2', trackX)
            //         .attr('y2', y + trackBarHalf)
            //         .attr('stroke', '#2c8a4b')
            //         .attr('stroke-width', 2.2)
            //         .attr('stroke-linecap', 'round');
            // }

            if (summary.projected2050Visible) {
                const projected2050X = valueToX(summary.projected2050Value, summary.scaleMaxValue, xStart, xEnd);
                markerGroup.append('path')
                    .attr('d', d3.symbol().type(d3.symbolDiamond).size(isMobile ? 70 : 120)())
                    .attr('transform', `translate(${projected2050X}, ${y})`)
                    .attr('fill', '#f0a43b')
                    .attr('stroke', '#c97816')
                    .attr('stroke-width', 1.2);
            }

            if (summary.earliestVisible) {
                valueLabelGroup.append('text')
                    .attr('x', baseX)
                    .attr('y', markerBaseY + (markerLabelOffsetByKey.get('earliest') ?? labelOffsetBelow))
                    .attr('fill', '#d62728')
                    .attr('font-size', isMobile ? 10 : 12)
                    .attr('font-weight', 600)
                    .attr('text-anchor', 'middle')
                    .text(roundStarValue(summary.earliest.plotValue));
            }

            if (summary.goalVisible) {
                valueLabelGroup.append('text')
                    .attr('x', goalX)
                    .attr('y', y + (markerLabelOffsetByKey.get('goal') ?? labelOffsetAbove))
                    .attr('fill', '#444444')
                    .attr('font-size', isMobile ? 10 : 12)
                    .attr('font-weight', 600)
                    .attr('text-anchor', 'middle')
                    .text(roundStarValue(summary.goalValue));
            }

            if (summary.latestVisible) {
                valueLabelGroup.append('text')
                    .attr('x', latestX)
                    .attr('y', markerLatestY + (markerLabelOffsetByKey.get('latest') ?? labelOffsetAbove))
                    .attr('fill', '#1f4aff')
                    .attr('font-size', isMobile ? 10 : 12)
                    .attr('font-weight', 600)
                    .attr('text-anchor', 'middle')
                    .text(roundStarValue(summary.latest.plotValue));
            }

            // Commented out to hide the green on-track marker label from the
            // 50x50x5 feasibility line plots while keeping the code easy to restore.
            // if (Number.isFinite(summary.onTrackValue)) {
            //     const trackX = valueToX(summary.onTrackValue, summary.scaleMaxValue, xStart, xEnd);
            //     valueLabelGroup.append('text')
            //         .attr('x', trackX)
            //         .attr('y', y + (markerLabelOffsetByKey.get('track') ?? labelOffsetBelow))
            //         .attr('fill', '#2c8a4b')
            //         .attr('font-size', isMobile ? 10 : 12)
            //         .attr('font-weight', 600)
            //         .attr('text-anchor', 'middle')
            //         .text(roundStarValue(summary.onTrackValue));
            // }

            if (summary.projected2050Visible) {
                const projected2050X = valueToX(summary.projected2050Value, summary.scaleMaxValue, xStart, xEnd);
                valueLabelGroup.append('text')
                    .attr('x', projected2050X)
                    .attr('y', y + (markerLabelOffsetByKey.get('projected2050') ?? labelOffsetAbove))
                    .attr('fill', '#a6610f')
                    .attr('font-size', isMobile ? 10 : 12)
                    .attr('font-weight', 600)
                    .attr('text-anchor', 'middle')
                    .text(roundStarValue(summary.projected2050Value));
            }
        });

        renderLegend(wrapper, legendSvgId, Math.min(width, 620));

        wrapper.append('button')
            .attr('class', 'figure-download-btn')
            .text('Download figure')
            .on('click', function() {
                downloadCombinedSVG(chartSvgId, legendSvgId, downloadFileName, {
                    canvasPadding: 4,
                    bottomPadding: 0,
                    legendGap: 0,
                    legendOffsetY: -10,
                    centerLegend: true,
                    chart: {
                        titleText: titleText,
                        titleHeight: 30,
                        titleFontSize: 18,
                        margin: { top: 2, right: 24, bottom: 0, left: 14 },
                        crop: { top: 0, right: 0, bottom: 8, left: 0 }
                    },
                    legend: {
                        margin: { top: 0, right: 4, bottom: 0, left: 10 },
                        crop: { top: 0, right: 0, bottom: 10, left: 0 }
                    }
                });
            });
    }

    async function renderAll() {
        const rows = await loadStarData(dataFile);
        chartHost.html('');

        if (selectedCountries.length === 0 || selectedSex.length === 0) {
            renderMessage('Select location and sex');
            return;
        }

        let chartCount = 0;
        selectedCountries.forEach(country => {
            selectedSex.forEach(sex => {
                const countrySexRows = rows.filter(d => d.lid === String(country) && d.sex === sex);
                if (countrySexRows.length > 0) {
                    renderStarLineChart(country, sex, countrySexRows);
                    chartCount += 1;
                }
            });
        });

        if (chartCount === 0) {
            renderMessage('No spider-plot data for the current selection');
        }
    }

    function selectionChanged() {
        renderAll();
    }

    function collapsedHandler() {
        document.removeEventListener(`countrywasSelected-${containerId}`, selectionChanged);
        document.removeEventListener(`sexwasSelected-${containerId}`, selectionChanged);
        document.removeEventListener(`${containerId}-collapsed`, collapsedHandler);
    }

    document.addEventListener(`countrywasSelected-${containerId}`, selectionChanged);
    document.addEventListener(`sexwasSelected-${containerId}`, selectionChanged);
    document.addEventListener(`${containerId}-collapsed`, collapsedHandler);

    renderAll();
}

function drawTraditionalStarFigures(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const dataFile = container.getAttribute('data-file') || 'data/stardata.csv';
    const currentScale = traditionalStarScaleState[containerId] || 'raw';
    container.innerHTML = '';

    const root = d3.select(`#${containerId}`);
    const controls = root.append('div').attr('class', 'traditional-star-controls');
    const toggleLabel = controls.append('label').attr('class', 'traditional-star-toggle');
    const toggle = toggleLabel.append('input')
        .attr('type', 'checkbox')
        .property('checked', currentScale === 'percentile');
    toggleLabel.append('span').text('Show percentile scale');
    controls.append('div')
        .attr('class', 'traditional-star-scale-note')
        .text('Off: raw value range within each outcome and sex. On: percentile rank within each outcome, sex, and year.');

    const chartHost = root.append('div').attr('id', `${containerId}-charts`);

    function renderMessage(message) {
        chartHost.html('');
        chartHost.append('div')
            .attr('class', 'no-data-message-box')
            .append('p')
            .attr('class', 'no-data-message-text')
            .text(message);
    }

    function quantileRank(value, values) {
        if (!Number.isFinite(value) || !Array.isArray(values) || values.length === 0) {
            return null;
        }
        if (values.length === 1) {
            return 50;
        }

        let lower = 0;
        let equal = 0;
        values.forEach((entry) => {
            if (entry < value) {
                lower += 1;
            } else if (entry === value) {
                equal += 1;
            }
        });

        return ((lower + Math.max(equal - 1, 0) / 2) / (values.length - 1)) * 100;
    }

    function buildOutcomeSummary(rows, derivedData, outcome, scaleMode) {
        const matching = rows
            .filter((row) => row.outcomeKey === outcome.key)
            .sort((a, b) => a.year - b.year);

        if (matching.length === 0) {
            return {
                ...outcome,
                status: 'missing'
            };
        }

        const earliest = matching[0];
        const latest = matching[matching.length - 1];
        const rawExtent = derivedData.rawExtentByOutcomeSex.get(`${latest.sex}||${outcome.key}`);
        const rawMin = rawExtent ? rawExtent.min : Math.min(earliest.plotValue, latest.plotValue);
        const rawMax = rawExtent ? rawExtent.max : Math.max(earliest.plotValue, latest.plotValue);

        const getPercentile = (row) => quantileRank(
            row.plotValue,
            derivedData.percentileValuesByOutcomeSexYear.get(`${row.sex}||${outcome.key}||${row.year}`) || []
        );

        return {
            ...outcome,
            status: 'ok',
            earliest,
            latest,
            rawMin,
            rawMax,
            plotMin: scaleMode === 'percentile' ? 0 : rawMin,
            plotMax: scaleMode === 'percentile' ? 100 : rawMax,
            earliestValue: scaleMode === 'percentile' ? getPercentile(earliest) : earliest.plotValue,
            latestValue: scaleMode === 'percentile' ? getPercentile(latest) : latest.plotValue,
            hasDistinctYears: earliest.year !== latest.year,
            axisCaption: earliest.year === latest.year ? `${latest.year} only` : `${earliest.year}/${latest.year}`
        };
    }

    function valueToRadius(value, minValue, maxValue, innerRadius, outerRadius) {
        if (!Number.isFinite(value) || !Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
            return innerRadius;
        }
        if (maxValue <= minValue) {
            return (innerRadius + outerRadius) / 2;
        }
        const share = (value - minValue) / (maxValue - minValue);
        return innerRadius + Math.max(0, Math.min(1, share)) * (outerRadius - innerRadius);
    }

    function formatAxisValue(value, scaleMode) {
        if (!Number.isFinite(value)) {
            return '';
        }
        if (scaleMode === 'percentile') {
            return `${Math.round(value)}`;
        }
        return roundStarValue(value);
    }

    function appendTraditionalValueLabel(group, point, value, angle, color, isOutside, isMobile, scaleMode) {
        const radialDistance = isOutside ? 12 : -12;
        const x = point.x + Math.cos(angle) * radialDistance;
        const y = point.y + Math.sin(angle) * radialDistance;
        const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : (Math.cos(angle) > 0
            ? (isOutside ? 'start' : 'end')
            : (isOutside ? 'end' : 'start'));

        group.append('text')
            .attr('x', x)
            .attr('y', y)
            .attr('fill', color)
            .attr('font-size', isMobile ? 9 : 11)
            .attr('text-anchor', anchor)
            .attr('dominant-baseline', Math.abs(Math.sin(angle)) < 0.2 ? 'middle' : (Math.sin(angle) > 0
                ? (isOutside ? 'hanging' : 'ideographic')
                : (isOutside ? 'ideographic' : 'hanging')))
            .text(formatAxisValue(value, scaleMode));
    }

    function renderLegend(wrapper, legendSvgId, width) {
        const legendItems = [
            { label: 'Earlier year', color: '#d62728', fill: 'rgba(214, 39, 40, 0.08)' },
            { label: 'More recent year', color: '#1f4aff', fill: 'rgba(31, 74, 255, 0.08)' }
        ];

        const svg = wrapper.append('svg')
            .attr('id', legendSvgId)
            .attr('class', 'traditional-star-legend-svg')
            .attr('width', Math.min(width, 420))
            .attr('height', 28);

        const entry = svg.selectAll('g')
            .data(legendItems)
            .enter()
            .append('g')
            .attr('transform', (d, i) => `translate(${10 + i * 190}, 14)`);

        entry.append('line')
            .attr('x1', 0)
            .attr('y1', 0)
            .attr('x2', 18)
            .attr('y2', 0)
            .attr('stroke', d => d.color)
            .attr('stroke-width', 2.2);

        entry.append('circle')
            .attr('cx', 9)
            .attr('cy', 0)
            .attr('r', 4)
            .attr('fill', '#ffffff')
            .attr('stroke', d => d.color)
            .attr('stroke-width', 2);

        entry.append('text')
            .attr('x', 28)
            .attr('y', 4)
            .attr('font-size', 14)
            .attr('font-weight', 700)
            .text(d => d.label);
    }

    function renderTraditionalChart(country, sex, rows, derivedData, scaleMode) {
        const chartId = `${containerId}-${country}-${sex}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
        const chartSvgId = `traditional-star-chart-${chartId}`;
        const legendSvgId = `traditional-star-legend-${chartId}`;
        const viewportWidth = Math.max(window.innerWidth - 28, 280);
        const isMobile = viewportWidth <= 420;
        const wrapper = chartHost.append('div').attr('class', 'multi-outcome-chart star-chart-wrapper traditional-star-wrapper').attr('id', chartId);
        const locationLabel = getCountryLabel(country);
        const titleText = sex === 'both' ? locationLabel : `${locationLabel} (${sex})`;
        const downloadFileName = `${titleText.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim()} traditional star plot.png`;

        wrapper.append('h3')
            .attr('class', 'multi-outcome-title')
            .text(titleText);

        const width = isMobile ? Math.max(viewportWidth + 120, 430) : Math.min(viewportWidth, 720);
        const height = width * 0.82;
        const outerRadius = Math.min(width, height) * 0.29;
        const innerRadius = outerRadius * 0.12;
        const labelRadius = outerRadius + (isMobile ? 34 : 48);
        const centerX = (width / 2) + 4;
        const centerY = height / 2 - 28;
        const baseAngle = -Math.PI / 2;
        const ringCount = 5;
        const axisLabelFontSize = isMobile ? 12 : 14;
        const axisSubtitleFontSize = isMobile ? 10 : 11;
        const scaleLabelFontSize = isMobile ? 9 : 11;
        const line = d3.line().curve(d3.curveLinearClosed);
        const scaleDescription = scaleMode === 'percentile' ? 'Percentile scale (0-100)' : 'Raw value scale (min-max)';

        const svg = wrapper.append('svg')
            .attr('id', chartSvgId)
            .attr('width', width)
            .attr('height', height)
            .style('font-family', 'Arial, sans-serif');

        svg.append('text')
            .attr('x', 14)
            .attr('y', 20)
            .attr('fill', '#555')
            .attr('font-size', 12)
            .text(scaleDescription);

        const gridGroup = svg.append('g');
        const axisGroup = svg.append('g');
        const polygonPathGroup = svg.append('g');
        const polygonPointGroup = svg.append('g');
        const labelGroup = svg.append('g');
        const summaries = starOutcomeConfig.map((outcome) => buildOutcomeSummary(rows, derivedData, outcome, scaleMode));

        for (let ring = 0; ring < ringCount; ring += 1) {
            const radius = innerRadius + ((outerRadius - innerRadius) * ring / (ringCount - 1));
            const ringPoints = d3.range(starOutcomeConfig.length).map((i) => {
                const angle = baseAngle + (Math.PI * 2 * i / starOutcomeConfig.length);
                return [
                    centerX + radius * Math.cos(angle),
                    centerY + radius * Math.sin(angle)
                ];
            });

            gridGroup.append('path')
                .attr('d', line(ringPoints))
                .attr('fill', 'none')
                .attr('stroke', ring === ringCount - 1 ? '#c1c1c1' : '#e0e0e0')
                .attr('stroke-width', ring === ringCount - 1 ? 1.2 : 1);
        }

        const latestPoints = [];
        const earliestPoints = [];

        summaries.forEach((summary, index) => {
            const angle = baseAngle + (Math.PI * 2 * index / starOutcomeConfig.length);
            const axisEnd = {
                x: centerX + outerRadius * Math.cos(angle),
                y: centerY + outerRadius * Math.sin(angle)
            };

            gridGroup.append('line')
                .attr('x1', centerX)
                .attr('y1', centerY)
                .attr('x2', axisEnd.x)
                .attr('y2', axisEnd.y)
                .attr('stroke', '#b8b8b8')
                .attr('stroke-width', 1.4);

            const labelPoint = {
                x: centerX + labelRadius * Math.cos(angle),
                y: centerY + labelRadius * Math.sin(angle)
            };
            const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
            const axisLabel = axisGroup.append('text')
                .attr('x', labelPoint.x)
                .attr('y', labelPoint.y)
                .attr('text-anchor', anchor)
                .attr('class', 'star-axis-label')
                .attr('font-size', axisLabelFontSize);

            summary.labelLines.forEach((lineText, lineIndex) => {
                axisLabel.append('tspan')
                    .attr('x', labelPoint.x)
                    .attr('dy', lineIndex === 0 ? 0 : (isMobile ? 13 : 16))
                    .text(lineText);
            });

            axisGroup.append('text')
                .attr('x', labelPoint.x)
                .attr('y', labelPoint.y + summary.labelLines.length * (isMobile ? 13 : 16) + 4)
                .attr('text-anchor', anchor)
                .attr('class', 'star-axis-subtitle')
                .attr('font-size', axisSubtitleFontSize)
                .text(summary.status === 'ok' ? summary.axisCaption : 'No data');

            if (summary.status !== 'ok') {
                return;
            }

            const outerLabelPoint = {
                x: centerX + (outerRadius + 14) * Math.cos(angle),
                y: centerY + (outerRadius + 14) * Math.sin(angle)
            };

            axisGroup.append('text')
                .attr('x', outerLabelPoint.x)
                .attr('y', outerLabelPoint.y)
                .attr('fill', '#666')
                .attr('font-size', scaleLabelFontSize)
                .attr('text-anchor', anchor)
                .text(formatAxisValue(summary.plotMax, scaleMode));

            const earliestRadius = valueToRadius(summary.earliestValue, summary.plotMin, summary.plotMax, innerRadius, outerRadius);
            const latestRadius = valueToRadius(summary.latestValue, summary.plotMin, summary.plotMax, innerRadius, outerRadius);
            const earliestPoint = {
                x: centerX + earliestRadius * Math.cos(angle),
                y: centerY + earliestRadius * Math.sin(angle)
            };
            const latestPoint = {
                x: centerX + latestRadius * Math.cos(angle),
                y: centerY + latestRadius * Math.sin(angle)
            };

            earliestPoints.push([earliestPoint.x, earliestPoint.y]);
            latestPoints.push([latestPoint.x, latestPoint.y]);

            polygonPointGroup.append('circle')
                .attr('cx', latestPoint.x)
                .attr('cy', latestPoint.y)
                .attr('r', isMobile ? 4 : 4.5)
                .attr('fill', '#ffffff')
                .attr('stroke', '#1f4aff')
                .attr('stroke-width', 2);

            const latestIsOutside = !summary.hasDistinctYears || summary.latestValue >= summary.earliestValue;
            appendTraditionalValueLabel(labelGroup, latestPoint, summary.latestValue, angle, '#1f4aff', latestIsOutside, isMobile, scaleMode);

            if (summary.hasDistinctYears) {
                polygonPointGroup.append('circle')
                    .attr('cx', earliestPoint.x)
                    .attr('cy', earliestPoint.y)
                    .attr('r', isMobile ? 4 : 4.5)
                    .attr('fill', '#ffffff')
                    .attr('stroke', '#d62728')
                    .attr('stroke-width', 2);

                appendTraditionalValueLabel(labelGroup, earliestPoint, summary.earliestValue, angle, '#d62728', !latestIsOutside, isMobile, scaleMode);
            }
        });

        if (earliestPoints.length >= 3) {
            polygonPathGroup.append('path')
                .attr('d', line(earliestPoints))
                .attr('fill', 'rgba(214, 39, 40, 0.08)')
                .attr('stroke', '#d62728')
                .attr('stroke-width', 2);
        }

        if (latestPoints.length >= 3) {
            polygonPathGroup.append('path')
                .attr('d', line(latestPoints))
                .attr('fill', 'rgba(31, 74, 255, 0.08)')
                .attr('stroke', '#1f4aff')
                .attr('stroke-width', 2.2);
        }

        renderLegend(wrapper, legendSvgId, width);

        wrapper.append('button')
            .attr('class', 'figure-download-btn')
            .text('Download figure')
            .on('click', function() {
                downloadCombinedSVG(chartSvgId, legendSvgId, downloadFileName, {
                    canvasPadding: 6,
                    bottomPadding: 4,
                    legendGap: 0,
                    legendOffsetY: -4,
                    centerChart: true,
                    centerLegend: true,
                    chart: {
                        titleText,
                        titleHeight: 30,
                        titleFontSize: 18,
                        margin: { top: 4, right: 24, bottom: 4, left: 14 }
                    },
                    legend: {
                        margin: { top: 0, right: 4, bottom: 0, left: 4 }
                    }
                });
            });
    }

    async function renderAll() {
        const rows = await loadStarData(dataFile);
        const derivedData = buildTraditionalStarDerivedData(rows);
        const scaleMode = traditionalStarScaleState[containerId] || 'raw';
        chartHost.html('');

        if (selectedCountries.length === 0 || selectedSex.length === 0) {
            renderMessage('Select location and sex');
            return;
        }

        let chartCount = 0;
        selectedCountries.forEach((country) => {
            selectedSex.forEach((sex) => {
                const countrySexRows = derivedData.rowsByLidSex.get(`${String(country)}||${sex}`) || [];
                if (countrySexRows.length > 0) {
                    renderTraditionalChart(country, sex, countrySexRows, derivedData, scaleMode);
                    chartCount += 1;
                }
            });
        });

        if (chartCount === 0) {
            renderMessage('No spider-plot data for the current selection');
        }
    }

    function selectionChanged() {
        renderAll();
    }

    function collapsedHandler() {
        document.removeEventListener(`countrywasSelected-${containerId}`, selectionChanged);
        document.removeEventListener(`sexwasSelected-${containerId}`, selectionChanged);
        document.removeEventListener(`${containerId}-collapsed`, collapsedHandler);
    }

    toggle.on('change', function(event) {
        traditionalStarScaleState[containerId] = event.target.checked ? 'percentile' : 'raw';
        renderAll();
    });

    document.addEventListener(`countrywasSelected-${containerId}`, selectionChanged);
    document.addEventListener(`sexwasSelected-${containerId}`, selectionChanged);
    document.addEventListener(`${containerId}-collapsed`, collapsedHandler);

    renderAll();
}
