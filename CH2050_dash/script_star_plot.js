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

const starDataCache = new Map();
const traditionalStarScaleState = {};
const frontierAxisScaleState = {};
const frontierTrimScaleState = {};
const frontierSelectionScaleState = {};
let traditionalStarDerivedCache = null;
const FRONTIER_LOG_SCALE_MIN_VALUE = 0.00000000001;

function frontierLogScaleValue(value) {
    return Math.log2(value);
}

function parseStarSex(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === '1') { return 'male'; }
    if (normalized === '2') { return 'female'; }
    if (normalized === '3') { return 'both'; }
    return normalized;
}

function parseOptionalNumber(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') {
        return null;
    }
    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function roundStarValue(value) {
    if (!Number.isFinite(value)) {
        return '';
    }
    return value < 10 ? (Math.round(value * 10) / 10).toFixed(1) : String(Math.round(value));
}

const frontierScaleLevels = [
    { key: 'low', label: 'Low scale' },
    { key: 'medium', label: 'Medium scale' },
    { key: 'high', label: 'High scale' }
];

const ppdFrontierScaleLevels = [
    { key: 'low', label: 'Low mortality setting' },
    { key: 'medium', label: 'Medium mortality setting' },
    { key: 'high', label: 'High mortality setting' }
];

const main5FrontierScaleLevels = [
    { key: 'low', label: 'Low mortality context' },
    { key: 'medium', label: 'Medium mortality context' },
    { key: 'high', label: 'High mortality context' }
];

const main5ProspectColors = {
    0: '#d62728',
    1: '#f2c94c',
    2: '#2ca25f'
};

function getMain5ScaleAssignment(row) {
    const tercile = Number(row?.tercile);
    if (tercile === 1) { return main5FrontierScaleLevels[0]; }
    if (tercile === 2) { return main5FrontierScaleLevels[1]; }
    if (tercile === 3) { return main5FrontierScaleLevels[2]; }
    return null;
}

function getMain5ProspectColor(prospect) {
    if (prospect === null || prospect === undefined || String(prospect).trim() === '') {
        return '#777777';
    }
    const key = Number(prospect);
    return main5ProspectColors[key] || '#777777';
}

let ppdFrontierScaleAssignmentCache = null;
let countryTerritoryLocationIdsCache = null;
const POP2023_MIN_FOR_MORTALITY_TERCILES = 5000; // pop23 is stored in 1,000s, so 5000 = 5 million.

function ensureFrontierExtent(extents, key, value) {
    const current = extents.get(key);
    if (!current) {
        extents.set(key, {
            min: value,
            max: value,
            values: [value]
        });
    } else {
        current.min = Math.min(current.min, value);
        current.max = Math.max(current.max, value);
        if (!Array.isArray(current.values)) {
            current.values = [];
        }
        current.values.push(value);
    }
}

function assignFrontierScaleGroups(countryEntries) {
    const orderedEntries = countryEntries
        .filter(entry => entry.latest && Number.isFinite(entry.latest.plotValue))
        .sort((a, b) => {
            if (a.latest.plotValue !== b.latest.plotValue) {
                return a.latest.plotValue - b.latest.plotValue;
            }
            return String(a.country).localeCompare(String(b.country));
        });

    const total = orderedEntries.length;
    orderedEntries.forEach((entry, index) => {
        const scaleIndex = Math.min(2, Math.floor((index * 3) / total));
        entry.scaleKey = frontierScaleLevels[scaleIndex].key;
        entry.scaleLabel = frontierScaleLevels[scaleIndex].label;
    });
}

function normalizeFrontierExtent(extent, fallbackMin, fallbackMax, options = {}) {
    let scaleMinValue = extent ? extent.min : fallbackMin;
    let scaleMaxValue = extent ? extent.max : fallbackMax;
    if (options.trimHighest20 && extent && Array.isArray(extent.values)) {
        const sortedValues = extent.values
            .filter(Number.isFinite)
            .sort((a, b) => a - b);
        if (sortedValues.length > 0) {
            const retainedCount = Math.max(1, Math.ceil(sortedValues.length * 0.8));
            scaleMaxValue = sortedValues[retainedCount - 1];
        }
    }
    if (options.logMinFromData && extent && Array.isArray(extent.values)) {
        const positiveValues = extent.values
            .filter(value => Number.isFinite(value) && value > 0)
            .sort((a, b) => a - b);
        if (positiveValues.length > 0) {
            scaleMinValue = positiveValues[0];
        }
    }
    if (!Number.isFinite(scaleMinValue) || !Number.isFinite(scaleMaxValue)) {
        scaleMinValue = fallbackMin;
        scaleMaxValue = fallbackMax;
    }
    if (options.zeroMin && !options.logMinFromData) {
        scaleMinValue = 0;
    } else if (scaleMinValue > 0) {
        scaleMinValue = scaleMinValue / 2;
    }
    if (scaleMinValue === scaleMaxValue) {
        if (options.zeroMin) {
            scaleMaxValue = scaleMaxValue > 0 ? scaleMaxValue : 1;
        } else {
            scaleMinValue = Math.max(0, scaleMinValue - 1);
            scaleMaxValue += 1;
        }
    }

    return { scaleMinValue, scaleMaxValue };
}

async function loadPpdFrontierScaleAssignments() {
    if (ppdFrontierScaleAssignmentCache) {
        return ppdFrontierScaleAssignmentCache;
    }

    const [u20mRows, locationRows, popRows] = await Promise.all([
        d3.csv('data/u20m.csv', (d) => ({
            lid: String(d.lid ?? '').trim(),
            sex: parseStarSex(d.sex),
            year: Number(d.year),
            value: Number(d.value)
        })),
        d3.csv('data/location_selection.csv').catch(() => d3.csv('data/location_select.csv')),
        d3.csv('data/pop2023.csv', (d) => ({
            lid: String(d.lid ?? '').trim(),
            pop23: Number(d.pop23)
        }))
    ]);

    const headingByLid = new Map(locationRows.map(row => [String(row.lid ?? '').trim(), String(row.heading1 ?? '').trim()]));
    const populationByLid = new Map(popRows.map(row => [row.lid, row.pop23]));
    const latestBySexLid = new Map();

    u20mRows
        .filter(row => row.lid !== '' && row.sex !== '' && Number.isFinite(row.year) && Number.isFinite(row.value))
        .forEach((row) => {
            const key = `${row.sex}||${row.lid}`;
            const current = latestBySexLid.get(key);
            if (!current || row.year > current.year) {
                latestBySexLid.set(key, row);
            }
        });

    const latestBySex = d3.group(Array.from(latestBySexLid.values()), row => row.sex);
    const assignments = new Map();

    latestBySex.forEach((sexRows, sex) => {
        const countryValues = sexRows
            .filter(row =>
                headingByLid.get(row.lid) === 'Countries and territories' &&
                (populationByLid.get(row.lid) || 0) > POP2023_MIN_FOR_MORTALITY_TERCILES
            )
            .map(row => row.value)
            .filter(Number.isFinite)
            .sort((a, b) => a - b);

        if (countryValues.length === 0) {
            return;
        }

        const firstTercile = d3.quantileSorted(countryValues, 1 / 3);
        const secondTercile = d3.quantileSorted(countryValues, 2 / 3);

        sexRows.forEach((row) => {
            let scaleLevel = ppdFrontierScaleLevels[2];
            if (row.value <= firstTercile) {
                scaleLevel = ppdFrontierScaleLevels[0];
            } else if (row.value <= secondTercile) {
                scaleLevel = ppdFrontierScaleLevels[1];
            }

            assignments.set(`${sex}||${row.lid}`, {
                scaleKey: scaleLevel.key,
                scaleLabel: scaleLevel.label,
                ppdValue: row.value
            });
        });
    });

    ppdFrontierScaleAssignmentCache = assignments;
    return ppdFrontierScaleAssignmentCache;
}

async function loadCountryTerritoryLocationIds() {
    if (countryTerritoryLocationIdsCache) {
        return countryTerritoryLocationIdsCache;
    }

    const locationRows = await d3.csv('data/location_selection.csv').catch(() => d3.csv('data/location_select.csv'));
    countryTerritoryLocationIdsCache = new Set(
        locationRows
            .filter(row => String(row.heading1 ?? '').trim() === 'Countries and territories')
            .map(row => String(row.lid ?? '').trim())
            .filter(Boolean)
    );
    return countryTerritoryLocationIdsCache;
}

async function loadStarData(csvFilePath) {
    if (starDataCache.has(csvFilePath)) {
        return starDataCache.get(csvFilePath);
    }

    const rows = await d3.csv(csvFilePath, (d) => {
        const rawValue = Number(d.value);
        const outcomeKey = String(d.ageg ?? '').trim();
        const plotValue = Number.isFinite(rawValue) ? rawValue : null;
        const tercile = parseOptionalNumber(d.tercile);
        const prospect = parseOptionalNumber(d.prospect);

        return {
            lid: String(d.lid ?? '').trim(),
            sex: parseStarSex(d.sex),
            year: Number(d.year),
            outcomeKey,
            rawValue,
            plotValue,
            tercile,
            prospect
        };
    });

    const filteredRows = rows.filter(d =>
        d.lid !== '' &&
        d.outcomeKey !== '' &&
        Number.isFinite(d.year) &&
        Number.isFinite(d.plotValue)
    );

    starDataCache.set(csvFilePath, filteredRows);
    return filteredRows;
}

async function drawPpdCountryRankTable(containerId) {
    const container = d3.select(`#${containerId}`);
    const containerNode = container.node();
    if (!containerNode) {
        return;
    }

    const dataFile = containerNode.getAttribute('data-file') || 'data/stardata.csv';
    container.html('');

    function renderMessage(message) {
        container.html(`<div class="ppd-rank-table-empty">${message}</div>`);
    }

    function formatTableValue(entry) {
        const value = entry ? (Number.isFinite(entry.value) ? entry.value : entry.plotValue) : null;
        if (!entry || !Number.isFinite(value)) {
            return '';
        }
        return `${roundStarValue(value)} (${entry.year})`;
    }

    function csvEscape(value) {
        const text = String(value ?? '');
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function downloadTableCsv(rows, tableOutcomes) {
        const headers = ['rank', 'country_territory', 'mortality_setting', 'u20m_2023'];
        tableOutcomes.forEach((outcome) => {
            headers.push(`${outcome.key}_value`, `${outcome.key}_year`);
        });

        const lines = [headers.map(csvEscape).join(',')];
        rows.forEach((row) => {
            const values = [row.rank, row.country, row.mortalitySetting, row.ppd.value];
            tableOutcomes.forEach((outcome) => {
                const entry = row.outcomes[outcome.key];
                const value = entry ? (Number.isFinite(entry.value) ? entry.value : entry.plotValue) : '';
                values.push(Number.isFinite(value) ? value : '', entry && Number.isFinite(entry.year) ? entry.year : '');
            });
            lines.push(values.map(csvEscape).join(','));
        });

        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'u20m_ranked_country_table.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function getLatestByKey(rows, keyFn) {
        const latest = new Map();
        rows.forEach((row) => {
            const key = keyFn(row);
            const current = latest.get(key);
            if (!current || row.year > current.year) {
                latest.set(key, row);
            }
        });
        return latest;
    }

    try {
        const [starRows, u20mRows, locationRows, popRows] = await Promise.all([
            loadStarData(dataFile),
            d3.csv('data/u20m.csv', (d) => ({
                lid: String(d.lid ?? '').trim(),
                sex: parseStarSex(d.sex),
                year: Number(d.year),
                value: Number(d.value)
            })),
            d3.csv('data/location_selection.csv').catch(() => d3.csv('data/location_select.csv')),
            d3.csv('data/pop2023.csv', (d) => ({
                lid: String(d.lid ?? '').trim(),
                pop23: Number(d.pop23)
            }))
        ]);
        const populationByLid = new Map(popRows.map(row => [row.lid, row.pop23]));

        const countryLocations = locationRows
            .map(row => ({
                lid: String(row.lid ?? '').trim(),
                loc: String(row.loc ?? '').trim(),
                heading1: String(row.heading1 ?? '').trim()
            }))
            .filter(row =>
                row.lid !== '' &&
                row.heading1 === 'Countries and territories' &&
                (populationByLid.get(row.lid) || 0) > POP2023_MIN_FOR_MORTALITY_TERCILES
            );
        const countryByLid = new Map(countryLocations.map(row => [row.lid, row.loc]));
        const countryLids = new Set(countryLocations.map(row => row.lid));
        const sexKey = 'both';
        const latestOutcomeByKey = getLatestByKey(
            starRows.filter(row => countryLids.has(row.lid) && row.sex === sexKey),
            row => `${row.lid}||${row.sex}||${row.outcomeKey}`
        );
        const u20m2023ByLid = new Map();

        u20mRows
            .filter(row =>
                countryLids.has(row.lid) &&
                row.sex === sexKey &&
                row.year === 2023 &&
                Number.isFinite(row.value)
            )
            .forEach((row) => {
                u20m2023ByLid.set(row.lid, row);
            });

        const tableOutcomes = ['nnm', 'pnm', 'q5_19', 'hgap', 'math']
            .map(key => starOutcomeConfig.find(outcome => outcome.key === key))
            .filter(Boolean);
        const rows = countryLocations
            .map((location) => {
                const ppd = u20m2023ByLid.get(location.lid);
                if (!ppd) {
                    return null;
                }
                const row = {
                    lid: location.lid,
                    country: countryByLid.get(location.lid) || location.lid,
                    ppd,
                    outcomes: {}
                };
                tableOutcomes.forEach((outcome) => {
                    row.outcomes[outcome.key] = latestOutcomeByKey.get(`${location.lid}||${sexKey}||${outcome.key}`) || null;
                });
                return row;
            })
            .filter(Boolean)
            .sort((a, b) => {
                if (a.ppd.value !== b.ppd.value) {
                    return a.ppd.value - b.ppd.value;
                }
                return a.country.localeCompare(b.country);
            });

        if (rows.length === 0) {
            renderMessage('No 2023 under-20 mortality rows found for countries and territories above 5 million population.');
            return;
        }

        const ppdValues = rows.map(row => row.ppd.value).filter(Number.isFinite).sort((a, b) => a - b);
        const firstTercile = d3.quantileSorted(ppdValues, 1 / 3);
        const secondTercile = d3.quantileSorted(ppdValues, 2 / 3);
        rows.forEach((row, index) => {
            row.rank = index + 1;
            row.mortalitySetting = row.ppd.value <= firstTercile ? 'Low' : row.ppd.value <= secondTercile ? 'Medium' : 'High';
        });
        const mortalitySettingOrder = { Low: 1, Medium: 2, High: 3 };
        let currentSort = { key: 'rank', direction: 'asc' };

        function getOutcomeValue(row, outcomeKey) {
            const entry = row.outcomes[outcomeKey];
            if (!entry) {
                return null;
            }
            if (Number.isFinite(entry.value)) {
                return entry.value;
            }
            return Number.isFinite(entry.plotValue) ? entry.plotValue : null;
        }

        function getSortValue(row, sortKey) {
            if (sortKey === 'rank') {
                return row.rank;
            }
            if (sortKey === 'country') {
                return row.country;
            }
            if (sortKey === 'mortalitySetting') {
                return mortalitySettingOrder[row.mortalitySetting] || 99;
            }
            if (sortKey === 'u20m') {
                return row.ppd.value;
            }
            if (sortKey.startsWith('outcome:')) {
                return getOutcomeValue(row, sortKey.slice('outcome:'.length));
            }
            return null;
        }

        function getSortedRows() {
            const directionFactor = currentSort.direction === 'asc' ? 1 : -1;
            return [...rows].sort((a, b) => {
                const aValue = getSortValue(a, currentSort.key);
                const bValue = getSortValue(b, currentSort.key);
                const aMissing = aValue === null || aValue === undefined || aValue === '';
                const bMissing = bValue === null || bValue === undefined || bValue === '';
                if (aMissing && bMissing) {
                    return a.rank - b.rank;
                }
                if (aMissing) {
                    return 1;
                }
                if (bMissing) {
                    return -1;
                }
                if (typeof aValue === 'string' || typeof bValue === 'string') {
                    const comparison = String(aValue).localeCompare(String(bValue));
                    return comparison === 0 ? a.rank - b.rank : comparison * directionFactor;
                }
                if (aValue !== bValue) {
                    return (aValue - bValue) * directionFactor;
                }
                return a.rank - b.rank;
            });
        }

        function renderSortIndicators(headerButtons) {
            headerButtons.each(function(column) {
                const suffix = column.key === currentSort.key ? (currentSort.direction === 'asc' ? ' ↑' : ' ↓') : '';
                d3.select(this).text(`${column.label}${suffix}`);
            });
        }

        function renderTableBody(tbody, sortedRows, showTercileDividers) {
            tbody.html('');
            let mediumDividerRendered = false;
            let highDividerRendered = false;
            sortedRows.forEach((row) => {
                if (showTercileDividers && !mediumDividerRendered && row.ppd.value > firstTercile) {
                    tbody.append('tr')
                        .attr('class', 'ppd-rank-table-tercile-row')
                        .append('td')
                        .attr('colspan', 4 + tableOutcomes.length)
                        .text('Medium mortality setting begins');
                    mediumDividerRendered = true;
                }
                if (showTercileDividers && !highDividerRendered && row.ppd.value > secondTercile) {
                    tbody.append('tr')
                        .attr('class', 'ppd-rank-table-tercile-row')
                        .append('td')
                        .attr('colspan', 4 + tableOutcomes.length)
                        .text('High mortality setting begins');
                    highDividerRendered = true;
                }

                const bodyRow = tbody.append('tr');
                bodyRow.append('td').text(row.rank);
                bodyRow.append('td').text(row.country);
                bodyRow.append('td').text(row.mortalitySetting);
                bodyRow.append('td').text(roundStarValue(row.ppd.value));
                tableOutcomes.forEach((outcome) => {
                    bodyRow.append('td').text(formatTableValue(row.outcomes[outcome.key]));
                });
            });
        }

        const panel = container.append('div').attr('class', 'ppd-rank-table-panel');
        panel.append('h3')
            .attr('class', 'ppd-rank-table-title')
            .text('Countries and territories above 5 million population ranked by 2023 mortality before age 20, both sexes combined');
        panel.append('button')
            .attr('type', 'button')
            .attr('class', 'figure-download-btn')
            .text('Download table')
            .on('click', () => downloadTableCsv(getSortedRows(), tableOutcomes));
        const scroll = panel.append('div').attr('class', 'ppd-rank-table-scroll');
        const table = scroll.append('table').attr('class', 'ppd-rank-table');
        const headerRow = table.append('thead').append('tr');
        const columns = [
            { key: 'rank', label: 'Rank' },
            { key: 'country', label: 'Country/territory' },
            { key: 'mortalitySetting', label: 'Mortality setting' },
            { key: 'u20m', label: 'Under-20 mortality 2023' }
        ].concat(tableOutcomes.map(outcome => ({ key: `outcome:${outcome.key}`, label: outcome.shortLabel })));
        const headerButtons = headerRow.selectAll('th')
            .data(columns)
            .enter()
            .append('th')
            .append('button')
            .attr('type', 'button')
            .attr('class', 'ppd-rank-sort-button')
            .on('click', function(event, column) {
                if (currentSort.key === column.key) {
                    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort = { key: column.key, direction: column.key === 'country' ? 'asc' : 'desc' };
                }
                renderSortIndicators(headerButtons);
                const showTercileDividers = currentSort.key === 'rank' && currentSort.direction === 'asc';
                renderTableBody(tbody, getSortedRows(), showTercileDividers);
            });
        renderSortIndicators(headerButtons);
        const tbody = table.append('tbody');
        renderTableBody(tbody, getSortedRows(), true);
    } catch (error) {
        console.error(error);
        renderMessage('Unable to load the under-20 mortality-ranked country table.');
    }
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
            { label: 'Baseline year value', shape: 'dot', color: '#d62728' },
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
            if (d.shape === 'dot') {
                g.append('circle')
                    .attr('cx', 7)
                    .attr('cy', 0)
                    .attr('r', 4)
                    .attr('fill', d.color)
                    .attr('stroke', '#ffffff')
                    .attr('stroke-width', 1);
            } else if (d.shape === 'triangle') {
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
            const markerBaseY = y;
            const markerLatestY = y;
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

            if (summary.earliestVisible && summary.latestVisible) {
                markerGroup.append('line')
                    .attr('x1', baseX)
                    .attr('y1', markerBaseY)
                    .attr('x2', latestX)
                    .attr('y2', markerLatestY)
                    .attr('stroke', '#000000')
                    .attr('stroke-width', 1.5);
            }

            if (summary.earliestVisible) {
                markerGroup.append('circle')
                    .attr('cx', baseX)
                    .attr('cy', markerBaseY)
                    .attr('r', isMobile ? 4 : 4.5)
                    .attr('fill', '#d62728')
                    .attr('stroke', '#ffffff')
                    .attr('stroke-width', 1);
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

function drawFrontierLineFigures(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const dataFile = container.getAttribute('data-file') || 'data/stardata.csv';
    const requestedScaleMode = container.getAttribute('data-scale-mode');
    const scaleMode = requestedScaleMode === 'global'
        ? 'global'
        : requestedScaleMode === 'ppd'
            ? 'ppd'
            : requestedScaleMode === 'main5' || requestedScaleMode === 'main5-global'
                ? requestedScaleMode
                : 'tercile';
    const linePlotOutcomeOrder = ['nnm', 'pnm', 'q5_19', 'hgap', 'math'];
    const linePlotOutcomeConfig = linePlotOutcomeOrder
        .map((key) => starOutcomeConfig.find((outcome) => outcome.key === key))
        .filter(Boolean);
    container.innerHTML = '';
    const root = d3.select(`#${containerId}`);
    if (!frontierAxisScaleState[containerId]) {
        frontierAxisScaleState[containerId] = scaleMode === 'global' ? 'log' : 'linear';
    }
    let axisToggle = null;
    let trimToggle = null;
    let selectionScaleToggle = null;
    if (scaleMode === 'global' || scaleMode === 'main5-global') {
        const controls = root.append('div').attr('class', 'traditional-star-controls frontier-axis-controls');
        const toggleLabel = controls.append('label').attr('class', 'traditional-star-toggle');
        axisToggle = toggleLabel.append('input')
            .attr('type', 'checkbox')
            .property('checked', frontierAxisScaleState[containerId] === 'log');
        toggleLabel.append('span').text(scaleMode === 'main5-global' ? 'Use log base 2 scale' : 'Use ln scale');
        if (scaleMode === 'main5-global') {
            const trimLabel = controls.append('label')
                .attr('class', 'traditional-star-toggle')
                .style('margin-left', '18px');
            trimToggle = trimLabel.append('input')
                .attr('type', 'checkbox')
                .property('checked', frontierTrimScaleState[containerId] === true);
            trimLabel.append('span').text('Trim highest 20% from scale');
            const selectionScaleLabel = controls.append('label')
                .attr('class', 'traditional-star-toggle')
                .style('margin-left', '18px');
            selectionScaleToggle = selectionScaleLabel.append('input')
                .attr('type', 'checkbox')
                .property('checked', frontierSelectionScaleState[containerId] === true);
            selectionScaleLabel.append('span').text('Scale to selected countries and sexes');
        }
    }
    const chartHost = root.append('div').attr('id', `${containerId}-charts`);

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

    function buildFrontierExtents(rows, ppdAssignments, scaleLocationIds, scaleSexSet) {
        const extents = new Map();
        const grouped = d3.group(rows, d => d.outcomeKey, d => d.sex, d => d.lid);

        grouped.forEach((sexMap, outcomeKey) => {
            sexMap.forEach((countryMap, sex) => {
                if (scaleSexSet && !scaleSexSet.has(String(sex))) {
                    return;
                }
                const countryEntries = [];
                countryMap.forEach((countryRows) => {
                    const sorted = countryRows
                        .filter(row => Number.isFinite(row.plotValue))
                        .sort((a, b) => a.year - b.year);
                    if (sorted.length === 0) {
                        return;
                    }
                    countryEntries.push({
                        country: sorted[0].lid,
                        pairedRows: sorted.length > 1 ? [sorted[0], sorted[sorted.length - 1]] : [sorted[0]],
                        latest: sorted[sorted.length - 1]
                    });
                });

                countryEntries.forEach((entry) => {
                    const globalExtentKey = `global||${outcomeKey}||${sex}`;
                    entry.pairedRows.forEach((row) => {
                        ensureFrontierExtent(extents, globalExtentKey, row.plotValue);
                    });
                });

                if (scaleMode === 'main5-global') {
                    countryEntries.forEach((entry) => {
                        if (!scaleLocationIds || scaleLocationIds.has(String(entry.country))) {
                            const extentKey = `extent||${outcomeKey}||${sex}`;
                            entry.pairedRows.forEach((row) => {
                                ensureFrontierExtent(extents, extentKey, row.plotValue);
                            });
                        }
                    });
                    return;
                }

                if (scaleMode === 'main5') {
                    countryEntries.forEach((entry) => {
                        const assignment = getMain5ScaleAssignment(entry.latest);
                        if (assignment) {
                            entry.scaleKey = assignment.key;
                            entry.scaleLabel = assignment.label;
                        }
                    });
                } else if (scaleMode === 'ppd') {
                    countryEntries.forEach((entry) => {
                        const assignment = ppdAssignments ? ppdAssignments.get(`${sex}||${entry.country}`) : null;
                        if (assignment) {
                            entry.scaleKey = assignment.scaleKey;
                            entry.scaleLabel = assignment.scaleLabel;
                        }
                    });
                } else {
                    assignFrontierScaleGroups(countryEntries);
                }
                countryEntries.forEach((entry) => {
                    if (!entry.scaleKey) {
                        return;
                    }
                    const extentKey = `extent||${outcomeKey}||${sex}||${entry.scaleKey}`;
                    const assignmentKey = `assignment||${outcomeKey}||${sex}||${entry.country}`;
                    extents.set(assignmentKey, {
                        scaleKey: entry.scaleKey,
                        scaleLabel: entry.scaleLabel
                    });
                    if (!scaleLocationIds || scaleLocationIds.has(String(entry.country))) {
                        entry.pairedRows.forEach((row) => {
                            ensureFrontierExtent(extents, extentKey, row.plotValue);
                        });
                    }
                });
            });
        });

        return extents;
    }

    function buildOutcomeSummary(rows, outcome, frontierExtents, sex) {
        function describeYear(row, label) {
            return row ? `${row.year} ${label}` : '';
        }

        const matching = rows
            .filter(row => row.outcomeKey === outcome.key && Number.isFinite(row.plotValue))
            .sort((a, b) => a.year - b.year);

        if (matching.length === 0) {
            return {
                ...outcome,
                status: 'missing'
            };
        }

        const earliest = matching[0];
        const latest = matching[matching.length - 1];
        const comparison = matching.length > 1 ? earliest : null;
        const scaleAssignment = scaleMode !== 'global' && scaleMode !== 'main5-global'
            ? (frontierExtents.get(`assignment||${outcome.key}||${sex}||${latest.lid}`) || {})
            : {};
        const extent = scaleMode === 'main5-global'
            ? frontierExtents.get(`extent||${outcome.key}||${sex}`)
            : scaleMode !== 'global'
                ? frontierExtents.get(`extent||${outcome.key}||${sex}||${scaleAssignment.scaleKey}`)
                : frontierExtents.get(`global||${outcome.key}||${sex}`);
        const fallbackMin = Math.min(earliest.plotValue, latest.plotValue);
        const fallbackMax = Math.max(earliest.plotValue, latest.plotValue);
        const { scaleMinValue, scaleMaxValue } = normalizeFrontierExtent(extent, fallbackMin, fallbackMax, {
            zeroMin: scaleMode === 'main5' || scaleMode === 'main5-global',
            trimHighest20: scaleMode === 'main5-global' && frontierTrimScaleState[containerId] === true,
            logMinFromData: scaleMode === 'main5-global' && frontierAxisScaleState[containerId] === 'log'
        });

        const goalValue = latest.plotValue / 2;
        const canShowGoalAndProjection = scaleMode !== 'main5' && scaleMode !== 'main5-global';
        const canShowProjected2050 = Boolean(
            canShowGoalAndProjection &&
            comparison &&
            earliest.year < latest.year &&
            latest.year < 2050 &&
            earliest.plotValue > 0 &&
            latest.plotValue > 0
        );

        let projected2050Value = null;
        if (canShowProjected2050) {
            const elapsedYears = latest.year - earliest.year;
            const remainingYears = 2050 - latest.year;
            const annualChangeFactor = latest.plotValue / earliest.plotValue;
            projected2050Value = latest.plotValue * (annualChangeFactor ** (remainingYears / elapsedYears));
        }

        let yearCaption = `${describeYear(earliest, 'baseline')} | ${describeYear(latest, 'most recent')}`;
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
            projected2050Value,
            yearCaption,
            scaleKey: scaleMode !== 'global' && scaleMode !== 'main5-global' ? scaleAssignment.scaleKey : null,
            scaleLabel: scaleMode !== 'global' && scaleMode !== 'main5-global' ? scaleAssignment.scaleLabel : null,
            scaleMinValue,
            scaleMaxValue,
            earliestBeyondScale: scaleMode === 'main5-global' && comparison && earliest.plotValue > scaleMaxValue,
            latestBeyondScale: scaleMode === 'main5-global' && latest.plotValue > scaleMaxValue,
            bothBeyondScale: scaleMode === 'main5-global' && comparison && earliest.plotValue > scaleMaxValue && latest.plotValue > scaleMaxValue,
            earliestVisible: Boolean(comparison) && !(scaleMode === 'main5-global' && earliest.plotValue > scaleMaxValue),
            latestVisible: !(scaleMode === 'main5-global' && comparison && earliest.plotValue > scaleMaxValue && latest.plotValue > scaleMaxValue),
            goalVisible: canShowGoalAndProjection && Number.isFinite(goalValue) && goalValue >= 0,
            projected2050Visible: canShowGoalAndProjection && Number.isFinite(projected2050Value) && projected2050Value >= 0,
            latestColor: scaleMode === 'main5' || scaleMode === 'main5-global' ? getMain5ProspectColor(latest.prospect) : '#1f4aff',
            baselineColor: scaleMode === 'main5' || scaleMode === 'main5-global' ? '#000000' : '#d62728'
        };
    }

    function valueToX(value, scaleMinValue, scaleMaxValue, xStart, xEnd) {
        if (!Number.isFinite(value) || !Number.isFinite(scaleMinValue) || !Number.isFinite(scaleMaxValue) || scaleMinValue === scaleMaxValue) {
            return xEnd;
        }
        const clamped = Math.max(scaleMinValue, Math.min(value, scaleMaxValue));
        let share;
        if ((scaleMode === 'global' || scaleMode === 'main5-global') && frontierAxisScaleState[containerId] === 'log' && scaleMaxValue > 0) {
            const logScaleMinValue = Math.max(FRONTIER_LOG_SCALE_MIN_VALUE, scaleMinValue);
            const logClamped = Math.max(logScaleMinValue, Math.min(value, scaleMaxValue));
            const logMin = frontierLogScaleValue(logScaleMinValue);
            const logMax = frontierLogScaleValue(scaleMaxValue);
            share = logMin === logMax ? 0 : (logMax - frontierLogScaleValue(logClamped)) / (logMax - logMin);
        } else {
            share = (scaleMaxValue - clamped) / (scaleMaxValue - scaleMinValue);
        }
        return xStart + share * (xEnd - xStart);
    }

    function renderLegend(wrapper, legendSvgId, width) {
        const legendItems = scaleMode === 'main5' || scaleMode === 'main5-global'
            ? [
                { label: 'Baseline value', shape: 'dot', color: '#000000' },
                { label: 'Most recent value: off track', shape: 'triangle', color: main5ProspectColors[0] },
                { label: 'Most recent value: partial progress', shape: 'triangle', color: main5ProspectColors[1] },
                { label: 'Most recent value: on track', shape: 'triangle', color: main5ProspectColors[2] }
            ]
            : [
                { label: 'Baseline value', shape: 'dot', color: '#d62728' },
                { label: 'Most recent value', shape: 'triangle', color: '#1f4aff' },
                { label: 'Half of most recent value', shape: 'star', color: '#2c8a4b' },
                { label: 'Projected 2050 value', shape: 'diamond', color: '#c97816' }
            ];
        const legendHeight = 88;
        const legendPaddingLeft = 14;
        const legendColumnWidth = (width - legendPaddingLeft - 8) / 2;
        const svg = wrapper.append('svg')
            .attr('id', legendSvgId)
            .attr('class', 'star-legend-svg frontier-line-legend-svg')
            .attr('width', width)
            .attr('height', legendHeight);

        const entry = svg.selectAll('g.frontier-line-legend-entry')
            .data(legendItems)
            .enter()
            .append('g')
            .attr('class', 'frontier-line-legend-entry')
            .attr('transform', (d, i) => {
                const row = Math.floor(i / 2);
                const col = i % 2;
                return `translate(${legendPaddingLeft + col * legendColumnWidth}, ${row * 28 + 14})`;
            });

        entry.each(function(d) {
            const g = d3.select(this);
            if (d.shape === 'dot') {
                g.append('circle').attr('cx', 7).attr('cy', 0).attr('r', 4).attr('fill', d.color).attr('stroke', '#ffffff').attr('stroke-width', 1);
            } else if (d.shape === 'triangle') {
                drawTriangleMarker(g, { x: 7, y: 0 }, 170, d.color, '#ffffff', 90, 1);
            } else if (d.shape === 'diamond') {
                g.append('path').attr('d', d3.symbol().type(d3.symbolDiamond).size(110)()).attr('transform', 'translate(8,0)').attr('fill', '#f0a43b').attr('stroke', d.color).attr('stroke-width', 1.2);
            } else {
                g.append('path').attr('d', d3.symbol().type(d3.symbolStar).size(140)()).attr('transform', 'translate(9,0)').attr('fill', '#2c8a4b').attr('stroke', '#1f6b39').attr('stroke-width', 1.1);
            }

            g.append('text').attr('x', 24).attr('y', 4).attr('font-size', 13).text(d.label);
        });
    }

    function renderFrontierLineChart(country, sex, rows, frontierExtents) {
        const chartId = `${containerId}-${country}-${sex}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
        const chartSvgId = `frontier-line-chart-${chartId}`;
        const legendSvgId = `frontier-line-legend-${chartId}`;
        const viewportWidth = Math.max(window.innerWidth - 28, 280);
        const isMobile = viewportWidth <= 420;
        const wrapper = chartHost.append('div').attr('class', 'multi-outcome-chart star-chart-wrapper star-line-chart-wrapper frontier-line-chart-wrapper').attr('id', chartId);
        const locationLabel = getCountryLabel(country);
        const titleText = sex === 'both' ? locationLabel : `${locationLabel} (${sex})`;
        const downloadFileName = `${titleText.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim()} frontier-scaled line plot.png`;
        const summaries = linePlotOutcomeConfig.map(outcome => buildOutcomeSummary(rows, outcome, frontierExtents, sex));
        const chartScaleLabel = scaleMode === 'main5'
            ? (summaries.find(summary => summary.scaleLabel)?.scaleLabel || '')
            : '';

        wrapper.append('h3').attr('class', 'multi-outcome-title').text(titleText);
        if (chartScaleLabel) {
            wrapper.append('div')
                .attr('class', 'star-plot-subtitle')
                .text(chartScaleLabel);
        }

        const width = isMobile ? Math.max(viewportWidth + 150, 500) : Math.min(viewportWidth, 780);
        const leftLabelWidth = isMobile ? 220 : 300;
        const rightPadding = isMobile ? 54 : 72;
        const topPadding = 28;
        const showLogScaleNote = scaleMode === 'main5-global' && frontierAxisScaleState[containerId] === 'log';
        const bottomPadding = showLogScaleNote ? 94 : 38;
        const rowGap = isMobile ? 82 : 88;
        const height = topPadding + bottomPadding + (Math.max(summaries.length, 1) * rowGap);
        const xStart = leftLabelWidth;
        const xEnd = width - rightPadding;
        const triangleMarkerSize = isMobile ? 95 : 180;
        const goalStarSize = isMobile ? 80 : 160;

        const svg = wrapper.append('svg')
            .attr('id', chartSvgId)
            .attr('class', 'star-line-chart-svg frontier-line-chart-svg')
            .attr('width', width)
            .attr('height', height)
            .style('font-family', 'Arial, sans-serif');

        if (showLogScaleNote) {
            svg.append('text')
                .attr('x', xStart)
                .attr('y', height - 70)
                .attr('fill', '#666')
                .attr('font-size', isMobile ? 10 : 11)
                .attr('font-style', 'italic')
                .text('Log base 2 scale: equal spacing represents doubling or halving; labels show original values.');
        }

        const lineGroup = svg.append('g');
        const labelGroup = svg.append('g');
        const markerGroup = svg.append('g');
        const valueLabelGroup = svg.append('g');

        summaries.forEach((summary, index) => {
            const y = topPadding + (index * rowGap) + (rowGap / 2);
            const scaleCaption = summary.scaleLabel && scaleMode !== 'main5' ? ` | ${summary.scaleLabel}` : '';

            labelGroup.append('text').attr('x', 8).attr('y', y - 10).attr('class', 'star-line-outcome-label').text(summary.shortLabel);
            labelGroup.append('text').attr('x', 8).attr('y', y + 14).attr('class', 'star-line-caption').text(`${summary.yearCaption || 'No data'}${scaleCaption}`);

            lineGroup.append('line').attr('x1', xStart).attr('y1', y).attr('x2', xEnd).attr('y2', y).attr('stroke', '#b8b8b8').attr('stroke-width', 2);
            lineGroup.append('line').attr('x1', xEnd - 14).attr('y1', y).attr('x2', xEnd).attr('y2', y).attr('stroke', '#8a8a8a').attr('stroke-width', 1.4);
            lineGroup.append('path').attr('d', d3.symbol().type(d3.symbolTriangle).size(42)()).attr('transform', `translate(${xEnd + 2}, ${y}) rotate(90)`).attr('fill', '#8a8a8a');

            if (summary.status !== 'ok') {
                return;
            }

            labelGroup.append('text').attr('x', xStart - 10).attr('y', y + 4).attr('fill', '#555').attr('font-size', isMobile ? 10 : 11).attr('text-anchor', 'end').text(roundStarValue(summary.scaleMaxValue));
            const scaleMinLabel = (scaleMode === 'main5' || scaleMode === 'main5-global') && frontierAxisScaleState[containerId] !== 'log'
                ? '0'
                : (scaleMode === 'global' || scaleMode === 'main5-global') && frontierAxisScaleState[containerId] === 'log' && summary.scaleMinValue <= 0
                    ? String(FRONTIER_LOG_SCALE_MIN_VALUE)
                    : roundStarValue(summary.scaleMinValue);
            labelGroup.append('text').attr('x', xEnd + 14).attr('y', y + 4).attr('fill', '#555').attr('font-size', isMobile ? 10 : 11).attr('text-anchor', 'start').text(scaleMinLabel);

            const baseX = summary.earliestBeyondScale ? xStart : valueToX(summary.earliest.plotValue, summary.scaleMinValue, summary.scaleMaxValue, xStart, xEnd);
            const latestX = summary.latestBeyondScale ? xStart : valueToX(summary.latest.plotValue, summary.scaleMinValue, summary.scaleMaxValue, xStart, xEnd);
            const goalX = valueToX(summary.goalValue, summary.scaleMinValue, summary.scaleMaxValue, xStart, xEnd);
            const projected2050X = valueToX(summary.projected2050Value, summary.scaleMinValue, summary.scaleMaxValue, xStart, xEnd);
            const markerBaseY = y;
            const markerLatestY = y;
            const triangleRotation = summary.latest.plotValue < summary.earliest.plotValue ? 90 : -90;
            const latestTriangleSize = scaleMode === 'main5' || scaleMode === 'main5-global' ? triangleMarkerSize * 1.35 : triangleMarkerSize;
            const labelOffsetAbove = isMobile ? -14 : -16;
            const labelOffsetBelow = isMobile ? 22 : 24;
            const visibleMarkers = [];

            if (summary.earliestVisible) { visibleMarkers.push({ key: 'earliest', value: summary.earliest.plotValue }); }
            if (summary.latestVisible) { visibleMarkers.push({ key: 'latest', value: summary.latest.plotValue }); }
            if (summary.goalVisible) { visibleMarkers.push({ key: 'goal', value: summary.goalValue }); }
            if (summary.projected2050Visible) { visibleMarkers.push({ key: 'projected2050', value: summary.projected2050Value }); }

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

            const markerLabelOffsetByKey = new Map(visibleMarkers.map((marker) => [marker.key, marker.labelOffsetY]));

            if (summary.earliestVisible && summary.latestVisible) {
                markerGroup.append('line').attr('x1', baseX).attr('y1', markerBaseY).attr('x2', latestX).attr('y2', markerLatestY).attr('stroke', '#000000').attr('stroke-width', 1.5);
            }
            if (summary.earliestBeyondScale && summary.latestVisible) {
                markerGroup.append('line').attr('x1', xStart).attr('y1', markerBaseY).attr('x2', latestX).attr('y2', markerLatestY).attr('stroke', '#000000').attr('stroke-width', 1.5);
            }
            if (summary.bothBeyondScale) {
                valueLabelGroup.append('text').attr('x', xStart + 8).attr('y', y - 18).attr('fill', '#555').attr('font-size', isMobile ? 10 : 11).attr('font-weight', 600).attr('text-anchor', 'start').text('Both values exceed scale');
            }
            if (summary.latestVisible) {
                drawTriangleMarker(markerGroup, { x: latestX, y: markerLatestY }, latestTriangleSize, summary.latestColor, '#ffffff', triangleRotation, 1.1);
            }
            if (summary.earliestVisible) {
                markerGroup.append('circle').attr('cx', baseX).attr('cy', markerBaseY).attr('r', isMobile ? 4 : 4.5).attr('fill', summary.baselineColor).attr('stroke', '#ffffff').attr('stroke-width', 1);
            }
            if (summary.goalVisible) {
                markerGroup.append('path').attr('d', d3.symbol().type(d3.symbolStar).size(goalStarSize)()).attr('transform', `translate(${goalX}, ${y})`).attr('fill', '#2c8a4b').attr('stroke', '#1f6b39').attr('stroke-width', 1.1);
            }
            if (summary.projected2050Visible) {
                markerGroup.append('path').attr('d', d3.symbol().type(d3.symbolDiamond).size(isMobile ? 70 : 120)()).attr('transform', `translate(${projected2050X}, ${y})`).attr('fill', '#f0a43b').attr('stroke', '#c97816').attr('stroke-width', 1.2);
            }

            if (summary.earliestVisible) {
                valueLabelGroup.append('text').attr('x', baseX).attr('y', markerBaseY + (markerLabelOffsetByKey.get('earliest') ?? labelOffsetBelow)).attr('fill', summary.baselineColor).attr('font-size', isMobile ? 10 : 12).attr('font-weight', 600).attr('text-anchor', 'middle').text(roundStarValue(summary.earliest.plotValue));
            }
            if (summary.goalVisible) {
                valueLabelGroup.append('text').attr('x', goalX).attr('y', y + (markerLabelOffsetByKey.get('goal') ?? labelOffsetAbove)).attr('fill', '#444444').attr('font-size', isMobile ? 10 : 12).attr('font-weight', 600).attr('text-anchor', 'middle').text(roundStarValue(summary.goalValue));
            }
            if (summary.latestVisible) {
                valueLabelGroup.append('text').attr('x', latestX).attr('y', markerLatestY + (markerLabelOffsetByKey.get('latest') ?? labelOffsetAbove)).attr('fill', summary.latestColor).attr('font-size', isMobile ? 10 : 12).attr('font-weight', 600).attr('text-anchor', 'middle').text(roundStarValue(summary.latest.plotValue));
            }
            if (summary.projected2050Visible) {
                valueLabelGroup.append('text').attr('x', projected2050X).attr('y', y + (markerLabelOffsetByKey.get('projected2050') ?? labelOffsetAbove)).attr('fill', '#a6610f').attr('font-size', isMobile ? 10 : 12).attr('font-weight', 600).attr('text-anchor', 'middle').text(roundStarValue(summary.projected2050Value));
            }
        });

        renderLegend(wrapper, legendSvgId, Math.min(width, 640));

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
                        subtitleText: chartScaleLabel,
                        titleHeight: chartScaleLabel ? 48 : 30,
                        titleFontSize: 18,
                        subtitleFontSize: 13,
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
        const ppdAssignments = scaleMode === 'ppd' ? await loadPpdFrontierScaleAssignments() : null;
        const useSelectionScale = scaleMode === 'main5-global' && frontierSelectionScaleState[containerId] === true;
        const scaleLocationIds = useSelectionScale
            ? new Set(selectedCountries.map(country => String(country)))
            : scaleMode === 'main5' || scaleMode === 'main5-global'
                ? await loadCountryTerritoryLocationIds()
                : null;
        const scaleSexSet = useSelectionScale
            ? new Set(selectedSex.map(sex => String(sex)))
            : null;
        const frontierExtents = buildFrontierExtents(rows, ppdAssignments, scaleLocationIds, scaleSexSet);
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
                    renderFrontierLineChart(country, sex, countrySexRows, frontierExtents);
                    chartCount += 1;
                }
            });
        });

        if (chartCount === 0) {
            renderMessage('No frontier-scaled line plot data for the current selection');
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
    if (axisToggle) {
        axisToggle.on('change', function(event) {
            frontierAxisScaleState[containerId] = event.target.checked ? 'log' : 'linear';
            renderAll();
        });
    }
    if (trimToggle) {
        trimToggle.on('change', function(event) {
            frontierTrimScaleState[containerId] = event.target.checked;
            renderAll();
        });
    }
    if (selectionScaleToggle) {
        selectionScaleToggle.on('change', function(event) {
            frontierSelectionScaleState[containerId] = event.target.checked;
            renderAll();
        });
    }

    renderAll();
}

function drawFrontierOutcomeLineFigures(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const dataFile = container.getAttribute('data-file') || 'data/stardata.csv';
    const outcomeKey = container.getAttribute('data-outcome');
    const outcome = starOutcomeConfig.find(item => item.key === outcomeKey);
    const requestedScaleMode = container.getAttribute('data-scale-mode');
    const scaleMode = requestedScaleMode === 'global'
        ? 'global'
        : requestedScaleMode === 'ppd'
            ? 'ppd'
            : requestedScaleMode === 'main5' || requestedScaleMode === 'main5-global'
                ? requestedScaleMode
                : 'tercile';
    container.innerHTML = '';
    const root = d3.select(`#${containerId}`);
    if (!frontierAxisScaleState[containerId]) {
        frontierAxisScaleState[containerId] = scaleMode === 'global' ? 'log' : 'linear';
    }
    let axisToggle = null;
    let trimToggle = null;
    let selectionScaleToggle = null;
    if (scaleMode === 'global' || scaleMode === 'main5-global') {
        const controls = root.append('div').attr('class', 'traditional-star-controls frontier-axis-controls');
        const toggleLabel = controls.append('label').attr('class', 'traditional-star-toggle');
        axisToggle = toggleLabel.append('input')
            .attr('type', 'checkbox')
            .property('checked', frontierAxisScaleState[containerId] === 'log');
        toggleLabel.append('span').text(scaleMode === 'main5-global' ? 'Use log base 2 scale' : 'Use ln scale');
        if (scaleMode === 'main5-global') {
            const trimLabel = controls.append('label')
                .attr('class', 'traditional-star-toggle')
                .style('margin-left', '18px');
            trimToggle = trimLabel.append('input')
                .attr('type', 'checkbox')
                .property('checked', frontierTrimScaleState[containerId] === true);
            trimLabel.append('span').text('Trim highest 20% from scale');
            const selectionScaleLabel = controls.append('label')
                .attr('class', 'traditional-star-toggle')
                .style('margin-left', '18px');
            selectionScaleToggle = selectionScaleLabel.append('input')
                .attr('type', 'checkbox')
                .property('checked', frontierSelectionScaleState[containerId] === true);
            selectionScaleLabel.append('span').text('Scale to selected countries and sexes');
        }
    }
    const chartHost = root.append('div').attr('id', `${containerId}-charts`);

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

    function buildOutcomeFrontierExtents(rows, ppdAssignments, scaleLocationIds, scaleSexSet) {
        const extents = new Map();
        const grouped = d3.group(rows, d => d.outcomeKey, d => d.sex, d => d.lid);

        grouped.forEach((sexMap, groupedOutcomeKey) => {
            if (groupedOutcomeKey !== outcomeKey) {
                return;
            }
            sexMap.forEach((countryMap, sex) => {
                if (scaleSexSet && !scaleSexSet.has(String(sex))) {
                    return;
                }
                const countryEntries = [];
                countryMap.forEach((countryRows) => {
                    const sorted = countryRows
                        .filter(row => Number.isFinite(row.plotValue))
                        .sort((a, b) => a.year - b.year);
                    if (sorted.length === 0) {
                        return;
                    }
                    countryEntries.push({
                        country: sorted[0].lid,
                        pairedRows: sorted.length > 1 ? [sorted[0], sorted[sorted.length - 1]] : [sorted[0]],
                        latest: sorted[sorted.length - 1]
                    });
                });

                countryEntries.forEach((entry) => {
                    const globalExtentKey = `global||${sex}`;
                    entry.pairedRows.forEach((row) => {
                        ensureFrontierExtent(extents, globalExtentKey, row.plotValue);
                    });
                });

                if (scaleMode === 'main5-global') {
                    countryEntries.forEach((entry) => {
                        if (!scaleLocationIds || scaleLocationIds.has(String(entry.country))) {
                            const extentKey = `extent||${sex}`;
                            entry.pairedRows.forEach((row) => {
                                ensureFrontierExtent(extents, extentKey, row.plotValue);
                            });
                        }
                    });
                    return;
                }

                if (scaleMode === 'main5') {
                    countryEntries.forEach((entry) => {
                        const assignment = getMain5ScaleAssignment(entry.latest);
                        if (assignment) {
                            entry.scaleKey = assignment.key;
                            entry.scaleLabel = assignment.label;
                        }
                    });
                } else if (scaleMode === 'ppd') {
                    countryEntries.forEach((entry) => {
                        const assignment = ppdAssignments ? ppdAssignments.get(`${sex}||${entry.country}`) : null;
                        if (assignment) {
                            entry.scaleKey = assignment.scaleKey;
                            entry.scaleLabel = assignment.scaleLabel;
                        }
                    });
                } else {
                    assignFrontierScaleGroups(countryEntries);
                }
                countryEntries.forEach((entry) => {
                    if (!entry.scaleKey) {
                        return;
                    }
                    const extentKey = `extent||${sex}||${entry.scaleKey}`;
                    const assignmentKey = `assignment||${sex}||${entry.country}`;
                    extents.set(assignmentKey, {
                        scaleKey: entry.scaleKey,
                        scaleLabel: entry.scaleLabel
                    });
                    if (!scaleLocationIds || scaleLocationIds.has(String(entry.country))) {
                        entry.pairedRows.forEach((row) => {
                            ensureFrontierExtent(extents, extentKey, row.plotValue);
                        });
                    }
                });
            });
        });

        return extents;
    }

    function buildCountrySummary(country, rows, frontierExtents, sex) {
        const matching = rows
            .filter(row => row.lid === String(country) && row.sex === sex && row.outcomeKey === outcomeKey && Number.isFinite(row.plotValue))
            .sort((a, b) => a.year - b.year);

        if (matching.length === 0) {
            return null;
        }

        const earliest = matching[0];
        const latest = matching[matching.length - 1];
        const comparison = matching.length > 1 ? earliest : null;
        const scaleAssignment = scaleMode !== 'global' && scaleMode !== 'main5-global'
            ? (frontierExtents.get(`assignment||${sex}||${country}`) || {})
            : {};
        const extent = scaleMode === 'main5-global'
            ? frontierExtents.get(`extent||${sex}`)
            : scaleMode !== 'global'
                ? frontierExtents.get(`extent||${sex}||${scaleAssignment.scaleKey}`)
                : frontierExtents.get(`global||${sex}`);
        const fallbackMin = Math.min(earliest.plotValue, latest.plotValue);
        const fallbackMax = Math.max(earliest.plotValue, latest.plotValue);
        const { scaleMinValue, scaleMaxValue } = normalizeFrontierExtent(extent, fallbackMin, fallbackMax, {
            zeroMin: scaleMode === 'main5' || scaleMode === 'main5-global',
            trimHighest20: scaleMode === 'main5-global' && frontierTrimScaleState[containerId] === true,
            logMinFromData: scaleMode === 'main5-global' && frontierAxisScaleState[containerId] === 'log'
        });

        const goalValue = latest.plotValue / 2;
        const canShowGoalAndProjection = scaleMode !== 'main5' && scaleMode !== 'main5-global';
        const canShowProjected2050 = Boolean(
            canShowGoalAndProjection &&
            comparison &&
            earliest.year < latest.year &&
            latest.year < 2050 &&
            earliest.plotValue > 0 &&
            latest.plotValue > 0
        );

        let projected2050Value = null;
        if (canShowProjected2050) {
            const elapsedYears = latest.year - earliest.year;
            const remainingYears = 2050 - latest.year;
            const annualChangeFactor = latest.plotValue / earliest.plotValue;
            projected2050Value = latest.plotValue * (annualChangeFactor ** (remainingYears / elapsedYears));
        }

        return {
            country,
            earliest,
            latest,
            comparison,
            goalValue,
            projected2050Value,
            scaleKey: scaleMode !== 'global' && scaleMode !== 'main5-global' ? scaleAssignment.scaleKey : null,
            scaleLabel: scaleMode !== 'global' && scaleMode !== 'main5-global' ? scaleAssignment.scaleLabel : null,
            scaleMinValue,
            scaleMaxValue,
            yearCaption: comparison ? `${earliest.year} baseline | ${latest.year} most recent` : `${latest.year} only`,
            earliestBeyondScale: scaleMode === 'main5-global' && comparison && earliest.plotValue > scaleMaxValue,
            latestBeyondScale: scaleMode === 'main5-global' && latest.plotValue > scaleMaxValue,
            bothBeyondScale: scaleMode === 'main5-global' && comparison && earliest.plotValue > scaleMaxValue && latest.plotValue > scaleMaxValue,
            earliestVisible: Boolean(comparison) && !(scaleMode === 'main5-global' && earliest.plotValue > scaleMaxValue),
            latestVisible: !(scaleMode === 'main5-global' && comparison && earliest.plotValue > scaleMaxValue && latest.plotValue > scaleMaxValue),
            goalVisible: canShowGoalAndProjection && Number.isFinite(goalValue) && goalValue >= 0,
            projected2050Visible: canShowGoalAndProjection && Number.isFinite(projected2050Value) && projected2050Value >= 0,
            latestColor: scaleMode === 'main5' || scaleMode === 'main5-global' ? getMain5ProspectColor(latest.prospect) : '#1f4aff',
            baselineColor: scaleMode === 'main5' || scaleMode === 'main5-global' ? '#000000' : '#d62728'
        };
    }

    function valueToX(value, scaleMinValue, scaleMaxValue, xStart, xEnd) {
        if (!Number.isFinite(value) || !Number.isFinite(scaleMinValue) || !Number.isFinite(scaleMaxValue) || scaleMinValue === scaleMaxValue) {
            return xEnd;
        }
        const clamped = Math.max(scaleMinValue, Math.min(value, scaleMaxValue));
        let share;
        if ((scaleMode === 'global' || scaleMode === 'main5-global') && frontierAxisScaleState[containerId] === 'log' && scaleMaxValue > 0) {
            const logScaleMinValue = Math.max(FRONTIER_LOG_SCALE_MIN_VALUE, scaleMinValue);
            const logClamped = Math.max(logScaleMinValue, Math.min(value, scaleMaxValue));
            const logMin = frontierLogScaleValue(logScaleMinValue);
            const logMax = frontierLogScaleValue(scaleMaxValue);
            share = logMin === logMax ? 0 : (logMax - frontierLogScaleValue(logClamped)) / (logMax - logMin);
        } else {
            share = (scaleMaxValue - clamped) / (scaleMaxValue - scaleMinValue);
        }
        return xStart + share * (xEnd - xStart);
    }

    function renderLegend(wrapper, legendSvgId, width) {
        const legendItems = scaleMode === 'main5' || scaleMode === 'main5-global'
            ? [
                { label: 'Baseline value', shape: 'dot', color: '#000000' },
                { label: 'Most recent value: off track', shape: 'triangle', color: main5ProspectColors[0] },
                { label: 'Most recent value: partial progress', shape: 'triangle', color: main5ProspectColors[1] },
                { label: 'Most recent value: on track', shape: 'triangle', color: main5ProspectColors[2] }
            ]
            : [
                { label: 'Baseline value', shape: 'dot', color: '#d62728' },
                { label: 'Most recent value', shape: 'triangle', color: '#1f4aff' },
                { label: 'Half of most recent value', shape: 'star', color: '#2c8a4b' },
                { label: 'Projected 2050 value', shape: 'diamond', color: '#c97816' }
            ];
        const legendHeight = 88;
        const legendPaddingLeft = 14;
        const legendColumnWidth = (width - legendPaddingLeft - 8) / 2;
        const svg = wrapper.append('svg')
            .attr('id', legendSvgId)
            .attr('class', 'star-legend-svg frontier-line-legend-svg')
            .attr('width', width)
            .attr('height', legendHeight);

        const entry = svg.selectAll('g.frontier-outcome-legend-entry')
            .data(legendItems)
            .enter()
            .append('g')
            .attr('class', 'frontier-outcome-legend-entry')
            .attr('transform', (d, i) => {
                const row = Math.floor(i / 2);
                const col = i % 2;
                return `translate(${legendPaddingLeft + col * legendColumnWidth}, ${row * 28 + 14})`;
            });

        entry.each(function(d) {
            const g = d3.select(this);
            if (d.shape === 'dot') {
                g.append('circle').attr('cx', 7).attr('cy', 0).attr('r', 4).attr('fill', d.color).attr('stroke', '#ffffff').attr('stroke-width', 1);
            } else if (d.shape === 'triangle') {
                drawTriangleMarker(g, { x: 7, y: 0 }, 170, d.color, '#ffffff', 90, 1);
            } else if (d.shape === 'diamond') {
                g.append('path').attr('d', d3.symbol().type(d3.symbolDiamond).size(110)()).attr('transform', 'translate(8,0)').attr('fill', '#f0a43b').attr('stroke', d.color).attr('stroke-width', 1.2);
            } else {
                g.append('path').attr('d', d3.symbol().type(d3.symbolStar).size(140)()).attr('transform', 'translate(9,0)').attr('fill', '#2c8a4b').attr('stroke', '#1f6b39').attr('stroke-width', 1.1);
            }

            g.append('text').attr('x', 24).attr('y', 4).attr('font-size', 13).text(d.label);
        });
    }

    function renderOutcomeSexChart(sex, scaleLevel, summaries) {
        const safeOutcome = outcomeKey.replace(/[^a-zA-Z0-9_-]/g, '-');
        const scaleSuffix = scaleLevel ? scaleLevel.key : 'global';
        const chartId = `${containerId}-${safeOutcome}-${sex}-${scaleSuffix}`;
        const chartSvgId = `frontier-outcome-chart-${chartId}`;
        const legendSvgId = `frontier-outcome-legend-${chartId}`;
        const viewportWidth = Math.max(window.innerWidth - 28, 280);
        const isMobile = viewportWidth <= 420;
        const wrapper = chartHost.append('div')
            .attr('class', 'multi-outcome-chart star-chart-wrapper star-line-chart-wrapper frontier-outcome-chart-wrapper')
            .attr('id', chartId);
        const sexLabel = `${sex.charAt(0).toUpperCase()}${sex.slice(1)}`;
        const baseTitleText = sex === 'both' ? outcome.shortLabel : `${outcome.shortLabel} - ${sexLabel}`;
        const titleText = scaleLevel ? `${baseTitleText} - ${scaleLevel.label}` : baseTitleText;
        const downloadFileName = `${titleText.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim()} frontier country comparison.png`;

        wrapper.append('h3').attr('class', 'multi-outcome-title').text(titleText);

        const width = isMobile ? Math.max(viewportWidth + 170, 520) : Math.min(viewportWidth, 780);
        const leftLabelWidth = isMobile ? 230 : 310;
        const rightPadding = isMobile ? 54 : 72;
        const topPadding = 30;
        const showLogScaleNote = scaleMode === 'main5-global' && frontierAxisScaleState[containerId] === 'log';
        const bottomPadding = showLogScaleNote ? 96 : 40;
        const rowGap = isMobile ? 76 : 78;
        const height = topPadding + bottomPadding + (Math.max(summaries.length, 1) * rowGap);
        const xStart = leftLabelWidth;
        const xEnd = width - rightPadding;
        const triangleMarkerSize = isMobile ? 95 : 170;
        const goalStarSize = isMobile ? 80 : 145;

        const svg = wrapper.append('svg')
            .attr('id', chartSvgId)
            .attr('class', 'star-line-chart-svg frontier-outcome-chart-svg')
            .attr('width', width)
            .attr('height', height)
            .style('font-family', 'Arial, sans-serif');

        if (showLogScaleNote) {
            svg.append('text')
                .attr('x', xStart)
                .attr('y', height - 70)
                .attr('fill', '#666')
                .attr('font-size', isMobile ? 10 : 11)
                .attr('font-style', 'italic')
                .text('Log base 2 scale: equal spacing represents doubling or halving; labels show original values.');
        }

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
                .text(getCountryLabel(summary.country));
            labelGroup.append('text')
                .attr('x', 8)
                .attr('y', y + 14)
                .attr('class', 'star-line-caption')
                .text(summary.yearCaption);

            lineGroup.append('line').attr('x1', xStart).attr('y1', y).attr('x2', xEnd).attr('y2', y).attr('stroke', '#b8b8b8').attr('stroke-width', 2);
            lineGroup.append('line').attr('x1', xEnd - 14).attr('y1', y).attr('x2', xEnd).attr('y2', y).attr('stroke', '#8a8a8a').attr('stroke-width', 1.4);
            lineGroup.append('path').attr('d', d3.symbol().type(d3.symbolTriangle).size(42)()).attr('transform', `translate(${xEnd + 2}, ${y}) rotate(90)`).attr('fill', '#8a8a8a');

            labelGroup.append('text').attr('x', xStart - 10).attr('y', y + 4).attr('fill', '#555').attr('font-size', isMobile ? 10 : 11).attr('text-anchor', 'end').text(roundStarValue(summary.scaleMaxValue));
            const scaleMinLabel = (scaleMode === 'main5' || scaleMode === 'main5-global') && frontierAxisScaleState[containerId] !== 'log'
                ? '0'
                : (scaleMode === 'global' || scaleMode === 'main5-global') && frontierAxisScaleState[containerId] === 'log' && summary.scaleMinValue <= 0
                    ? String(FRONTIER_LOG_SCALE_MIN_VALUE)
                    : roundStarValue(summary.scaleMinValue);
            labelGroup.append('text').attr('x', xEnd + 14).attr('y', y + 4).attr('fill', '#555').attr('font-size', isMobile ? 10 : 11).attr('text-anchor', 'start').text(scaleMinLabel);

            const baseX = summary.earliestBeyondScale ? xStart : valueToX(summary.earliest.plotValue, summary.scaleMinValue, summary.scaleMaxValue, xStart, xEnd);
            const latestX = summary.latestBeyondScale ? xStart : valueToX(summary.latest.plotValue, summary.scaleMinValue, summary.scaleMaxValue, xStart, xEnd);
            const goalX = valueToX(summary.goalValue, summary.scaleMinValue, summary.scaleMaxValue, xStart, xEnd);
            const projected2050X = valueToX(summary.projected2050Value, summary.scaleMinValue, summary.scaleMaxValue, xStart, xEnd);
            const markerBaseY = y;
            const markerLatestY = y;
            const triangleRotation = summary.latest.plotValue < summary.earliest.plotValue ? 90 : -90;
            const latestTriangleSize = scaleMode === 'main5' || scaleMode === 'main5-global' ? triangleMarkerSize * 1.35 : triangleMarkerSize;
            const labelOffsetAbove = isMobile ? -14 : -16;
            const labelOffsetBelow = isMobile ? 22 : 24;
            const visibleMarkers = [];

            if (summary.earliestVisible) { visibleMarkers.push({ key: 'earliest', value: summary.earliest.plotValue }); }
            if (summary.latestVisible) { visibleMarkers.push({ key: 'latest', value: summary.latest.plotValue }); }
            if (summary.goalVisible) { visibleMarkers.push({ key: 'goal', value: summary.goalValue }); }
            if (summary.projected2050Visible) { visibleMarkers.push({ key: 'projected2050', value: summary.projected2050Value }); }

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

            const markerLabelOffsetByKey = new Map(visibleMarkers.map((marker) => [marker.key, marker.labelOffsetY]));

            if (summary.earliestVisible && summary.latestVisible) {
                markerGroup.append('line').attr('x1', baseX).attr('y1', markerBaseY).attr('x2', latestX).attr('y2', markerLatestY).attr('stroke', '#000000').attr('stroke-width', 1.5);
            }
            if (summary.earliestBeyondScale && summary.latestVisible) {
                markerGroup.append('line').attr('x1', xStart).attr('y1', markerBaseY).attr('x2', latestX).attr('y2', markerLatestY).attr('stroke', '#000000').attr('stroke-width', 1.5);
            }
            if (summary.bothBeyondScale) {
                valueLabelGroup.append('text').attr('x', xStart + 8).attr('y', y - 18).attr('fill', '#555').attr('font-size', isMobile ? 10 : 11).attr('font-weight', 600).attr('text-anchor', 'start').text('Both values exceed scale');
            }
            if (summary.latestVisible) {
                drawTriangleMarker(markerGroup, { x: latestX, y: markerLatestY }, latestTriangleSize, summary.latestColor, '#ffffff', triangleRotation, 1.1);
            }
            if (summary.earliestVisible) {
                markerGroup.append('circle').attr('cx', baseX).attr('cy', markerBaseY).attr('r', isMobile ? 4 : 4.5).attr('fill', summary.baselineColor).attr('stroke', '#ffffff').attr('stroke-width', 1);
            }
            if (summary.goalVisible) {
                markerGroup.append('path').attr('d', d3.symbol().type(d3.symbolStar).size(goalStarSize)()).attr('transform', `translate(${goalX}, ${y})`).attr('fill', '#2c8a4b').attr('stroke', '#1f6b39').attr('stroke-width', 1.1);
            }
            if (summary.projected2050Visible) {
                markerGroup.append('path').attr('d', d3.symbol().type(d3.symbolDiamond).size(isMobile ? 70 : 110)()).attr('transform', `translate(${projected2050X}, ${y})`).attr('fill', '#f0a43b').attr('stroke', '#c97816').attr('stroke-width', 1.2);
            }

            if (summary.earliestVisible) {
                valueLabelGroup.append('text').attr('x', baseX).attr('y', markerBaseY + (markerLabelOffsetByKey.get('earliest') ?? labelOffsetBelow)).attr('fill', summary.baselineColor).attr('font-size', isMobile ? 10 : 12).attr('font-weight', 600).attr('text-anchor', 'middle').text(roundStarValue(summary.earliest.plotValue));
            }
            if (summary.goalVisible) {
                valueLabelGroup.append('text').attr('x', goalX).attr('y', y + (markerLabelOffsetByKey.get('goal') ?? labelOffsetAbove)).attr('fill', '#444444').attr('font-size', isMobile ? 10 : 12).attr('font-weight', 600).attr('text-anchor', 'middle').text(roundStarValue(summary.goalValue));
            }
            if (summary.latestVisible) {
                valueLabelGroup.append('text').attr('x', latestX).attr('y', markerLatestY + (markerLabelOffsetByKey.get('latest') ?? labelOffsetAbove)).attr('fill', summary.latestColor).attr('font-size', isMobile ? 10 : 12).attr('font-weight', 600).attr('text-anchor', 'middle').text(roundStarValue(summary.latest.plotValue));
            }
            if (summary.projected2050Visible) {
                valueLabelGroup.append('text').attr('x', projected2050X).attr('y', y + (markerLabelOffsetByKey.get('projected2050') ?? labelOffsetAbove)).attr('fill', '#a6610f').attr('font-size', isMobile ? 10 : 12).attr('font-weight', 600).attr('text-anchor', 'middle').text(roundStarValue(summary.projected2050Value));
            }
        });

        renderLegend(wrapper, legendSvgId, Math.min(width, 640));

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
        const ppdAssignments = scaleMode === 'ppd' ? await loadPpdFrontierScaleAssignments() : null;
        const useSelectionScale = scaleMode === 'main5-global' && frontierSelectionScaleState[containerId] === true;
        const scaleLocationIds = useSelectionScale
            ? new Set(selectedCountries.map(country => String(country)))
            : scaleMode === 'main5' || scaleMode === 'main5-global'
                ? await loadCountryTerritoryLocationIds()
                : null;
        const scaleSexSet = useSelectionScale
            ? new Set(selectedSex.map(sex => String(sex)))
            : null;
        const frontierExtents = buildOutcomeFrontierExtents(rows, ppdAssignments, scaleLocationIds, scaleSexSet);
        chartHost.html('');

        if (!outcome) {
            renderMessage('Unknown outcome for frontier comparison');
            return;
        }

        if (selectedCountries.length === 0 || selectedSex.length === 0) {
            renderMessage('Select location and sex');
            return;
        }

        let chartCount = 0;
        selectedSex.forEach((sex) => {
            const summaries = selectedCountries
                .map(country => buildCountrySummary(country, rows, frontierExtents, sex))
                .filter(Boolean);
            if (scaleMode === 'global' || scaleMode === 'main5-global') {
                if (summaries.length > 0) {
                    renderOutcomeSexChart(sex, null, summaries);
                    chartCount += 1;
                }
            } else {
                const scaleLevels = scaleMode === 'main5'
                    ? main5FrontierScaleLevels
                    : (scaleMode === 'ppd' ? ppdFrontierScaleLevels : frontierScaleLevels);
                scaleLevels.forEach((scaleLevel) => {
                    const scaleSummaries = summaries.filter(summary => summary.scaleKey === scaleLevel.key);
                    if (scaleSummaries.length > 0) {
                        renderOutcomeSexChart(sex, scaleLevel, scaleSummaries);
                        chartCount += 1;
                    }
                });
            }
        });

        if (chartCount === 0) {
            renderMessage(`No ${outcome.shortLabel.toLowerCase()} data for the current selection`);
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
    if (axisToggle) {
        axisToggle.on('change', function(event) {
            frontierAxisScaleState[containerId] = event.target.checked ? 'log' : 'linear';
            renderAll();
        });
    }
    if (trimToggle) {
        trimToggle.on('change', function(event) {
            frontierTrimScaleState[containerId] = event.target.checked;
            renderAll();
        });
    }
    if (selectionScaleToggle) {
        selectionScaleToggle.on('change', function(event) {
            frontierSelectionScaleState[containerId] = event.target.checked;
            renderAll();
        });
    }

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
