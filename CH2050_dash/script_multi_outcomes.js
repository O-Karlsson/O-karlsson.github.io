const mortalityOutcomeConfig = [
    { key: 'imr', label: 'Infant mortality' },
    { key: 'cmr', label: 'Child mortality (1-4 years)' },
    { key: 'q5_10', label: 'Mortality age 5-9 years' },
    { key: 'q10_15', label: 'Mortality age 10-15 years' },
    { key: 'q15_19', label: 'Mortality age 15-19 years' },
    { key: 'u5m', label: 'Under-5 mortality' },
    { key: 'nmr', label: 'Neonatal mortality' },
    { key: 'pnm', label: 'Postneonatal mortality' },
    { key: 'unnmr', label: 'Neonatal mortality (UN-IGME)' },
    { key: 'gbdnmr', label: 'Neonatal mortality (GBD)' }
];

function getCountryLabel(countryId) {
    if (typeof getLocationDisplay === 'function') {
        return getLocationDisplay(countryId);
    }
    return String(countryId);
}

function defaultMortalityRange(extent) {
    const preferred = [1970, 2023];
    if (!extent || extent[0] === undefined || extent[1] === undefined) {
        return preferred;
    }
    if (extent[1] < preferred[0] || extent[0] > preferred[1]) {
        return [extent[0], extent[1]];
    }
    return [Math.max(extent[0], preferred[0]), Math.min(extent[1], preferred[1])];
}

function downloadCombinedSVG(chartSvgId, legendSvgId, fileName) {
    const chartSVG = document.getElementById(chartSvgId);
    const legendSVG = document.getElementById(legendSvgId);
    if (!chartSVG) {
        return;
    }

    const chartRect = chartSVG.getBoundingClientRect();
    const legendRect = legendSVG ? legendSVG.getBoundingClientRect() : { width: 0, height: 0 };
    const padding = 20;
    const totalWidth = Math.max(chartRect.width, legendRect.width) + padding * 2;
    const totalHeight = chartRect.height + legendRect.height + padding * 3;

    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, totalWidth, totalHeight);

    const renderSVG = (svg, yPos) => {
        return new Promise(resolve => {
            if (!svg) {
                resolve();
                return;
            }
            const xml = new XMLSerializer().serializeToString(svg);
            const img = new Image();
            const blob = new Blob([xml], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);

            img.onload = function() {
                context.drawImage(img, padding, yPos, svg.getBoundingClientRect().width, svg.getBoundingClientRect().height);
                URL.revokeObjectURL(url);
                resolve();
            };
            img.src = url;
        });
    };

    renderSVG(chartSVG, padding)
        .then(() => renderSVG(legendSVG, chartRect.height + padding * 2))
        .then(() => {
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = fileName;
            link.click();
        });
}

function drawMultiOutcomeFigures(containerId) {
    const container = document.getElementById(containerId);
    const dataPath = container.getAttribute('data-file') || 'data';
    const dataDir = dataPath.endsWith('.csv') ? dataPath.split('/').slice(0, -1).join('/') : dataPath;
    const xVar = container.getAttribute('data-x-var') || 'year';

    container.innerHTML = '';

    const controls = d3.select(`#${containerId}`)
        .append('div')
        .attr('class', 'multi-outcome-filters');

    controls.append('div')
        .attr('class', 'multi-outcome-filters-title')
        .text('Outcomes to include in each figure:');

    const controlsList = controls.append('div').attr('class', 'multi-outcome-filters-list');
    const selectedOutcomes = new Set(['imr', 'cmr']);
    let selectedRange = null;

    mortalityOutcomeConfig.forEach(outcome => {
        const row = controlsList.append('label').attr('class', 'multi-outcome-filter-item');
        row.append('input')
            .attr('type', 'checkbox')
            .attr('value', outcome.key)
            .property('checked', selectedOutcomes.has(outcome.key))
            .on('change', function(event) {
                if (event.target.checked) {
                    selectedOutcomes.add(outcome.key);
                } else {
                    selectedOutcomes.delete(outcome.key);
                }
                renderAll(true);
            });
        row.append('span').text(outcome.label);
    });

    const sliderWrap = d3.select(`#${containerId}`)
        .append('div')
        .attr('class', 'multi-outcome-slider-wrap');

    sliderWrap.append('div')
        .attr('id', `multi-outcome-slider-${containerId}`)
        .attr('class', 'line-year-slider');

    const chartHost = d3.select(`#${containerId}`).append('div').attr('id', `${containerId}-charts`);

    function createHalfwayTicks(scale, tickCount) {
        const ticks = scale.ticks(tickCount);
        const halfTicks = [];
        for (let i = 0; i < ticks.length - 1; i += 1) {
            halfTicks.push((ticks[i] + ticks[i + 1]) / 2);
        }
        return { ticks, halfTicks };
    }

    function getSelectedOutcomeConfig() {
        return mortalityOutcomeConfig.filter(d => selectedOutcomes.has(d.key));
    }

    function getOutcomeFile(outcomeKey) {
        return `${dataDir}/${outcomeKey}.csv`;
    }

    function getSeriesRows(country, sex, outcomeKey) {
        const dataFile = getOutcomeFile(outcomeKey);
        const index = fullDataIndex[dataFile];
        return index?.byOutcomeCountrySex?.get(outcomeKey)?.get(country)?.get(sex) || [];
    }

    async function ensureOutcomeData(selectedOutcomeConfig) {
        const files = selectedOutcomeConfig.map(o => getOutcomeFile(o.key));
        await Promise.all(files.map(file => loadFullData(file)));
    }

    function getYearExtent(selectedOutcomeConfig) {
        const years = [];
        selectedOutcomeConfig.forEach(outcome => {
            selectedCountries.forEach(country => {
                selectedSex.forEach(sex => {
                    const series = getSeriesRows(country, sex, outcome.key);
                    series.forEach(row => {
                        if (Number.isFinite(row.value)) {
                            years.push(row[xVar]);
                        }
                    });
                });
            });
        });
        return d3.extent(years);
    }

    function ensureSlider(extent) {
        const sliderEl = document.getElementById(`multi-outcome-slider-${containerId}`);
        if (!sliderEl) { return; }

        if (!extent || extent[0] === undefined || extent[1] === undefined) {
            if (sliderEl.noUiSlider) {
                sliderEl.noUiSlider.destroy();
            }
            sliderEl.innerHTML = '';
            return;
        }

        if (sliderEl.noUiSlider) {
            sliderEl.noUiSlider.destroy();
        }
        sliderEl.innerHTML = '';
        noUiSlider.create(sliderEl, {
            start: selectedRange,
            connect: true,
            range: { min: extent[0], max: extent[1] },
            step: 1,
            tooltips: true,
            format: { to: value => Math.round(value), from: value => Math.round(value) }
        });

        sliderEl.noUiSlider.on('change', function(values) {
            selectedRange = [Number(values[0]), Number(values[1])];
            renderChartsOnly();
        });
    }

    function buildLongData(country, sex, selectedOutcomeConfig) {
        const longData = [];
        selectedOutcomeConfig.forEach(outcome => {
            const series = getSeriesRows(country, sex, outcome.key);
            series.forEach(row => {
                if (
                    row[xVar] >= selectedRange[0] &&
                    row[xVar] <= selectedRange[1] &&
                    Number.isFinite(row.value)
                ) {
                    longData.push({
                        country,
                        sex,
                        year: row[xVar],
                        outcomeKey: outcome.key,
                        outcomeLabel: outcome.label,
                        value: row.value,
                        note: row.note || ''
                    });
                }
            });
        });
        return longData;
    }

    function renderChartsOnly() {
        d3.selectAll('div.multi-tooltip').remove();
        chartHost.html('');

        const selectedOutcomeConfig = getSelectedOutcomeConfig();
        if (selectedCountries.length === 0 || selectedSex.length === 0) {
            chartHost.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('Select location and sex');
            return;
        }
        if (selectedOutcomeConfig.length === 0) {
            chartHost.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('Select at least one outcome');
            return;
        }
        if (!selectedRange) {
            chartHost.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('No data for current selection');
            return;
        }

        let chartCount = 0;
        selectedCountries.forEach(country => {
            selectedSex.forEach(sex => {
                const longData = buildLongData(country, sex, selectedOutcomeConfig);
                if (longData.length > 0) {
                    renderMultiOutcomeChart(chartHost, containerId, country, sex, longData, selectedOutcomeConfig, createHalfwayTicks);
                    chartCount += 1;
                }
            });
        });

        if (chartCount === 0) {
            chartHost.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('No data for this selection in the selected year range');
        }
    }

    async function renderAll(resetRange) {
        const selectedOutcomeConfig = getSelectedOutcomeConfig();
        if (selectedCountries.length === 0 || selectedSex.length === 0 || selectedOutcomeConfig.length === 0) {
            sliderWrap.style('display', selectedOutcomeConfig.length === 0 ? null : 'none');
            if (resetRange) { selectedRange = null; }
            renderChartsOnly();
            return;
        }

        await ensureOutcomeData(selectedOutcomeConfig);
        const extent = getYearExtent(selectedOutcomeConfig);
        if (!extent || extent[0] === undefined || extent[1] === undefined) {
            sliderWrap.style('display', 'none');
            selectedRange = null;
            renderChartsOnly();
            return;
        }

        sliderWrap.style('display', null);
        if (resetRange || !selectedRange || selectedRange[0] < extent[0] || selectedRange[1] > extent[1]) {
            selectedRange = defaultMortalityRange(extent);
        }

        ensureSlider(extent);
        renderChartsOnly();
    }

    function selectionChanged() {
        renderAll(true);
    }

    document.addEventListener(`countrywasSelected-${containerId}`, selectionChanged);
    document.addEventListener(`sexwasSelected-${containerId}`, selectionChanged);

    document.addEventListener(`${containerId}-collapsed`, function() {
        document.removeEventListener(`countrywasSelected-${containerId}`, selectionChanged);
        document.removeEventListener(`sexwasSelected-${containerId}`, selectionChanged);
        d3.selectAll('div.multi-tooltip').remove();
    });

    renderAll(true);
}

function renderMultiOutcomeChart(chartHost, containerId, country, sex, longData, selectedOutcomeConfig, createHalfwayTicks) {
    const chartId = `${containerId}-${country}-${sex}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
    const wrapper = chartHost.append('div').attr('class', 'multi-outcome-chart').attr('id', chartId);
    const chartSvgId = `multi-chart-${chartId}`;
    const legendSvgId = `multi-legend-${chartId}`;

    wrapper.append('h3').attr('class', 'multi-outcome-title').text(`${getCountryLabel(country)} (${sex})`);

    const margin = { top: 40, right: 25, bottom: 80, left: 43 };
    const width = Math.min(window.innerWidth - 60, 600);
    const height = width * 0.7;

    const svg = wrapper.append('svg')
        .attr('id', chartSvgId)
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .style('font-family', 'Arial, sans-serif')
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    const xExtent = d3.extent(longData, d => d.year);
    const yExtent = d3.extent(longData, d => d.value);

    const xScale = d3.scaleLinear().domain(xExtent).range([0, width]);
    const yScale = d3.scaleLinear().domain(yExtent).nice().range([height, 0]);

    const { ticks: xTicks, halfTicks: xHalfTicks } = createHalfwayTicks(xScale, 6);
    const yTickResult = createHalfwayTicks(yScale, 10);
    const yTicks = yTickResult.ticks.length > 10
        ? yTickResult.ticks.filter((_, i) => i % Math.ceil(yTickResult.ticks.length / 10) === 0)
        : yTickResult.ticks;
    const yHalfTicks = [];
    for (let i = 0; i < yTicks.length - 1; i += 1) {
        yHalfTicks.push((yTicks[i] + yTicks[i + 1]) / 2);
    }

    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickValues(xTicks).tickFormat(d3.format('d')))
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    svg.append('g')
        .call(d3.axisLeft(yScale).tickValues(yTicks))
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickValues([...xTicks, ...xHalfTicks]).tickSize(-height).tickFormat(''))
        .selectAll('line')
        .style('stroke', '#ddd');

    svg.append('g')
        .call(d3.axisLeft(yScale).tickValues([...yTicks, ...yHalfTicks]).tickSize(-width).tickFormat(''))
        .selectAll('line')
        .style('stroke', '#ddd');

    svg.append('text')
        .attr('y', height * 1.15)
        .attr('x', width / 2.1)
        .text('Year')
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    svg.append('text')
        .attr('y', -20)
        .attr('x', -margin.left + 25)
        .text('Mortality (per 1000)')
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    const outcomeColor = d3.scaleOrdinal(d3.schemeCategory10).domain(selectedOutcomeConfig.map(d => d.key));
    const line = d3.line()
        .defined(d => d.value !== null && !isNaN(d.value))
        .x(d => xScale(d.year))
        .y(d => yScale(d.value));

    const grouped = d3.group(longData, d => d.outcomeKey);
    grouped.forEach((series, outcomeKey) => {
        const sortedSeries = [...series].sort((a, b) => a.year - b.year);
        svg.append('path')
            .datum(sortedSeries)
            .attr('fill', 'none')
            .attr('stroke', outcomeColor(outcomeKey))
            .attr('stroke-width', 2.7)
            .attr('d', line);
    });

    const legendFontSize = Math.max(14, width * 0.028);
    const itemHeight = Math.max(30, legendFontSize + 14);
    const lineWidth = 40;
    const textOffsetX = 50;
    const padding = 15;
    const legendSvgWidth = Math.min(window.innerWidth, 600);
    const legendSvg = wrapper.append('svg')
        .attr('id', legendSvgId)
        .attr('class', 'multi-outcome-legend-svg')
        .attr('width', legendSvgWidth);

    const legendLabels = selectedOutcomeConfig.map(d => d.label);
    const measureGroup = legendSvg.append('g').style('visibility', 'hidden');
    const itemWidths = legendLabels.map(label => {
        const textNode = measureGroup.append('text')
            .attr('font-family', 'Arial')
            .style('font-size', `${legendFontSize}px`)
            .text(label);
        const widthPx = textNode.node().getComputedTextLength();
        textNode.remove();
        return textOffsetX + widthPx + padding;
    });
    measureGroup.remove();

    let currentX = 0;
    let currentY = 0;
    const positions = selectedOutcomeConfig.map((d, i) => {
        const itemWidth = itemWidths[i];
        if (currentX + itemWidth > legendSvgWidth && currentX > 0) {
            currentX = 0;
            currentY += itemHeight;
        }
        const pos = { x: currentX, y: currentY };
        currentX += itemWidth;
        return pos;
    });
    legendSvg.attr('height', currentY + itemHeight + 20);

    const legendEntries = legendSvg.selectAll('.legend-entry')
        .data(selectedOutcomeConfig)
        .enter()
        .append('g')
        .attr('class', 'legend-entry')
        .attr('transform', (d, i) => `translate(${positions[i].x}, ${positions[i].y})`);

    legendEntries.append('line')
        .attr('x1', 0)
        .attr('x2', lineWidth)
        .attr('y1', itemHeight / 2)
        .attr('y2', itemHeight / 2)
        .attr('stroke', d => outcomeColor(d.key))
        .attr('stroke-width', 6);

    legendEntries.append('text')
        .attr('x', textOffsetX)
        .attr('y', itemHeight / 2 + 4)
        .text(d => d.label)
        .attr('font-family', 'Arial')
        .style('font-size', `${legendFontSize}px`)
        .attr('alignment-baseline', 'middle');

    const tooltip = d3.select('body').append('div')
        .attr('class', 'multi-tooltip')
        .style('position', 'absolute')
        .style('display', 'none')
        .style('background', 'white')
        .style('border', '1px solid #444')
        .style('border-radius', '4px')
        .style('padding', '8px');

    const verticalLine = svg.append('line')
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', '#333')
        .attr('opacity', 0);

    const byYear = d3.group(longData, d => d.year);
    svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
        .on('mousemove', function(event) {
            const mouseX = d3.pointer(event, this)[0];
            const xPoint = Math.round(xScale.invert(mouseX));
            verticalLine.attr('x1', mouseX).attr('x2', mouseX).attr('opacity', 1);

            const values = byYear.get(xPoint) || [];
            if (values.length === 0) {
                tooltip.style('display', 'none');
                return;
            }

            let html = `<strong>Year: ${xPoint}</strong><br>`;
            const uniqueByOutcome = new Map();
            values.forEach(point => uniqueByOutcome.set(point.outcomeKey, point));
            Array.from(uniqueByOutcome.values()).sort((a, b) => a.outcomeLabel.localeCompare(b.outcomeLabel)).forEach(d => {
                const noteText = d.note ? ` <em>(${d.note})</em>` : '';
                html += `${d.outcomeLabel}: ${roundToTwoSignificantFigures(d.value)}${noteText}<br>`;
            });

            tooltip.html(html)
                .style('left', `${event.pageX + 12}px`)
                .style('top', `${event.pageY - 38}px`)
                .style('display', 'block');
        })
        .on('mouseleave', function() {
            verticalLine.attr('opacity', 0);
            tooltip.style('display', 'none');
        });

    wrapper.append('button')
        .attr('class', 'figure-download-btn')
        .text('Download figure')
        .on('click', function() {
            downloadCombinedSVG(chartSvgId, legendSvgId, `${chartId}.png`);
        });
}
