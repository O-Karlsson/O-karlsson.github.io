/*************************************************************************************
**************************************************************************************
* Constructing selection tree for locations
**************************************************************************************
*************************************************************************************/

// Initialize global arrays to store selected locations and selected sex
let selectedCountries = [];
let selectedSex = ['both'];
let locationNameByLid = new Map();

function getLocationDisplay(lid) {
    const key = String(lid);
    return locationNameByLid.get(key) || key;
}

function isAvailableFlag(value) {
    return String(value).trim() === '1';
}

function prettyVariableName(hasColumn) {
    const variableLabels = {
        has_imr: 'Infant mortality',
        has_cmr: 'Child mortality (1-4 years)',
        has_q5_10: 'Mortality age 5-9 years',
        has_q10_15: 'Mortality age 10-15 years',
        has_q15_19: 'Mortality age 15-19 years',
        has_u5m: 'Under-5 mortality',
        has_nmr: 'Neonatal mortality',
        has_pnm: 'Postneonatal mortality',
        has_unnmr: 'Neonatal mortality (UN-IGME)',
        has_gbdnmr: 'Neonatal mortality (GBD)',
        has_cms: 'Female height (DHS)',
        has_ncdcm5: 'Height at age 5',
        has_ncdcm10: 'Height at age 10',
        has_ncdcm15: 'Height at age 15',
        has_ncdcm19: 'Height at age 19'
    };

    return variableLabels[hasColumn] || hasColumn.replace(/^has_/, '').toUpperCase();
}

function uniquePush(arr, value) {
    if (!arr.includes(value)) {
        arr.push(value);
    }
}

function removeValue(arr, value) {
    return arr.filter(item => item !== value);
}

function loadLocationSelectionData() {
    // Try the user-provided name first, then fallback to existing file name in this repo.
    return d3.csv('data/location_selection.csv').catch(() => d3.csv('data/location_select.csv'));
}

function getDefaultLocationIds(locationIdByName) {
    const preferredGroups = [
        ['Africa'],
        ['Europe'],
        ['North America', 'Northern America']
    ];

    const chosen = [];
    preferredGroups.forEach(group => {
        const match = group.find(name => locationIdByName.has(name));
        if (match) {
            chosen.push(String(locationIdByName.get(match)));
        }
    });
    return chosen;
}

loadLocationSelectionData().then(function(data) {
    const treeContainer = d3.select('#treeContainer');
    treeContainer.html('');

    const hasColumns = (data.columns || []).filter(col => col.startsWith('has_'));
    const activeVarFilters = new Set();

    locationNameByLid = new Map(data.map(d => [String(d.lid), d.loc]));
    const locationIdByName = new Map(data.map(d => [d.loc, String(d.lid)]));
    const fallbackDefaults = data.slice(0, 3).map(d => String(d.lid));
    selectedCountries = getDefaultLocationIds(locationIdByName);
    if (selectedCountries.length === 0) {
        selectedCountries = fallbackDefaults;
    }

    const controls = treeContainer.append('div').attr('class', 'variable-filters');
    controls.append('div').attr('class', 'variable-filters-title').text('Filter locations by available variable(s):');

    const controlsWrap = controls.append('div').attr('class', 'variable-filters-list');
    hasColumns.forEach(col => {
        const id = `var-filter-${col}`;
        const item = controlsWrap.append('label').attr('class', 'variable-filter-item').attr('for', id);

        item.append('input')
            .attr('type', 'checkbox')
            .attr('id', id)
            .attr('value', col)
            .on('change', function(event) {
                const variable = event.target.value;
                if (event.target.checked) {
                    activeVarFilters.add(variable);
                } else {
                    activeVarFilters.delete(variable);
                }
                applyVariableFilters();
            });

        item.append('span').text(prettyVariableName(col));
    });

    const grouped = d3.group(data, d => d.heading1, d => d.heading2);
    const treeData = Array.from(grouped, ([heading1, heading2Map]) => ({
        name: heading1,
        children: Array.from(heading2Map, ([heading2, rows]) => ({
            name: heading2,
            children: rows.map(d => ({ ...d, name: d.loc, id: String(d.lid) }))
        }))
    }));

    const rootUl = treeContainer.append('ul').attr('class', 'selection-tree');

    const heading1Li = rootUl.selectAll('li.heading1-node')
        .data(treeData)
        .enter()
        .append('li')
        .attr('class', 'node node--internal node--internal-level1 heading1-node');

    heading1Li.append('span')
        .attr('class', 'heading1-label')
        .text(d => d.name);

    const heading2Ul = heading1Li.append('ul').style('display', 'block');

    const heading2Li = heading2Ul.selectAll('li.heading2-node')
        .data(d => d.children)
        .enter()
        .append('li')
        .attr('class', 'node node--internal node--internal-level2 heading2-node');

    heading2Li.append('span')
        .attr('class', 'toggle')
        .text(d => `${d.name === 'UN regions' ? '[-]' : '[+]'} ${d.name}`)
        .on('click', function(event, d) {
            const subList = d3.select(this.parentNode).select('ul');
            const expanded = subList.style('display') !== 'none';
            subList.style('display', expanded ? 'none' : 'block');
            d3.select(this).text(`${expanded ? '[+]' : '[-]'} ${d.name}`);
        });

    const locUl = heading2Li.append('ul').style('display', d => (d.name === 'UN regions' ? 'block' : 'none'));

    const leafLi = locUl.selectAll('li.location-node')
        .data(d => d.children)
        .enter()
        .append('li')
        .attr('class', 'node node--leaf location-node');

    leafLi.each(function(d) {
        const row = d3.select(this);
        hasColumns.forEach(col => row.attr(`data-${col}`, isAvailableFlag(d[col]) ? '1' : '0'));

        const label = row.append('label').attr('class', 'node-checkbox');
        const isChecked = selectedCountries.includes(d.id);

        label.append('input')
            .attr('type', 'checkbox')
            .attr('value', d.id)
            .property('checked', isChecked)
            .on('change', function(event) {
                const value = event.target.value;
                if (event.target.checked) {
                    uniquePush(selectedCountries, value);
                } else {
                    selectedCountries = removeValue(selectedCountries, value);
                }
                document.dispatchEvent(new Event('countrywasSelected'));
            });

        label.append('span').text(` ${d.name}`);
    });

    function applyVariableFilters() {
        let selectionChanged = false;

        treeContainer.selectAll('li.location-node').each(function(d) {
            const isVisible = Array.from(activeVarFilters).every(col => isAvailableFlag(d[col]));
            const row = d3.select(this);
            row.style('display', isVisible ? null : 'none');

            if (!isVisible) {
                const checkbox = row.select('input').node();
                if (checkbox && checkbox.checked) {
                    checkbox.checked = false;
                    selectedCountries = removeValue(selectedCountries, checkbox.value);
                    selectionChanged = true;
                }
            }
        });

        treeContainer.selectAll('li.heading2-node').each(function() {
            const parent = d3.select(this);
            const visibleChildren = parent.selectAll('li.location-node').filter(function() {
                return d3.select(this).style('display') !== 'none';
            }).size();

            parent.style('display', visibleChildren > 0 ? null : 'none');
        });

        treeContainer.selectAll('li.heading1-node').each(function() {
            const parent = d3.select(this);
            const visibleChildren = parent.selectAll('li.heading2-node').filter(function() {
                return d3.select(this).style('display') !== 'none';
            }).size();

            parent.style('display', visibleChildren > 0 ? null : 'none');
        });

        if (selectionChanged) {
            document.dispatchEvent(new Event('countrywasSelected'));
        }
    }

    function updateFemaleHeightAvailability() {
        const femaleSelected = selectedSex.includes('female');
        const cmsCheckbox = document.getElementById('var-filter-has_cms');
        if (!cmsCheckbox) { return; }

        cmsCheckbox.disabled = !femaleSelected;
        if (!femaleSelected && cmsCheckbox.checked) {
            cmsCheckbox.checked = false;
            activeVarFilters.delete('has_cms');
            applyVariableFilters();
        }
    }

    document.addEventListener('sexwasSelected', updateFemaleHeightAvailability);
    updateFemaleHeightAvailability();
    applyVariableFilters();
});


/*************************************************************************************
**************************************************************************************
* Event listeners for sex selections and clear selections button
**************************************************************************************
*************************************************************************************/

// Event listener for sex checkboxes. The boxes are created in index.html
document.querySelectorAll('input[name="sex"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
        selectedSex = Array.from(document.querySelectorAll('input[name="sex"]:checked')).map(box => box.value);
        document.dispatchEvent(new Event('sexwasSelected'));
    });
});

// Clear selections button (created in index.html)
document.getElementById('clearSelection').addEventListener('click', function() {
    document.querySelectorAll('input[name="sex"]').forEach(checkbox => {
        checkbox.checked = checkbox.value === 'both';
    });
    selectedSex = ['both'];
    document.dispatchEvent(new Event('sexwasSelected'));

    document.querySelectorAll('#treeContainer li.location-node input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    selectedCountries = [];

    document.querySelectorAll('#treeContainer .variable-filters input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));
    });

    document.dispatchEvent(new Event('countrywasSelected'));
});

// dispatch events that can be container specific. Makes it easier to remove listeners when headings are collapsed
document.addEventListener('countrywasSelected', () => {
    const expandedContainers = document.querySelectorAll('[data-rendered="true"]');
    expandedContainers.forEach(container => {
        const containerId = container.id;
        const customEvent = new CustomEvent(`countrywasSelected-${containerId}`);
        document.dispatchEvent(customEvent);
    });
});

document.addEventListener('sexwasSelected', () => {
    const expandedContainers = document.querySelectorAll('[data-rendered="true"]');
    expandedContainers.forEach(container => {
        const containerId = container.id;
        const customEvent = new CustomEvent(`sexwasSelected-${containerId}`);
        document.dispatchEvent(customEvent);
    });
});
