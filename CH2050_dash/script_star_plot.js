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
            latest.plotValue < earliest.plotValue &&
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
            earliestVisible: earliest.rawValue >= 0,
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

    function renderLegend(wrapper, legendSvgId, width) {
        const legendItems = [
            { label: 'Baseline year value', shape: 'square', color: '#d62728' },
            { label: 'Most recent value', shape: 'circle', color: '#1f4aff' },
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
            if (d.shape === 'square') {
                g.append('rect')
                    .attr('x', 0)
                    .attr('y', -7)
                    .attr('width', 14)
                    .attr('height', 14)
                    .attr('fill', d.color);
            } else if (d.shape === 'circle') {
                g.append('circle')
                    .attr('cx', 7)
                    .attr('cy', 0)
                    .attr('r', 7)
                    .attr('fill', d.color);
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
        const height = width * 0.98;
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
        const squareSize = isMobile ? 8 : 12;
        const circleRadius = isMobile ? 4.5 : 6.5;
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

            if (summary.earliestVisible) {
                markerGroup.append('rect')
                    .attr('x', markerBasePoint.x - (squareSize / 2))
                    .attr('y', markerBasePoint.y - (squareSize / 2))
                    .attr('width', squareSize)
                    .attr('height', squareSize)
                    .attr('fill', '#d62728')
                    .attr('stroke', '#ffffff')
                    .attr('stroke-width', 1);
            }

            if (summary.latestVisible) {
                markerGroup.append('circle')
                    .attr('cx', markerLatestPoint.x)
                    .attr('cy', markerLatestPoint.y)
                    .attr('r', circleRadius)
                    .attr('fill', '#1f4aff')
                    .attr('stroke', '#ffffff')
                    .attr('stroke-width', 1.2);
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
                drawValueLabel(valueLabelGroup, goalPoint, roundStarValue(summary.goalValue), angle, '#444444', 1, '', pointLabelTangentDistance, pointLabelRadialDistance)
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
