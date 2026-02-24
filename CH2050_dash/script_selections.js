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
        has_imr: 'Mortality by single-year ages (UN WPP)',
        has_nmr: 'Neonatal mortality (UN WPP+GBD)',
        has_pnm: 'Postneonatal mortality (UN WPP+GBD)',
        has_unnmr: 'Neonatal mortality (UN-IGME)',
        has_gbdnmr: 'Neonatal mortality (GBD)',
        has_cms: 'Female height (DHS)',
        has_ncdcm5: 'Height (NCD-RisC)',
        has_wimort: 'Under-5 mortality by wealth'
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
    return [];
}

loadLocationSelectionData().then(function(data) {
    const treeContainer = d3.select('#treeContainer');
    treeContainer.html('');

    const hasColumns = (data.columns || []).filter(col => col.startsWith('has_'));
    const activeVarFilters = new Set();

    locationNameByLid = new Map(data.map(d => [String(d.lid), d.loc]));
    const locationIdByName = new Map(data.map(d => [d.loc, String(d.lid)]));
    selectedCountries = getDefaultLocationIds(locationIdByName);

    const controls = treeContainer.append('div').attr('class', 'variable-filters');
    const controlsTitle = controls.append('div')
        .attr('class', 'variable-filters-title variable-filters-toggle')
        .text('[+] Filter locations by available variable(s):');

    const controlsWrap = controls.append('div').attr('class', 'variable-filters-list').style('display', 'none');
    let filtersExpanded = false;

    controlsTitle.on('click', function() {
        filtersExpanded = !filtersExpanded;
        controlsWrap.style('display', filtersExpanded ? null : 'none');
        controlsTitle.text(`${filtersExpanded ? '[-]' : '[+]'} Filter locations by available variable(s):`);
    });
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

    function updateVariableFilterAvailability() {
        const femaleSelected = selectedSex.includes('female');
        const bothSelected = selectedSex.includes('both');
        const cmsCheckbox = document.getElementById('var-filter-has_cms');
        const unnmrCheckbox = document.getElementById('var-filter-has_unnmr');
        const wimortCheckbox = document.getElementById('var-filter-has_wimort');

        let filtersChanged = false;

        if (cmsCheckbox) {
            cmsCheckbox.disabled = !femaleSelected;
            if (!femaleSelected && cmsCheckbox.checked) {
                cmsCheckbox.checked = false;
                activeVarFilters.delete('has_cms');
                filtersChanged = true;
            }
        }

        if (unnmrCheckbox) {
            unnmrCheckbox.disabled = !bothSelected;
            if (!bothSelected && unnmrCheckbox.checked) {
                unnmrCheckbox.checked = false;
                activeVarFilters.delete('has_unnmr');
                filtersChanged = true;
            }
        }

        if (wimortCheckbox) {
            wimortCheckbox.disabled = !bothSelected;
            if (!bothSelected && wimortCheckbox.checked) {
                wimortCheckbox.checked = false;
                activeVarFilters.delete('has_wimort');
                filtersChanged = true;
            }
        }

        if (filtersChanged) {
            applyVariableFilters();
        }
    }

    document.addEventListener('sexwasSelected', updateVariableFilterAvailability);
    updateVariableFilterAvailability();
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
