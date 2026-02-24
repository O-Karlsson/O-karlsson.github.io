let wimortDataCache = null;

const wimortSegments = [
    { key: 'NMR', label: 'Neonatal deaths', color: '#1f77b4' },
    { key: 'PNM', label: 'Postneonatal deaths', color: '#ff7f0e' },
    { key: 'CH', label: 'Deaths age 1-4 years', color: '#2ca02c' }
];

const wimortWiOrder = ['Poorest', 'Poorer', 'Middle', 'Richer', 'Richest'];
const wimortWiRank = new Map([
    ['1', 1], ['poorest', 1],
    ['2', 2], ['poorer', 2],
    ['3', 3], ['middle', 3],
    ['4', 4], ['richer', 4],
    ['5', 5], ['richest', 5]
]);

function getWIMortLocationLabel(locationId) {
    if (typeof getLocationDisplay === 'function') {
        return getLocationDisplay(locationId);
    }
    return String(locationId);
}

function normalizeWiLabel(value) {
    const raw = String(value ?? '').trim();
    const key = raw.toLowerCase();
    const rank = wimortWiRank.get(key);
    if (rank === 1) { return 'Poorest'; }
    if (rank === 2) { return 'Poorer'; }
    if (rank === 3) { return 'Middle'; }
    if (rank === 4) { return 'Richer'; }
    if (rank === 5) { return 'Richest'; }
    return raw || 'Unknown';
}

function downloadWIMortSVG(svgId, fileName) {
    const svgNode = document.getElementById(svgId);
    if (!svgNode) {
        return;
    }

    const rect = svgNode.getBoundingClientRect();
    const padding = 20;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(rect.width + padding * 2);
    canvas.height = Math.ceil(rect.height + padding * 2);

    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const xml = new XMLSerializer().serializeToString(svgNode);
    const img = new Image();
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    img.onload = function() {
        context.drawImage(img, padding, padding, rect.width, rect.height);
        URL.revokeObjectURL(url);
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = fileName;
        link.click();
    };

    img.src = url;
}

async function loadWIMortData(csvFilePath) {
    if (wimortDataCache) {
        return wimortDataCache;
    }

    const rows = await d3.csv(csvFilePath, (d) => ({
        lid: String(d.lid ?? '').trim(),
        surveyyear: Number(d.surveyyear),
        wi: normalizeWiLabel(d.wi),
        NMR: Number(d.NMR),
        PNM: Number(d.PNM),
        CH: Number(d.CH)
    }));

    wimortDataCache = rows.filter(d =>
        d.lid !== '' &&
        Number.isFinite(d.surveyyear) &&
        Number.isFinite(d.NMR) &&
        Number.isFinite(d.PNM) &&
        Number.isFinite(d.CH)
    );
    return wimortDataCache;
}

function drawWIMortFigures(containerId) {
    const container = document.getElementById(containerId);
    const dataFile = container.getAttribute('data-file') || 'data/wimort.csv';
    container.innerHTML = '';

    const root = d3.select(`#${containerId}`);
    const controlsHost = root.append('div').attr('class', 'multi-outcome-filters');
    controlsHost.append('div')
        .attr('class', 'multi-outcome-filters-title')
        .text('Survey year selection by location:');
    const controlsList = controlsHost.append('div')
        .attr('id', `${containerId}-survey-controls`)
        .attr('class', 'multi-outcome-filters-list');
    const chartHost = root.append('div').attr('id', `${containerId}-charts`);

    const selectionByLocation = new Map();
    let disposed = false;

    function renderMessage(message) {
        chartHost.html('');
        chartHost.append('div')
            .attr('class', 'no-data-message-box')
            .append('p')
            .attr('class', 'no-data-message-text')
            .text(message);
    }

    function buildStackedData(rowsForYear) {
        const grouped = new Map();
        rowsForYear.forEach(row => {
            if (!grouped.has(row.wi)) {
                grouped.set(row.wi, { NMR: 0, PNM: 0, CH: 0 });
            }
            grouped.get(row.wi).NMR += row.NMR;
            grouped.get(row.wi).PNM += row.PNM;
            grouped.get(row.wi).CH += row.CH;
        });

        return wimortWiOrder.map(wi => {
            const values = grouped.get(wi) || { NMR: 0, PNM: 0, CH: 0 };
            return {
                wi,
                NMR: values.NMR,
                PNM: values.PNM,
                CH: values.CH,
                total: values.NMR + values.PNM + values.CH
            };
        });
    }

    function renderLegend(wrapper) {
        const legend = wrapper.append('div').attr('class', 'wimort-legend');
        const rows = legend.selectAll('div.wimort-legend-item')
            .data(wimortSegments)
            .enter()
            .append('div')
            .attr('class', 'wimort-legend-item');

        rows.append('span')
            .attr('class', 'wimort-legend-swatch')
            .style('background-color', d => d.color);
        rows.append('span').text(d => d.label);
    }

    function renderLocationYearChart(wrapper, locationId, year, yearRows) {
        const data = buildStackedData(yearRows);
        const validRows = data.filter(d => d.total > 0);
        if (validRows.length === 0) {
            wrapper.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('No data for this survey year');
            return;
        }

        const margin = { top: 20, right: 36, bottom: 70, left: 130 };
        const width = Math.min(window.innerWidth - 130, 560);
        const height = Math.max(280, validRows.length * 52);
        const chartSvgId = `wimort-chart-${containerId}-${locationId}-${year}`.replace(/[^a-zA-Z0-9_-]/g, '');

        const svg = wrapper.append('svg')
            .attr('id', chartSvgId)
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

        const xMax = d3.max(validRows, d => d.total) || 0;
        const xScale = d3.scaleLinear()
            .domain([0, xMax * 1.1])
            .nice()
            .range([0, width]);
        const yScale = d3.scaleBand()
            .domain(validRows.map(d => d.wi))
            .range([0, height])
            .padding(0.2);

        svg.append('g')
            .call(d3.axisLeft(yScale))
            .style('font-size', `${Math.max(12, width * 0.025)}px`);

        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(xScale))
            .style('font-size', `${Math.max(12, width * 0.025)}px`);

        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height + 45)
            .attr('text-anchor', 'middle')
            .text('Under-5 mortality rate per 1000 births')
            .style('font-size', `${Math.max(12, width * 0.025)}px`);

        const tooltip = d3.select('body').append('div')
            .attr('class', 'wimort-tooltip')
            .style('position', 'absolute')
            .style('display', 'none')
            .style('background', 'white')
            .style('border', '1px solid #444')
            .style('border-radius', '4px')
            .style('padding', '8px');

        validRows.forEach(row => {
            let xStart = 0;
            wimortSegments.forEach(segment => {
                const value = row[segment.key];
                const xEnd = xStart + value;

                svg.append('rect')
                    .attr('x', xScale(xStart))
                    .attr('y', yScale(row.wi))
                    .attr('width', Math.max(0, xScale(xEnd) - xScale(xStart)))
                    .attr('height', yScale.bandwidth())
                    .attr('fill', segment.color)
                    .on('mousemove', function(event) {
                        tooltip
                            .html(
                                `<strong>${segment.label}</strong><br>` +
                                `Value: ${d3.format('.2f')(value)}<br>` +
                                `Wealth quintile: ${row.wi}<br>` +
                                `Survey year: ${year}`
                            )
                            .style('left', `${event.pageX + 12}px`)
                            .style('top', `${event.pageY - 36}px`)
                            .style('display', 'block');
                    })
                    .on('mouseleave', function() {
                        tooltip.style('display', 'none');
                    });

                xStart = xEnd;
            });
        });

        wrapper.append('button')
            .attr('class', 'figure-download-btn')
            .text('Download figure')
            .on('click', function() {
                downloadWIMortSVG(chartSvgId, `${locationId}_wimort_${year}.png`);
            });
    }

    function renderLocationBlock(locationId, rowsForLocation) {
        const locationName = getWIMortLocationLabel(locationId);
        const years = Array.from(new Set(rowsForLocation.map(d => d.surveyyear))).sort((a, b) => a - b);
        if (years.length === 0) {
            return;
        }

        if (!selectionByLocation.has(locationId)) {
            selectionByLocation.set(locationId, new Set([years[years.length - 1]]));
        } else {
            const existing = selectionByLocation.get(locationId);
            const intersection = new Set(Array.from(existing).filter(year => years.includes(year)));
            if (intersection.size === 0) {
                intersection.add(years[years.length - 1]);
            }
            selectionByLocation.set(locationId, intersection);
        }

        const controlCard = controlsList.append('div').attr('class', 'wimort-location-control');
        controlCard.append('div')
            .attr('class', 'wimort-location-title')
            .text(locationName);

        const controlRows = controlCard.append('div').attr('class', 'wimort-years-list');
        years.forEach(year => {
            const label = controlRows.append('label').attr('class', 'wimort-year-item');
            label.append('input')
                .attr('type', 'checkbox')
                .property('checked', selectionByLocation.get(locationId).has(year))
                .on('change', function(event) {
                    const selectedYears = selectionByLocation.get(locationId);
                    if (event.target.checked) {
                        selectedYears.add(year);
                    } else {
                        selectedYears.delete(year);
                    }
                    renderAllCharts();
                });
            label.append('span').text(String(year));
        });
    }

    function renderAllCharts() {
        d3.selectAll('div.wimort-tooltip').remove();
        chartHost.html('');

        const availableLocations = selectedCountries;
        if (availableLocations.length === 0) {
            renderMessage('Select location');
            return;
        }

        let renderedCharts = 0;
        availableLocations.forEach(locationId => {
            const selectedYears = selectionByLocation.get(locationId);
            if (!selectedYears || selectedYears.size === 0) {
                return;
            }

            const rowsForLocation = wimortDataCache.filter(d => d.lid === String(locationId));
            const locationName = getWIMortLocationLabel(locationId);
            const locationWrapper = chartHost.append('div').attr('class', 'multi-outcome-chart');
            locationWrapper.append('h3').attr('class', 'multi-outcome-title').text(locationName);

            const yearsSorted = Array.from(selectedYears).sort((a, b) => b - a);
            let hasYearChart = false;
            yearsSorted.forEach(year => {
                const rowsForYear = rowsForLocation.filter(d => d.surveyyear === year);
                if (rowsForYear.length === 0) {
                    return;
                }
                hasYearChart = true;
                renderedCharts += 1;

                const yearWrapper = locationWrapper.append('div').attr('class', 'wimort-year-chart');
                yearWrapper.append('h4').attr('class', 'wimort-year-title').text(`Survey year: ${year}`);
                renderLegend(yearWrapper);
                renderLocationYearChart(yearWrapper, locationId, year, rowsForYear);
            });

            if (!hasYearChart) {
                locationWrapper.append('div').attr('class', 'no-data-message-box').append('p').attr('class', 'no-data-message-text').text('Select at least one available survey year');
            }
        });

        if (renderedCharts === 0) {
            renderMessage('No under-5 mortality by wealth data for current selection');
        }
    }

    async function rebuild() {
        controlsList.html('');
        chartHost.html('');

        await loadWIMortData(dataFile);
        if (disposed) {
            return;
        }

        const selectedLocationIds = selectedCountries.map(String);
        const locationsWithData = selectedLocationIds.filter(locationId =>
            wimortDataCache.some(d => d.lid === locationId)
        );
        const locationsWithoutData = selectedLocationIds.filter(locationId =>
            !wimortDataCache.some(d => d.lid === locationId)
        );

        if (locationsWithData.length === 0 && locationsWithoutData.length > 0) {
            const names = locationsWithoutData.map(id => getWIMortLocationLabel(id));
            const message = names.length === 1
                ? `No mortality by wealth data available for ${names[0]}`
                : `No mortality by wealth data available for selected locations: ${names.join(', ')}`;
            renderMessage(message);
            return;
        }

        if (!selectedSex.includes('both')) {
            renderMessage('Select Both under Sex to view this figure');
            return;
        }

        const locationRows = selectedCountries
            .map(locationId => ({
                locationId,
                rows: wimortDataCache.filter(d => d.lid === String(locationId))
            }))
            .filter(d => d.rows.length > 0);

        if (locationRows.length === 0) {
            renderMessage('No under-5 mortality by wealth data for selected location(s)');
            return;
        }

        locationRows.forEach(item => renderLocationBlock(item.locationId, item.rows));
        renderAllCharts();
    }

    function selectionChanged() {
        rebuild();
    }

    document.addEventListener(`countrywasSelected-${containerId}`, selectionChanged);
    document.addEventListener(`sexwasSelected-${containerId}`, selectionChanged);
    document.addEventListener(`${containerId}-collapsed`, function() {
        disposed = true;
        document.removeEventListener(`countrywasSelected-${containerId}`, selectionChanged);
        document.removeEventListener(`sexwasSelected-${containerId}`, selectionChanged);
        d3.selectAll('div.wimort-tooltip').remove();
    });

    rebuild();
}
