const heightAgeOutcomeConfig = [
    { key: 'ncdcmage1985', label: '1985' },
    { key: 'ncdcmage1990', label: '1990' },
    { key: 'ncdcmage2000', label: '2000' },
    { key: 'ncdcmage2010', label: '2010' },
    { key: 'ncdcmage2019', label: '2019' }
];

function defaultHeightAgeRange(extent) {
    const preferred = [5, 19];
    if (!extent || extent[0] === undefined || extent[1] === undefined) {
        return preferred;
    }
    if (extent[1] < preferred[0] || extent[0] > preferred[1]) {
        return [extent[0], extent[1]];
    }
    return [Math.max(extent[0], preferred[0]), Math.min(extent[1], preferred[1])];
}

function drawMultiHeightAgeFigures(containerId) {
    const container = document.getElementById(containerId);
    const dataPath = container.getAttribute('data-file') || 'data';
    const dataDir = dataPath.endsWith('.csv') ? dataPath.split('/').slice(0, -1).join('/') : dataPath;
    const xVar = container.getAttribute('data-x-var') || 'age';

    container.innerHTML = '';

    const controls = d3.select(`#${containerId}`)
        .append('div')
        .attr('class', 'multi-outcome-filters');

    controls.append('div')
        .attr('class', 'multi-outcome-filters-title')
        .text('Years to include in each figure:');

    const controlsList = controls.append('div').attr('class', 'multi-outcome-filters-list');
    const selectedOutcomes = new Set(['ncdcmage2019']);
    let selectedRange = null;

    heightAgeOutcomeConfig.forEach(outcome => {
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
        .attr('id', `multi-height-age-slider-${containerId}`)
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
        return heightAgeOutcomeConfig.filter(d => selectedOutcomes.has(d.key));
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

    function getAgeExtent(selectedOutcomeConfig) {
        const ages = [];
        selectedOutcomeConfig.forEach(outcome => {
            selectedCountries.forEach(country => {
                selectedSex.forEach(sex => {
                    const series = getSeriesRows(country, sex, outcome.key);
                    series.forEach(row => {
                        if (Number.isFinite(row.value)) {
                            ages.push(row[xVar]);
                        }
                    });
                });
            });
        });
        return d3.extent(ages);
    }

    function ensureSlider(extent) {
        const sliderEl = document.getElementById(`multi-height-age-slider-${containerId}`);
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
                        age: row[xVar],
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
        d3.selectAll('div.multi-tooltip-height-age').remove();
        chartHost.html('');

        const selectedOutcomeConfig = getSelectedOutcomeConfig();
        if (selectedCountries.length === 0 || selectedSex.length === 0) {
            chartHost.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('Select location and sex');
            return;
        }
        if (selectedOutcomeConfig.length === 0) {
            chartHost.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('Select at least one year');
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
                    renderMultiHeightAgeChart(chartHost, containerId, country, sex, longData, selectedOutcomeConfig, createHalfwayTicks);
                    chartCount += 1;
                }
            });
        });

        if (chartCount === 0) {
            chartHost.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('No height-by-age data for this selection in the selected age range');
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
        const extent = getAgeExtent(selectedOutcomeConfig);
        if (!extent || extent[0] === undefined || extent[1] === undefined) {
            sliderWrap.style('display', 'none');
            selectedRange = null;
            renderChartsOnly();
            return;
        }

        sliderWrap.style('display', null);
        if (resetRange || !selectedRange || selectedRange[0] < extent[0] || selectedRange[1] > extent[1]) {
            selectedRange = defaultHeightAgeRange(extent);
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
        d3.selectAll('div.multi-tooltip-height-age').remove();
    });

    renderAll(true);
}

function renderMultiHeightAgeChart(chartHost, containerId, country, sex, longData, selectedOutcomeConfig, createHalfwayTicks) {
    const chartId = `${containerId}-${country}-${sex}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
    const wrapper = chartHost.append('div').attr('class', 'multi-outcome-chart').attr('id', chartId);
    const chartSvgId = `multi-height-age-chart-${chartId}`;
    const legendSvgId = `multi-height-age-legend-${chartId}`;

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

    const xExtent = d3.extent(longData, d => d.age);
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
        .text('Age in years')
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    svg.append('text')
        .attr('y', -20)
        .attr('x', -margin.left + 25)
        .text('Height (cm)')
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    const outcomeColor = d3.scaleOrdinal(d3.schemeCategory10).domain(selectedOutcomeConfig.map(d => d.key));

    const line = d3.line()
        .defined(d => d.value !== null && !isNaN(d.value))
        .x(d => xScale(d.age))
        .y(d => yScale(d.value));

    const grouped = d3.group(longData, d => d.outcomeKey);

    grouped.forEach((series, outcomeKey) => {
        const sortedSeries = [...series].sort((a, b) => a.age - b.age);
        svg.append('path')
            .datum(sortedSeries)
            .attr('fill', 'none')
            .attr('stroke', outcomeColor(outcomeKey))
            .attr('stroke-width', 2.7)
            .attr('d', line);
    });

    const plottedOutcomeKeys = new Set(grouped.keys());
    const legendOutcomes = selectedOutcomeConfig.filter(d => plottedOutcomeKeys.has(d.key));

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

    const legendLabels = legendOutcomes.map(d => d.label);
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
    const positions = legendOutcomes.map((d, i) => {
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
        .data(legendOutcomes)
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
        .attr('class', 'multi-tooltip-height-age')
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

    const byAge = d3.group(longData, d => d.age);
    svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
        .on('mousemove', function(event) {
            const mouseX = d3.pointer(event, this)[0];
            const xPoint = Math.round(xScale.invert(mouseX));
            verticalLine.attr('x1', mouseX).attr('x2', mouseX).attr('opacity', 1);

            const values = byAge.get(xPoint) || [];
            if (values.length === 0) {
                tooltip.style('display', 'none');
                return;
            }

            let html = `<strong>Age: ${xPoint}</strong><br>`;
            const uniqueByOutcome = new Map();
            values.forEach(point => uniqueByOutcome.set(point.outcomeKey, point));
            Array.from(uniqueByOutcome.values()).sort((a, b) => a.outcomeLabel.localeCompare(b.outcomeLabel)).forEach(d => {
                const noteText = d.note ? ` <em>(${d.note})</em>` : '';
                html += `${d.outcomeLabel}: ${d3.format('.1f')(d.value)}${noteText}<br>`;
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
