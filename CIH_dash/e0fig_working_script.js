/*************************************************************************************
**************************************************************************************
* Various functions
**************************************************************************************
*************************************************************************************/

// used to calculate total gap/change in life expectancy
function calculateSumByGroup(primaryfilteredData, outcome) {
    const sumByGroup = {};
        // Group the data by `sex`, `country`, and `year` only
    const groupedData = d3.group(primaryfilteredData, d => d.sex, d => d.country, d => d.year);
        groupedData.forEach((sexGroup, sex) => {
        sexGroup.forEach((countryGroup, country) => {
            countryGroup.forEach((yearGroup, year) => {
                const sumForCalculation = d3.sum(
                    yearGroup.filter(v => {
                        if (v.causename === "Total") {
                            return true;
                        }
                        return false;
                    }),
                    v => {
                        let value = v[outcome];
                        return value;
                    }
                );
                sumByGroup[`${sex}-${country}-${year}`] = sumForCalculation;
            });
        });
    });
    return sumByGroup;
}

// used to redefine years in case the comparison is e0 across time
function redefineYear(year , type) {
    if (type=='alternative') {
        switch (year) {
            case 2000:
                return 2000;
            case 2010:
                return 2000;
            case 2019:
                return 2010;
            case 2021:
                return 2019;
            default:
                return year; // Return the original year if it's not mapped
        }
    } else {
        return year;
    }
}


// gets e0 from the data file (this file is in memory so it's possible to make it more efficient)
function fetchE0(country, year, sex, outcome = 'e0') {
    // Load the CSV and return a promise that resolves to the e0 value
    return d3.csv("data/data_by_year.csv").then(ledata => {
        const filteredData = ledata.filter(d =>
            d.sex === sex &&
            d.country === country &&
            +d.year === year &&
            d[outcome] !== '' 
        );
        if (filteredData.length > 0) {
            return +filteredData[0][outcome];
        } else {
            return null;
        }
    });
}

/*************************************************************************************
**************************************************************************************
* Add year/period selections
**************************************************************************************
*************************************************************************************/

function insertExtrasSelections(containerId, type) {

        /* Comparison to the North Atlantic is the 'default'. This adds a checkbox which
        switches between the outcomes: one where negative values were removed and one where
        they are not. Also the 'year' variable means different things across 'types' */
        let selectedYears, yearLabels, mes;
        if (type === 'default') {
            // Select the chart container and append the checkbox at the top within it
            const checkboxContainer = d3.select(`#${containerId}`)
                .insert('div', ':first-child') // Insert at the top of the container
                .attr('class', 'checkbox-container')
                .style('display', 'flex')
                .style('justify-content', 'flex-start')
                .style('align-items', 'center')
                .style('margin-bottom', '10px'); // Add space between the checkbox and chart
        
            // Append the checkbox first, then the text
            checkboxContainer.append('input')
                .attr('type', 'checkbox')
                .property('checked', true)
                .attr('id', `${containerId}-checkbox`)
                .on('change', () => renderChart(containerId)); // Trigger chart update when checkbox is changed
        
            checkboxContainer.append('label')
                .attr('for', `${containerId}-checkbox`) // Associate label with checkbox
                .text('Remove negative values (ie, impact of causes for which mortality was greater in the North Atlantic)')
                .style('font-size', '16px')
                .style('margin-left', '5px');  
            
            selectedYears = [2019]; // Default selected years for 'default' type
            yearLabels = {2000: "2000", 2010: "2010", 2019: "2019", 2021: "2021"};
            mes='gap';    
    
            // comparison across time is the "alternative"
            } else if (type === 'alternative') {
                selectedYears = [2000]; // Default selected years for 'default' type
                yearLabels = {2000: "2000–19", 2010: "2000–10", 2019: "2010–19", 2021: "2019–21"};
                mes='change';
            }
            
            // Checkboxes for year selection
            const yearOptions = [2000, 2010, 2019, 2021];
            d3.select(`#${containerId}`)
                .append('div')
                .attr('id', `${containerId}-year-checkboxes`)
                .style('display', 'flex')
                .style('justify-content', 'center')
                .style('margin-bottom', '20px')
                .selectAll('label')
                .data(yearOptions)
                .enter()
                .append('label')
                .style('font-size', '16px')
                .each(function (d) {
                    // Append the checkbox input
                    d3.select(this)
                        .append('input')
                        .attr('type', 'checkbox')
                        .attr('value', d)
                        .property('checked', selectedYears.includes(d))
                        .on('change', function () {
                            // Update selectedYears based on checked checkboxes
                            selectedYears.length = 0;
                            d3.selectAll(`#${containerId}-year-checkboxes input:checked`).each(function () {
                                selectedYears.push(+this.value);
                            });
                        });
            
                    // Append the custom label text based on the selected yearLabels
                    d3.select(this)
                        .append('span')
                        .text(yearLabels[d]) // Use the custom label from the appropriate yearLabels object
                        .style('padding-right', '10px');
                });
                
                return [selectedYears, mes];
    
}


/*************************************************************************************
**************************************************************************************
* Make figure
**************************************************************************************
*************************************************************************************/

function renderChart(containerId) {

    document.addEventListener("DOMContentLoaded", function () {
        // Get the container element by ID
        const container = document.getElementById(containerId);

        if (!container) {
            console.error(`Container with ID ${containerId} not found`);
            return;
        }
    const datasetPath = container.getAttribute('data-dataset');
    const defaultOutcome = container.getAttribute('data-outcome');
    const xAxisTitle = container.getAttribute('data-x-axis-title');
    const type = container.getAttribute('data-type');

    
    let selectedYears, mes;    
    [selectedYears, mes] = insertExtrasSelections(containerId, type);

/*************************************************************************************
* Making the hover info
**************************************************************************************/

    const tooltip = d3.select(`#${containerId}`)
        .append('div')
        .attr('class', 'tooltip')
        .style('display', 'none')
        .style('position', 'absolute')
        .style('background', '#fff')
        .style('border', '1px solid #ccc')
        .style('padding', '5px')
        .style('border-radius', '4px')
        .style('pointer-events', 'none')
        .style('z-index', '1000');

/*************************************************************************************
**************************************************************************************
* Update chart
**************************************************************************************
**************************************************************************************/
    
    function updateChart() {

        

        // Remove existing chart
        d3.select(`#${containerId}`).selectAll('.chart-container').remove();

        
/*************************************************************************************
**************************************************************************************
* Filter data according to selection
**************************************************************************************
**************************************************************************************/

        // checkboxes are above: selectedCountries and selectedSex in the selections js
        
        // the year selection (or change over period)
        const checkbox = document.getElementById(`${containerId}-checkbox`);

        // include/exclude negative values in decomposition compared to North Atlantic
        const outcome = checkbox && checkbox.checked ? `${defaultOutcome}_no0` : defaultOutcome;


        // make country, sex, and year selections and then go on to plot the data for each
            d3.csv(datasetPath).then(data => {
                selectedCountries.forEach(country => {
                    selectedSex.forEach(sex => {
                        selectedYears.forEach(year => {
        
        // Filter data by primary selections (country, year, and sex)
        const primaryfilteredData = data.filter(d =>
            d.sex === sex &&
            d.country === country &&
            +d.year === year &&
            d[outcome] !== ''
        );

        // Calculate the sum of outcome for "Total" observations within the filtered data (total gap)
        const sumByGroup = calculateSumByGroup(primaryfilteredData, outcome); // true to convert negatives to zero

        // Filter out "Total" (which show total impact of the broader sets) observations from the main dataset
        const filteredData = primaryfilteredData.filter(d => d.causename !== "Total");





/*************************************************************************************
**************************************************************************************
* Create the container
**************************************************************************************
**************************************************************************************/
         
        const chartContainer = d3.select(`#${containerId}`)
            .append('div')
            .attr('class', 'chart-container');
            

        const svgWrapper = chartContainer.append('div')
            .attr('id', `${containerId}-chart`)
            .style('position', 'relative')
            .style('display', 'inline-block')
            .style('max-width', '800px')
            .style('width', '100%');

        const topMargin = 80; 
        const bottomMargin = 20;
        const svgWidth = 800;
        const svgHeight = 500 + topMargin + bottomMargin;

        const svg = svgWrapper.append('svg')
            .attr('class', 'chart')
            .attr('width', '100%')
            .style('height', 'auto')
            .attr('viewBox', `0 0 ${svgWidth} ${svgHeight+ 50}`)
            .attr('preserveAspectRatio', 'xMinYMin meet');

        // Calculate the maximum label width for dynamic margin adjustment
        const longestLabel = Math.max(...filteredData.map(d => d.causename.length));

        // Approximate character width in pixels (adjust according to font-size)
        const estimatedLabelWidth = longestLabel * 8; 
        const leftMargin = Math.max(estimatedLabelWidth, 150);

        // this positions groups within the svg canvas. transform moves the group by x, y
        const g = svg.append('g')
            .attr('transform', `translate(${leftMargin}, ${topMargin})`); 

            
/*************************************************************************************
**************************************************************************************
* Structure the data for bar charts
**************************************************************************************
**************************************************************************************/

        // these are the broad categories. the data from these won't be plotted but the labels are used
        const mainCategories = {
            "NCD7 priority conditions": [],
            "I8 priority conditions": [],
            "All other causes (top 5 out of 117)": []
        };

        // add the elements to the end of the appropriate array
        filteredData.forEach(d => {
            d[outcome] = +d[outcome];
            if (d.type === "NCD7 priority conditions") {
                mainCategories["NCD7 priority conditions"].push(d); 
            } else if (d.type === "I8 priority conditions") {
                mainCategories["I8 priority conditions"].push(d);
            } else {
                mainCategories["All other causes (top 5 out of 117)"].push(d);
            }
        });

        /*  Object.keys() gets all the keys and then it loops through them and sort
        outcome within each of the categories */ 
        Object.keys(mainCategories).forEach(key => {
            mainCategories[key].sort((a, b) => b[outcome] - a[outcome]);
        });

        /* Creating a data structure for plotting */
        let allData = [];
        Object.keys(mainCategories).forEach(key => {
            allData.push({causename: key, isCategoryLabel: true }); // isCategoryLabel identifies the row as main category
            allData = allData.concat(mainCategories[key]); // the data to be plotted 
        });

/*************************************************************************************
**************************************************************************************
* Create axes and grid lines (y-axis tick label below)
**************************************************************************************
**************************************************************************************/

        // the min and max outcome for the x-scale range
        const minValue = d3.min(allData.filter(d => !d.isCategoryLabel), d => +d[outcome]);
        const maxValue = d3.max(allData.filter(d => !d.isCategoryLabel), d => +d[outcome]);

        const xScale = d3.scaleLinear()
            .domain([minValue < 0 ? minValue : 0, maxValue])
            .range([0, svgWidth - leftMargin - 50]);

        const yScale = d3.scaleBand()
            .domain(allData.map(d => d.causename))
            .range([0, 500])
            .paddingInner(0.1)
            .paddingOuter(0.2);

        // set different colored bars according to the broader sets of causes        
        const colorScale = d3.scaleOrdinal()
            .domain(Object.keys(mainCategories))
            .range(['#76bee8', '#e8a876', '#b0b0b0']);

        // create grid lines    
        const ticks = xScale.ticks();
        // Create halfway grid-lines
        const halfwayTicks = ticks.map((d, i, arr) => {
            if (i < arr.length - 1) {
                return (d + arr[i + 1]) / 2;
            }
        }).filter(d => d !== undefined);
                
        g.selectAll('.halfway-grid')
            .data([...ticks, ...halfwayTicks])
            .enter()
            .append('line')
            .attr('class', 'halfway-grid')
            .attr('x1', d => xScale(d))
            .attr('x2', d => xScale(d))
            .attr('y1', 0)
            .attr('y2', 500) // Adjusted for new height
            .style('stroke', '#ccc')
            .style('stroke-width', '1px')
            .style('stroke-dasharray', 'none'); // Solid line style


        // X-axis tick labels
        g.append('g')
        .style('font-size', '16px')
        .attr('transform', `translate(0, 500)`)
        .call(d3.axisBottom(xScale)
            .ticks(10) // Adjust the number of ticks as needed
            .tickFormat(d => {
                if (d === 0) {
                    return '0'; // Always show '0' for the zero tick
                } else if (Math.abs(d) < 0.001) {
                    return ''; // Hide tick labels for values smaller than abs(0.001)
                } else {
                    return  roundToTwoSignificantFigures(d);
                }
            })
        );

        // x-axis title    
        g.append('text')
            .attr('x', svgWidth / 2 - leftMargin / 2)
            .attr('y', svgHeight-bottomMargin-25)
            .attr('text-anchor', 'middle')
            .text(xAxisTitle);
        
/*************************************************************************************
**************************************************************************************
* Create the bars
**************************************************************************************
**************************************************************************************/

        // Plot the data for the causes
        g.selectAll('.bar')
            .data(allData.filter(d => !d.isCategoryLabel))
            .enter()
            .append('rect')
            .attr('class', 'bar')
            .attr('y', d => yScale(d.causename))
            .attr('height', yScale.bandwidth())
            .attr('x', d => d[outcome] >= 0 ? xScale(0) : xScale(d[outcome]))
            .attr('width', d => Math.abs(xScale(d[outcome]) - xScale(0)))
            .style('fill', d => colorScale(d.type))
            .on('mouseover', function (event, d) {
                const key = `${d.sex}-${d.country}-${d.year}`;
                const sumForCalculation = sumByGroup[key];
                d3.select(this).style('fill', 'black');
                tooltip.style('display', 'inline')
                    .html(`${roundToTwoSignificantFigures(d[outcome])} years or<br>${roundToTwoSignificantFigures(d[outcome]/sumForCalculation * 100)}% of total`);  // roundToTwoSignificantFigures() defined in script_main.js
            })
            .on('mousemove', function (event) {
                tooltip.style('top', (event.pageY + 10) + 'px')
                    .style('left', (event.pageX + 10) + 'px');
            })
            .on('mouseout', function () {
                d3.select(this).style('fill', colorScale(this.__data__.type));
                tooltip.style('display', 'none');
            });
            
            
        // Add label for each broad set of causes inside the graph
        g.selectAll('.category-label-group')
        .data(allData.filter(d => d.isCategoryLabel))
        .enter()
        .append('g') // Create a group to hold the rect and text together
        .attr('class', 'category-label-group')
        .each(function (d) {
            const group = d3.select(this);        
            // Add background rect
            group.append('rect')
                .attr('x', 5) // Adjust position as needed
                .attr('y', yScale(d.causename) + yScale.bandwidth() / 1.4 - 15) // Adjust y position and height
                .attr('width', 200) // Set width to cover the text area
                .attr('height', 20) // Set height to match text size
                .style('fill', 'white'); // Background color
    
            // Add text on top of the rect
            group.append('text')
                .attr('class', 'category-label')
                .attr('y', yScale(d.causename) + yScale.bandwidth() / 1.2)
                .attr('x', 10) // Adjust position as needed
                .text(d => d.causename)
                .style('font-weight', 'bold')
                .style('font-size', '16px')
                .attr('text-anchor', 'start'); // Align text to the left
        });


        // Add y-axis tick label for each column    
        g.append('g').style('font-size', '16px')
        .call(d3.axisLeft(yScale).tickSize(0).tickFormat(d => {
            return allData.find(v => v.causename === d && v.isCategoryLabel) ? '' : d;
        }));

/*************************************************************************************
**************************************************************************************
* Label Figure (ie, country, year, baseline info, on top)
**************************************************************************************
**************************************************************************************/

        // year/period
        const alternativeYearLabels = {
            2000: "2000–19",
            2010: "2000–10",
            2019: "2010–19",
            2021: "2019–21"
        };
        
        // Determine the year label to use in the title
        const yearLabel = type === "alternative" && alternativeYearLabels[year]
            ? alternativeYearLabels[year] // Use the alternative label if available
            : year; // Use the original year otherwise

        // country and sex        
        g.append('text')
            .attr('x', svgWidth / 2 - leftMargin / 2)
            .attr('y', -57)
            .attr('text-anchor', 'middle')
            .style('font-size', '18px')
            .style('font-weight', 'bold')
            .text(`${country} (${sex}), ${yearLabel}`);
        
        const key = `${sex}-${country}-${year}`;
        const sumForCalculation = sumByGroup[key];

        let at;
        if (type === 'default') {
            at =':';
        } else if (type === 'alternative') {
            at=' in ' + redefineYear(year, type) + ':';
        }

        // e0
        fetchE0(country, redefineYear(year, type), sex, 'e0').then(e0 => {
            g.append('text')
                .attr('x', svgWidth / 2 - leftMargin / 2)
                .attr('y', -36)
                .attr('text-anchor', 'middle')
                .style('font-size', '18px')
                .text(`Life expectancy${at} ${e0} years`);
        });

        // total gap or change
        g.append('text')
            .attr('x', svgWidth / 2 - leftMargin / 2)
            .attr('y', -12)
            .attr('text-anchor', 'middle')
            .style('font-size', '18px')                            
            .text(`Total ${mes}: ${roundToTwoSignificantFigures(sumForCalculation)} years`);  // roundToTwoSignificantFigures() defined in script_main.js
            

/*************************************************************************************
**************************************************************************************
* Download figure
**************************************************************************************
**************************************************************************************/

        // Add button    
        chartContainer.append('button')
            .text('Download figure')
            .style('display', 'block')
            .style('margin-top', '10px auto')
            .style('margin-bottom', '20px')
            .on('click', function () {
                html2canvas(svgWrapper.node()).then(canvas => {
                    const link = document.createElement('a');
                    link.download = `${country}_${sex}_${year}_NAe0decomp.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                });
            });
    });
    });
    });
    });
}


/*************************************************************************************
**************************************************************************************
* Initial rendering and updates  
**************************************************************************************
**************************************************************************************/

    // first rendering
    updateChart();

    //
    document.addEventListener('change' || 'treeConstructed' || 'sexwasSelected' || 'countrywasSelected', function() {
        renderChart("chart-container-1");
        renderChart("chart-container-2");
        updateChart();
    });

    document.getElementById('clearSelection').addEventListener('click', function() {
        // Clear all sex checkboxes and set 'both' to checked



// Use the container ID to scope the selection to only year checkboxes
    d3.selectAll(`#${containerId}-year-checkboxes input[type="checkbox"]`).property('checked', function() {
        if (type === 'default') {
            return +this.value === 2019; // Check only the 2019 checkbox
        } else if (type === 'alternative') {
            return +this.value === 2000; // Check only the 2019 checkbox
        }
    });

        
    // Call the chart update functions to reflect the cleared selections
    renderChart("chart-container-1");
    renderChart("chart-container-2");

    if (typeof updateChart === 'function') {
        updateChart();
    }
});
});
}

renderChart("chart-container-1");
renderChart("chart-container-2");
