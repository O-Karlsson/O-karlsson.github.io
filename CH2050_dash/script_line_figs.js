/*************************************************************************************
**************************************************************************************
* Line figure helpers
**************************************************************************************
*************************************************************************************/

const lineSliders = {};
const lineSliderState = {};

function selectionFilter(fullData, currentData, filters, selectedFilters, currentFilter) {
    const removals = currentFilter.filter((c) => !selectedFilters.aim.includes(c));
    const additions = selectedFilters.aim.filter((c) => !currentFilter.includes(c));

    const rowsToAdd = fullData.filter((row) =>
        additions.includes(row[filters.aim]) &&
        selectedFilters.other.includes(row[filters.other]) &&
        selectedFilters.other2.includes(row[filters.other2])
    );

    const rowsToRemove = currentData.filter((row) => removals.includes(row[filters.aim]));
    currentData = currentData.filter((row) => !rowsToRemove.includes(row));
    currentData.push(...rowsToAdd);
    currentFilter = [...selectedFilters.aim];

    return [currentData, currentFilter];
}

function formatTooltipValue(yVar, value) {
    if (yVar === 'cms' || yVar.startsWith('ncdcm')) {
        return d3.format('.1f')(value);
    }
    return roundToTwoSignificantFigures(value);
}

function getCountryLabel(countryId) {
    if (typeof getLocationDisplay === 'function') {
        return getLocationDisplay(countryId);
    }
    return String(countryId);
}

function isValidOutcomeValue(value) {
    return Number.isFinite(value);
}

function getSeriesForCountrySex(dataFile, outcome, country, sex) {
    const index = fullDataIndex[dataFile];
    if (index && index.byOutcomeCountrySex) {
        return index.byOutcomeCountrySex.get(outcome)?.get(country)?.get(sex) || [];
    }
    return [];
}

function getFilteredRows(dataFile, selectedCountries, selectedSex, yVar, xVar, xRange) {
    const rows = [];
    const minX = xRange ? xRange[0] : -Infinity;
    const maxX = xRange ? xRange[1] : Infinity;

    selectedCountries.forEach((country) => {
        selectedSex.forEach((sex) => {
            const series = getSeriesForCountrySex(dataFile, yVar, country, sex);
            for (let i = 0; i < series.length; i += 1) {
                const row = series[i];
                const x = row[xVar];
                if (x < minX || x > maxX || !isValidOutcomeValue(row.value)) {
                    continue;
                }
                rows.push(row);
            }
        });
    });

    return rows;
}

function getDefaultDisplayRange(fullRange, preferredRange) {
    if (!fullRange || fullRange.minX === undefined || fullRange.maxX === undefined) {
        return preferredRange;
    }
    if (fullRange.maxX < preferredRange[0] || fullRange.minX > preferredRange[1]) {
        return [fullRange.minX, fullRange.maxX];
    }
    return [
        Math.max(fullRange.minX, preferredRange[0]),
        Math.min(fullRange.maxX, preferredRange[1])
    ];
}

function calculateMinMax(dataFile, xVar, yVar, selectedCountries, selectedSex) {
    let minX;
    let maxX;

    selectedCountries.forEach((country) => {
        selectedSex.forEach((sex) => {
            const series = getSeriesForCountrySex(dataFile, yVar, country, sex);
            for (let i = 0; i < series.length; i += 1) {
                const row = series[i];
                if (!isValidOutcomeValue(row.value)) {
                    continue;
                }
                const x = row[xVar];
                if (minX === undefined || x < minX) {
                    minX = x;
                }
                if (maxX === undefined || x > maxX) {
                    maxX = x;
                }
            }
        });
    });

    return { minX, maxX };
}

function ensureLineFigureLayout(containerId) {
    const root = d3.select(`#${containerId}`);

    if (root.select('.line-message-area').empty()) {
        root.append('div').attr('class', 'line-message-area');
    }
    if (root.select('.line-chart-area').empty()) {
        root.append('div').attr('class', 'line-chart-area');
    }
    if (root.select('.line-legend-area').empty()) {
        root.append('div').attr('class', 'line-legend-area');
    }
    if (root.select('.line-slider-area').empty()) {
        root.append('div').attr('class', 'line-slider-area');
    }
    if (root.select('.line-download-area').empty()) {
        root.append('div').attr('class', 'line-download-area');
    }
}

function initializeSlider(dataFile, currentData, containerId, xRange, xFullRange, yVar, xVar, xVarTitle, yVarTitle) {
    ensureLineFigureLayout(containerId);

    const sliderArea = d3.select(`#${containerId} .line-slider-area`);
    if (!xFullRange || xFullRange.minX === undefined || xFullRange.maxX === undefined) {
        sliderArea.html('');
        if (lineSliders[containerId] && lineSliders[containerId].noUiSlider) {
            lineSliders[containerId].noUiSlider.destroy();
        }
        delete lineSliders[containerId];
        delete lineSliderState[containerId];
        return;
    }

    lineSliderState[containerId] = {
        dataFile,
        yVar,
        xVar,
        xVarTitle,
        yVarTitle,
        xRange: [...xRange],
        xFullRange,
        suppressChange: false
    };

    let sliderEl = lineSliders[containerId];
    if (!sliderEl) {
        sliderArea.html('');
        sliderEl = sliderArea.append('div')
            .attr('id', `year-slider-${containerId}`)
            .attr('class', 'line-year-slider')
            .node();

        noUiSlider.create(sliderEl, {
            start: xRange,
            connect: true,
            range: { min: xFullRange.minX, max: xFullRange.maxX },
            step: 1,
            tooltips: true,
            format: { to: value => Math.round(value), from: value => Math.round(value) }
        });

        sliderEl.noUiSlider.on('change', function(values) {
            const state = lineSliderState[containerId];
            if (!state || state.suppressChange) {
                return;
            }
            state.xRange = [Number(values[0]), Number(values[1])];
            const updatedData = getFilteredRows(state.dataFile, selectedCountries, selectedSex, state.yVar, state.xVar, state.xRange);
            lineFigure(containerId, updatedData, state.xVar, state.yVar, state.xVarTitle, state.yVarTitle);
        });

        lineSliders[containerId] = sliderEl;
        return;
    }

    sliderEl.noUiSlider.updateOptions({
        range: { min: xFullRange.minX, max: xFullRange.maxX }
    }, false);
    lineSliderState[containerId].suppressChange = true;
    sliderEl.noUiSlider.set(xRange);
    lineSliderState[containerId].suppressChange = false;
}


/*************************************************************************************
**************************************************************************************
* Download figure
**************************************************************************************
*************************************************************************************/

function downloadAsPNG(containerId) {
    const chartSVG = document.getElementById(`theChart-${containerId}`);
    const legendSVG = document.getElementById(`theLegend-${containerId}`);
    if (!chartSVG || !legendSVG) {
        return;
    }

    const chartRect = chartSVG.getBoundingClientRect();
    const legendRect = legendSVG.getBoundingClientRect();
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
            link.download = `${containerId}.png`;
            link.click();
        });
}


/*************************************************************************************
**************************************************************************************
* Drawing the figure and legend
**************************************************************************************
*************************************************************************************/

function lineFigure(containerId, filteredData, xVar, yVar, xVarTitle, yVarTitle) {
    ensureLineFigureLayout(containerId);

    const chartArea = d3.select(`#${containerId} .line-chart-area`);
    const legendArea = d3.select(`#${containerId} .line-legend-area`);
    const messageArea = d3.select(`#${containerId} .line-message-area`);
    const downloadArea = d3.select(`#${containerId} .line-download-area`);

    chartArea.html('');
    legendArea.html('');
    messageArea.html('');
    downloadArea.html('');
    d3.select(`body #line-tooltip-${containerId}`).remove();

    const cleanedData = filteredData.filter(d => isValidOutcomeValue(d.value));

    if (cleanedData.length === 0) {
        const outcomeLabel = yVarTitle.split('(')[0].trim().toLowerCase();
        let message = `No data on ${outcomeLabel} for current selection`;
        if (selectedCountries.length === 0 || selectedSex.length === 0) {
            let whatToSelect = '';
            if (selectedCountries.length === 0) { whatToSelect += 'location'; }
            if (selectedSex.length === 0) { whatToSelect += (whatToSelect.length > 0 ? ' and ' : '') + 'sex'; }
            message = `Select ${whatToSelect}`;
        } else if (selectedCountries.length === 1 && selectedSex.length === 1) {
            message = `No data on ${outcomeLabel} for ${selectedSex[0]}s in ${getCountryLabel(selectedCountries[0])}`;
        }

        messageArea.append('div')
            .attr('id', `${containerId}-selectDataMsg`)
            .attr('class', 'no-data-message-box')
            .append('p')
            .attr('class', 'no-data-message-text')
            .text(message);
        return;
    }

    const margin = { top: 40, right: 25, bottom: 80, left: 43 };
    const width = Math.min(window.innerWidth - 60, 600);
    const height = width * 0.7;

    const svg = chartArea.append('svg')
        .attr('id', `theChart-${containerId}`)
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .style('font-family', 'Arial, sans-serif')
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    const xScale = d3.scaleLinear()
        .domain(d3.extent(cleanedData, d => d[xVar]))
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain(d3.extent(cleanedData, d => d.value))
        .range([height, 0]);

    function createHalfwayTicks(scale, tickCount) {
        const ticks = scale.ticks(tickCount);
        const halfTicks = [];
        for (let i = 0; i < ticks.length - 1; i += 1) {
            halfTicks.push((ticks[i] + ticks[i + 1]) / 2);
        }
        return { ticks, halfTicks };
    }

    function limitTickCount(ticks, maxTicks) {
        if (ticks.length <= maxTicks) {
            return ticks;
        }
        const step = Math.ceil(ticks.length / maxTicks);
        return ticks.filter((_, i) => i % step === 0);
    }

    const { ticks: xTicks, halfTicks: xHalfTicks } = createHalfwayTicks(xScale, 6);
    const yTickResult = createHalfwayTicks(yScale, 10);
    const yTicks = limitTickCount(yTickResult.ticks, 10);
    const yHalfTicks = [];
    for (let i = 0; i < yTicks.length - 1; i += 1) {
        yHalfTicks.push((yTicks[i] + yTicks[i + 1]) / 2);
    }

    svg.append('g')
        .attr('transform', `translate(0, ${height})`)
        .call(d3.axisBottom(xScale).tickValues([...xTicks]).tickFormat(d3.format('d')))
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    svg.append('g')
        .attr('transform', 'translate(0, 0)')
        .call(d3.axisLeft(yScale).tickValues(yTicks))
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    const [minxVar, maxxVar] = d3.extent(cleanedData, item => item[xVar]);
    if (xHalfTicks[0] > xTicks[0] && minxVar <= xTicks[0] - (xHalfTicks[0] - xTicks[0])) {
        xHalfTicks.unshift(xTicks[0] - (xHalfTicks[0] - xTicks[0]));
    }
    if (xHalfTicks.at(-1) < xTicks.at(-1) && maxxVar >= xTicks.at(-1) + (xTicks.at(-1) - xHalfTicks.at(-1))) {
        xHalfTicks.push(xTicks.at(-1) + (xTicks.at(-1) - xHalfTicks.at(-1)));
    }

    const [minyVar, maxyVar] = d3.extent(cleanedData, item => item.value);
    if (yHalfTicks[0] > yTicks[0] && minyVar <= yTicks[0] - (yHalfTicks[0] - yTicks[0])) {
        yHalfTicks.unshift(yTicks[0] - (yHalfTicks[0] - yTicks[0]));
    }
    if (yHalfTicks.at(-1) < yTicks.at(-1) && maxyVar >= yTicks.at(-1) + (yTicks.at(-1) - yHalfTicks.at(-1))) {
        yHalfTicks.push(yTicks.at(-1) + (yTicks.at(-1) - yHalfTicks.at(-1)));
    }

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
        .text(xVarTitle)
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    svg.append('text')
        .attr('y', -20)
        .attr('x', -margin.left + 25)
        .text(yVarTitle)
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    const groupedData = d3.group(cleanedData, d => d.country, d => d.sex);
    const line = d3.line()
        .defined(d => Number.isFinite(d.value))
        .x(d => xScale(d[xVar]))
        .y(d => yScale(d.value));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(selectedCountries);

    const flattenedData = Array.from(groupedData.entries()).flatMap(([country, sexGroups]) =>
        Array.from(sexGroups.entries()).map(([sex, dataPoints]) => ({
            country,
            sex,
            dataPoints,
            color: colorScale(country),
            dashArray: sex === 'male' ? '10,5' : sex === 'female' ? '5,2' : '',
            sLabel: sex === 'male' ? ' (male)' : sex === 'female' ? ' (female)' : ''
        }))
    );

    svg.selectAll('.line-path')
        .data(flattenedData)
        .enter()
        .append('path')
        .attr('class', 'line-path')
        .attr('d', d => line(d.dataPoints))
        .attr('fill', 'none')
        .attr('stroke', d => d.color)
        .attr('stroke-width', 2.7)
        .attr('stroke-dasharray', d => d.dashArray);

    const padding = 15;
    const legendFontSize = Math.max(14, width * 0.028);
    const itemHeight = Math.max(30, legendFontSize + 14);
    const lineWidth = 40;
    const textOffsetX = 50;
    const containerWidth = Math.min(window.innerWidth, 600);
    const legendSvg = legendArea.append('svg')
        .attr('id', `theLegend-${containerId}`)
        .attr('width', containerWidth);

    const legendLabels = flattenedData.map((d) => `${getCountryLabel(d.country)}${d.sLabel}`);
    const measureGroup = legendSvg.append('g').style('visibility', 'hidden');
    const itemWidths = legendLabels.map((label) => {
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
    const positions = flattenedData.map((d, i) => {
        const itemWidth = itemWidths[i];
        if (currentX + itemWidth > containerWidth && currentX > 0) {
            currentX = 0;
            currentY += itemHeight;
        }
        const pos = { x: currentX, y: currentY };
        currentX += itemWidth;
        return pos;
    });
    legendSvg.attr('height', currentY + itemHeight + 20);

    const legendEntries = legendSvg.selectAll('.legend-entry')
        .data(flattenedData)
        .enter()
        .append('g')
        .attr('class', 'legend-entry')
        .attr('transform', (d, i) => `translate(${positions[i].x}, ${positions[i].y})`);

    legendEntries.append('line')
        .attr('x1', 0)
        .attr('x2', lineWidth)
        .attr('y1', itemHeight / 2)
        .attr('y2', itemHeight / 2)
        .attr('stroke', d => d.color)
        .attr('stroke-width', 6)
        .attr('stroke-dasharray', d => d.dashArray);

    legendEntries.append('text')
        .attr('x', textOffsetX)
        .attr('y', itemHeight / 2 + 4)
        .text(d => `${getCountryLabel(d.country)}${d.sLabel}`)
        .attr('font-family', 'Arial')
        .style('font-size', `${legendFontSize}px`)
        .attr('alignment-baseline', 'middle');

    const byYear = d3.group(cleanedData, d => d[xVar]);
    const verticalLine = svg.append('line')
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', 'black')
        .attr('stroke-width', 1)
        .attr('opacity', 0);

    const tooltipBox = d3.select('body').append('div')
        .attr('id', `line-tooltip-${containerId}`)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid black')
        .style('border-radius', '5px')
        .style('padding', '10px')
        .style('display', 'none');

    svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
        .on('mousemove', function(event) {
            const mouseX = d3.pointer(event, this)[0];
            const xPoint = Math.round(xScale.invert(mouseX));
            verticalLine.attr('x1', mouseX).attr('x2', mouseX).attr('opacity', 1);

            const valuesAtYear = byYear.get(xPoint) || [];
            let tooltipHtml = `<strong>${xVarTitle}: ${xPoint}</strong><br>`;
            valuesAtYear.forEach(d => {
                const noteText = d.note ? ` <em>(${d.note})</em>` : '';
                const formattedValue = formatTooltipValue(yVar, d.value);
                if (d.sex !== 'both') {
                    tooltipHtml += `${getCountryLabel(d.country)} (${d.sex}): ${formattedValue}${noteText}<br>`;
                } else {
                    tooltipHtml += `${getCountryLabel(d.country)}: ${formattedValue}${noteText}<br>`;
                }
            });

            tooltipBox
                .html(tooltipHtml)
                .style('left', `${event.pageX + 10}px`)
                .style('top', `${event.pageY - 40}px`)
                .style('display', valuesAtYear.length > 0 ? 'block' : 'none');
        })
        .on('mouseleave', function() {
            verticalLine.attr('opacity', 0);
            tooltipBox.style('display', 'none');
        });

    downloadArea.append('button')
        .attr('class', 'figure-download-btn')
        .attr('onclick', `downloadAsPNG('${containerId}')`)
        .text('Download figure');
}


/*************************************************************************************
**************************************************************************************
* Dynamically loop through each outcome and plot
**************************************************************************************
*************************************************************************************/

function drawLineFigures(containerId) {
    const container = document.getElementById(containerId);
    const dataFile = container.getAttribute('data-file');
    const yVar = container.getAttribute('y-var');
    const xVar = container.getAttribute('x-var');
    const yVarTitle = container.getAttribute('y-title');
    const xVarTitle = container.getAttribute('x-title');
    const autoRangeMode = container.getAttribute('data-auto-range');

    let xRange = JSON.parse(container.getAttribute('x-range'));
    const preferredRange = [1970, 2023];

    function render() {
        let xFullRange = calculateMinMax(dataFile, xVar, yVar, selectedCountries, selectedSex);
        if (autoRangeMode === 'selection' && xFullRange.minX !== undefined && xFullRange.maxX !== undefined) {
            xRange = [xFullRange.minX, xFullRange.maxX];
        } else {
            xRange = getDefaultDisplayRange(xFullRange, preferredRange);
        }

        const currentData = getFilteredRows(dataFile, selectedCountries, selectedSex, yVar, xVar, xRange);
        lineFigure(containerId, currentData, xVar, yVar, xVarTitle, yVarTitle);
        initializeSlider(dataFile, currentData, containerId, xRange, xFullRange, yVar, xVar, xVarTitle, yVarTitle);
    }

    (async function () {
        await loadFullData(dataFile);
        render();
    })();

    function countrySelected() {
        render();
    }

    function sexSelected() {
        render();
    }

    document.addEventListener(`countrywasSelected-${containerId}`, countrySelected);
    document.addEventListener(`sexwasSelected-${containerId}`, sexSelected);

    document.addEventListener(`${containerId}-collapsed`, function() {
        document.removeEventListener(`countrywasSelected-${containerId}`, countrySelected);
        document.removeEventListener(`sexwasSelected-${containerId}`, sexSelected);

        if (lineSliders[containerId] && lineSliders[containerId].noUiSlider) {
            lineSliders[containerId].noUiSlider.destroy();
        }
        delete lineSliders[containerId];
        delete lineSliderState[containerId];
        d3.select(`body #line-tooltip-${containerId}`).remove();
    });
}
