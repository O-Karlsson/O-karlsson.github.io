const heightOutcomeConfig = [
    { key: 'ncdcm5', label: 'Height at age 5' },
    { key: 'ncdcm10', label: 'Height at age 10' },
    { key: 'ncdcm15', label: 'Height at age 15' },
    { key: 'ncdcm19', label: 'Height at age 19' }
];

function defaultHeightRange(extent) {
    const preferred = [1970, 2023];
    if (!extent || extent[0] === undefined || extent[1] === undefined) {
        return preferred;
    }
    if (extent[1] < preferred[0] || extent[0] > preferred[1]) {
        return [extent[0], extent[1]];
    }
    return [Math.max(extent[0], preferred[0]), Math.min(extent[1], preferred[1])];
}

function drawMultiHeightFigures(containerId) {
    const container = document.getElementById(containerId);
    const dataFile = container.getAttribute('data-file');
    const xVar = container.getAttribute('data-x-var') || 'year';

    container.innerHTML = '';

    const controls = d3.select(`#${containerId}`)
        .append('div')
        .attr('class', 'multi-outcome-filters');

    controls.append('div')
        .attr('class', 'multi-outcome-filters-title')
        .text('Height outcomes to include in each figure:');

    const controlsList = controls.append('div').attr('class', 'multi-outcome-filters-list');
    const selectedOutcomes = new Set(heightOutcomeConfig.map(d => d.key));
    let selectedRange = null;

    heightOutcomeConfig.forEach(outcome => {
        const row = controlsList.append('label').attr('class', 'multi-outcome-filter-item');
        row.append('input')
            .attr('type', 'checkbox')
            .attr('value', outcome.key)
            .property('checked', true)
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
        .attr('class', 'multi-outcome-slider-title')
        .text('Year range:');

    sliderWrap.append('div')
        .attr('id', `multi-height-slider-${containerId}`)
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
        return heightOutcomeConfig.filter(d => selectedOutcomes.has(d.key));
    }

    function getRowsForCountry(country) {
        const countryRows = fullData[dataFile].filter(d => d.country === country);
        if (countryRows.length === 0) {
            return [];
        }

        // One figure per country: choose one sex series based on current selection and availability.
        const preferredSexOrder = selectedSex.includes('both')
            ? ['both', ...selectedSex.filter(s => s !== 'both')]
            : [...selectedSex];

        for (const sex of preferredSexOrder) {
            const rows = countryRows.filter(d => d.sex === sex);
            if (rows.length > 0) {
                return rows;
            }
        }

        return [];
    }

    function getYearExtent(selectedOutcomeConfig) {
        const years = [];
        selectedCountries.forEach(country => {
            const rows = getRowsForCountry(country);
            rows.forEach(row => {
                const hasAnyOutcome = selectedOutcomeConfig.some(outcome => row[outcome.key] !== null && !isNaN(row[outcome.key]));
                if (hasAnyOutcome) {
                    years.push(row[xVar]);
                }
            });
        });
        return d3.extent(years);
    }

    function ensureSlider(extent) {
        const sliderEl = document.getElementById(`multi-height-slider-${containerId}`);
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

    function renderChartsOnly() {
        d3.selectAll('div.multi-tooltip').remove();
        chartHost.html('');

        const selectedOutcomeConfig = getSelectedOutcomeConfig();
        if (selectedCountries.length === 0 || selectedSex.length === 0) {
            chartHost.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('Select location and sex');
            return;
        }
        if (selectedOutcomeConfig.length === 0) {
            chartHost.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('Select at least one height outcome');
            return;
        }
        if (!selectedRange) {
            chartHost.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('No data for current selection');
            return;
        }

        let chartCount = 0;
        selectedCountries.forEach(country => {
            const rows = getRowsForCountry(country);
            const hasDataInRange = selectedOutcomeConfig.some(outcome =>
                rows.some(d => d[xVar] >= selectedRange[0] && d[xVar] <= selectedRange[1] && d[outcome.key] !== null && !isNaN(d[outcome.key]))
            );

            if (hasDataInRange) {
                renderMultiHeightChart(chartHost, containerId, country, rows, selectedOutcomeConfig, xVar, selectedRange, createHalfwayTicks);
                chartCount += 1;
            }
        });

        if (chartCount === 0) {
            chartHost.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('No height data for this selection in the selected year range');
        }
    }

    async function renderAll(resetRange) {
        await loadFullData(dataFile);

        const selectedOutcomeConfig = getSelectedOutcomeConfig();
        if (selectedCountries.length === 0 || selectedSex.length === 0 || selectedOutcomeConfig.length === 0) {
            sliderWrap.style('display', selectedOutcomeConfig.length === 0 ? null : 'none');
            if (resetRange) { selectedRange = null; }
            renderChartsOnly();
            return;
        }

        const extent = getYearExtent(selectedOutcomeConfig);
        if (!extent || extent[0] === undefined || extent[1] === undefined) {
            sliderWrap.style('display', 'none');
            selectedRange = null;
            renderChartsOnly();
            return;
        }

        sliderWrap.style('display', null);
        if (resetRange || !selectedRange || selectedRange[0] < extent[0] || selectedRange[1] > extent[1]) {
            selectedRange = defaultHeightRange(extent);
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

function renderMultiHeightChart(chartHost, containerId, country, rows, selectedOutcomeConfig, xVar, selectedRange, createHalfwayTicks) {
    const longData = [];

    selectedOutcomeConfig.forEach(outcome => {
        rows.forEach(row => {
            if (
                row[xVar] >= selectedRange[0] &&
                row[xVar] <= selectedRange[1] &&
                row[outcome.key] !== null &&
                !isNaN(row[outcome.key])
            ) {
                longData.push({
                    country,
                    year: row[xVar],
                    outcomeKey: outcome.key,
                    outcomeLabel: outcome.label,
                    value: row[outcome.key],
                    note: row[`note_${outcome.key}`]
                });
            }
        });
    });

    if (longData.length === 0) {
        return;
    }

    const chartId = `${containerId}-${country}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
    const wrapper = chartHost.append('div').attr('class', 'multi-outcome-chart').attr('id', chartId);

    wrapper.append('h3').attr('class', 'multi-outcome-title').text(`${country}`);

    const margin = { top: 40, right: 25, bottom: 80, left: 43 };
    const width = Math.min(window.innerWidth - 60, 600);
    const height = width * 0.7;

    const svg = wrapper.append('svg')
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
    const { ticks: yTicks, halfTicks: yHalfTicks } = createHalfwayTicks(yScale, 10);

    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickValues(xTicks).tickFormat(d3.format('d')))
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    svg.append('g')
        .call(d3.axisLeft(yScale))
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
        .text('Height (cm)')
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    const outcomeColor = d3.scaleOrdinal(d3.schemeCategory10).domain(selectedOutcomeConfig.map(d => d.key));

    const line = d3.line()
        .defined(d => d.value !== null && !isNaN(d.value))
        .x(d => xScale(d.year))
        .y(d => yScale(d.value));

    const grouped = d3.group(longData, d => d.outcomeKey);

    grouped.forEach((series, outcomeKey) => {
        const uniqueByYear = new Map();
        series.forEach(point => uniqueByYear.set(point.year, point));
        const sortedSeries = Array.from(uniqueByYear.values()).sort((a, b) => a.year - b.year);

        svg.append('path')
            .datum(sortedSeries)
            .attr('fill', 'none')
            .attr('stroke', outcomeColor(outcomeKey))
            .attr('stroke-width', 2.7)
            .attr('d', line);
    });

    const legend = wrapper.append('div').attr('class', 'multi-outcome-legend');
    selectedOutcomeConfig.forEach(outcome => {
        const item = legend.append('div').attr('class', 'multi-outcome-legend-item');
        item.append('span').attr('class', 'multi-outcome-legend-swatch').style('background-color', outcomeColor(outcome.key));
        item.append('span').text(outcome.label);
    });

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

    svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
        .on('mousemove', function(event) {
            const mouseX = d3.pointer(event, this)[0];
            const xPoint = Math.round(xScale.invert(mouseX));

            verticalLine.attr('x1', mouseX).attr('x2', mouseX).attr('opacity', 1);

            const values = longData.filter(d => d.year === xPoint);
            if (values.length === 0) {
                tooltip.style('display', 'none');
                return;
            }

            let html = `<strong>Year: ${xPoint}</strong><br>`;
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
}
