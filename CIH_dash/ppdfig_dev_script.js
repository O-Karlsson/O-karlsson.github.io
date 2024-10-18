
let currentData = {};  // Initialize currentData as an object to store data for each chart
let selectedYearRange= {};
let filteredData= {};

function roundToTwoSignificantFigures(num) {
    if (num === 0) return 0; // Handle zero separately
    const digits = Math.floor(Math.log10(Math.abs(num))) + 1; // Get the number of digits
    const factor = Math.pow(10, 2 - digits); // Adjust factor for rounding
    return Math.round(num * factor) / factor; // Round to two significant figures
}

// Function to load CSV and plot data
function loadAndPlotData(dataFile, dataOutcome, chartID, legendID, sliderID, yLabel) {
    d3.csv(dataFile, function(d) {

        const outcomeValue = d[dataOutcome] === "" || d[dataOutcome] === null ? null : +d[dataOutcome];

        // Dynamically rename the column to "dataOutcome"
        return {
            ...d,
            year: +d.year,  // Make sure year is a number
            dataOutcome: outcomeValue  // Rename the column based on dataOutcome and convert to a number
        };
    }).then(data => {
        filteredData[chartID] = data.filter(d => !isNaN(d.dataOutcome) && d.dataOutcome !== null );
        currentData[chartID] = filteredData[chartID];
        const { minYear, maxYear } = findAvailableYearRange(currentData[chartID], selectedCountries, selectedSex);
        initializeSlider(minYear, maxYear, sliderID, chartID);
        updateLineChart(chartID, legendID, sliderID, yLabel);  // Plot the data
    });
}

// Function to identify the minimum and maximum available year for selected countries and sex
function findAvailableYearRange(data, selectedCountries, selectedSex) {
    const countrySex = data.filter(d => 
        selectedCountries.includes(d.country) &&
        selectedSex.includes(d.sex.toLowerCase())
    );

    // Find the minimum and maximum years available for the selected filters
    const minYear = d3.min(countrySex, d => +d.year);
    const maxYear = d3.max(countrySex, d => +d.year);

    // Log the min and max years for debugging
    console.log("Min Year:", minYear, "Max Year:", maxYear);

    // Return the minimum and maximum year
    return { minYear, maxYear };
}

// Function to filter data by country and sex
function filterDataForChart(data, selectedCountries, selectedSex, sliderID) {

    if (!data || !selectedCountries || selectedCountries.length === 0 || !selectedSex || selectedSex.length === 0 || !Array.isArray(data) || data.length === 0) {
    return [];
    }
    
    return data.filter(d => 
        selectedCountries.includes(d.country) &&
        selectedSex.includes(d.sex.toLowerCase()) &&
        +d.year >= selectedYearRange[sliderID][0] && +d.year <= selectedYearRange[sliderID][1]
    );
}

// Initialize the noUiSlider for selecting year range
function initializeSlider(miny, maxy, sliderID, chartID, legendID) {
    yearSlider = document.getElementById(sliderID);
    if (!yearSlider.noUiSlider)  {
        // Create slider if it doesn't exist
        noUiSlider.create(yearSlider, {
            start: [1970, 2050],
            connect: true,
            range: {
                'min': miny,
                'max': maxy
            },
            step: 1,
            tooltips: true,
            format: {
                to: value => Math.round(value),
                from: value => Number(value)
            }
        });

        // Event listener for the year range slider
        yearSlider.noUiSlider.on('update', function (values) {
            selectedYearRange[sliderID] = values.map(value => parseInt(value));  // Convert values to integers
            updateLineChart(chartID, legendID, sliderID, yLabel);
        });
        
    } else {
        // Update slider if it already exists
        yearSlider.noUiSlider.updateOptions({
            range: {
                'min': miny,
                'max': maxy
            }
        });


    }
}


function createColorScale(countries) {
    return d3.scaleOrdinal(d3.schemeCategory10).domain(countries);
}

        // Function to create a dash style based on sex
        function getDashStyle(sex) {
            switch (sex) {
                case 'male':
                    return '10,5';   // Long dash
                case 'female':
                    return '5,2';  // Short dash
                case 'both':
                    return ''; 
                default:
                    return '';  // Solid line
            }
        }


        function getLegLab(sex) {
            switch (sex) {
                case 'male':
                    return ' (male)';   
                case 'female':
                    return ' (female)';  
                case 'both':
                    return ''; 
                default:
                    return ''; 
            }
        }

        // Create a tooltip div that is hidden by default
const tooltip = d3.select('body').append('div')
.attr('class', 'tooltip')
.style('position', 'absolute')
.style('background-color', 'white')
.style('padding', '5px')
.style('border', '1px solid #ccc')
.style('border-radius', '5px')
.style('display', 'none')
.style('pointer-events', 'none');




// Function to update the line chart based on the current data
function updateLineChart(chartID, legendID, sliderID, yLabel) {



    // Filter data based on selected countries and sexes
    const filteredData = filterDataForChart(currentData[chartID], selectedCountries, selectedSex, sliderID);

    // If no data is found after filtering, log a message and clear the chart
    if (!Array.isArray(filteredData) || filteredData.length === 0) {
        console.log("No data to plot for the selected countries and sexes.");
        d3.select(`#${chartID}`).selectAll('*').remove();  // Clear the chart
        d3.select(`#${legendID}`).selectAll('*').remove();


        d3.select(`#${chartID}`).append('text')
            .attr('x', 200)  // Adjust x-position
            .attr('y', 100)  // Adjust y-position
            .text('Make a selection')
            .attr('class', 'no-data-message');  // Optional class for styling

        return;
    }

    // Clear previous chart
    d3.select(`#${chartID}`).selectAll('*').remove();
    d3.select(`#${legendID}`).selectAll('*').remove();

    // Set up SVG dimensions and margins
    const margin = { top: 40, right: 30, bottom: 50, left: 50 }
    const width = Math.min(window.innerWidth * 0.98, 800);  // Max width of 800px or 90% of the window width
    const height = width * 0.7;  // Adjust height based on the width (aspect ratio)
    
    const svg = d3.select(`#${chartID}`)
        .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .attr('preserveAspectRatio', 'xMinYMin meet')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Set up scales
    const xScale = d3.scaleLinear()
        .domain(d3.extent(filteredData, d => +d.year))  // X-axis based on year
        .range([0, width]);

const yScale = d3.scaleLinear()
    .domain([
        d3.min(filteredData, d => d.dataOutcome) * 0.95, // Add a small margin below the min value
        d3.max(filteredData, d => d.dataOutcome) * 1.05  // Add a small margin above the max value
    ])
    .range([height, 0]);


    svg.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
        .ticks(14)
        .tickSize(-height)  // Extend grid lines to match chart height
        .tickFormat(''))  // Hide tick labels for the grid lines
        .selectAll('line')
        .style('stroke', '#ddd');  // Optional: style the grid lines

// Add Y-axis grid lines at tick marks
svg.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(yScale)
        .ticks(14)
        .tickSize(-width)  // Extend grid lines to match chart width
        .tickFormat(''))  // Hide tick labels for the grid lines
        .selectAll('line')
        .style('stroke', '#ddd');  // Optional: style the grid lines
    
        // Create axes
    svg.append('g').attr('class', 'axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(7).tickFormat(d3.format("d")))
        .selectAll('text') // Select all tick labels
        .attr('dy', '1.3em'); 
        


    svg.append('g').attr('class', 'axis')
        .call(d3.axisLeft(yScale).ticks(7))
        

        svg.select('.domain')  // Select only the axis line (not the tick marks)
        .style('stroke', 'black')  // Set the color of the axis line
        .style('stroke-width', '2px');  // Set the thickness;  // Set the thickness;  // X-axis (years)

;  // Y-axis (dataOutcome)
    svg.append('text')
        .attr('class', 'y-axis-label')  // Class to style the label
        .attr('y', -20)  // Adjust position from left
        .attr('x', -margin.left+25)  // Center the label along the y-axis
        .style('text-anchor', 'start')
        .style('font-size', '18px')  // Adjust font size
        .style('font-weight', 'bold')  // Make the label bold
        .text(yLabel);  // Dynamically set the y-axis label based on dataOutcome

    // Define line generator
    const line = d3.line()
        .x(d => xScale(+d.year))
        .y(d => yScale(+d.dataOutcome));

        

    // Group data by country and sex and plot a line for each combination
    const groupedData = d3.groups(filteredData, d => d.country, d => d.sex);
    const colorScale = createColorScale(selectedCountries);
                if (selectedYearRange[sliderID][1]>2022) {
                    const projectionYear = 2023;
                    svg.append('line')
                        .attr('x1', xScale(projectionYear))
                        .attr('x2', xScale(projectionYear))
                        .attr('y1', 0)
                        .attr('y2', height)
                        .attr('stroke', 'black')
                        .attr('stroke-width', 2)
                        .attr('stroke-dasharray', '4,4');
                    
                    // Add the "Projections" label with an arrow pointing to the right
                    svg.append('text')
                        .attr('x', xScale(projectionYear) + 5)  // Position the text slightly to the right of the line
                        .attr('y', 20)  // Position above the top of the chart
                        .attr('fill', 'black')
                        .attr('font-size', '18px')
                        .text('Projections →');
                    // Add a shaded background for the projection area (2023 to 2050)
                    const projectionStart = 2023;
                    
                    svg.append('rect')
                        .attr('x', xScale(projectionStart))
                        .attr('y', 0)
                        .attr('width', width-xScale(projectionStart))
                        .attr('height', height)
                        .attr('fill', 'gray')
                        .attr('opacity', 0.2);  // Adjust the opacity for the desired shading effect
                   
                            }


                            // Create a vertical line and hide it initially
const verticalLine = svg.append('line')
.attr('class', 'hover-line')
.attr('y1', 0)
.attr('y2', height)
.attr('stroke', 'black')
.attr('stroke-width', 1)
.attr('opacity', 0); // Initially hidden

// Create a tooltip box for showing values of all countries at the hovered year
const tooltipBox = d3.select('body').append('div')
.attr('class', 'tooltip-box')
.style('position', 'absolute')
.style('background-color', 'white')
.style('border', '1px solid black')
.style('border-radius', '5px')
.style('padding', '10px')
.style('display', 'none');

// Add an overlay rectangle for capturing mouse events
svg.append('rect')
.attr('class', 'overlay')
.attr('width', width)
.attr('height', height)
.attr('fill', 'none')
.attr('pointer-events', 'all')
.on('mousemove', handleMouseMove)
.on('mouseleave', handleMouseLeave);

// Handle mouse movement
function handleMouseMove(event) {
const mouseX = d3.pointer(event, this)[0];  // Get mouse X-coordinate relative to the chart
const year = Math.round(xScale.invert(mouseX));  // Get corresponding year

// Move the vertical line to the mouse X position
verticalLine
    .attr('x1', mouseX)
    .attr('x2', mouseX)
    .attr('opacity', 1);  // Make the line visible

// Get the values for the current year for all countries
const valuesAtYear = filteredData
    .filter(d => d.year === year)
    .map(d => ({
        country: d.country,
        sex: getLegLab(d.sex),
        value: roundToTwoSignificantFigures(d.dataOutcome)
    }));

// If there are values for the hovered year, show the tooltip with values
if (valuesAtYear.length > 0) {
    tooltipHtml = `<strong>Year: ${year}</strong><br>`;
    valuesAtYear.forEach(d => {
        tooltipHtml += `${d.country}${d.sex}: ${d.value}<br>`;
    });
    tooltipBox.html(tooltipHtml)
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY - 40}px`)
        .style('display', 'block');
}
}

// Handle mouse leave (hide vertical line and tooltip)
function handleMouseLeave() {
verticalLine.attr('opacity', 0);  // Hide the vertical line
tooltipBox.style('display', 'none');  // Hide the tooltip box
}

    groupedData.forEach(([country , sexGroups]) => {
        const color = colorScale(country);
        sexGroups.forEach(([sex, data]) => {
            // Sort data by year before plotting
            data.sort((a, b) => +a.year - +b.year);
    
                // Add a vertical line at the year 2023

            svg.append('path')
                .datum(data)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 5)
                .attr('d', line)
                .attr('stroke-dasharray', getDashStyle(sex));
    
                const legend = d3.select(`#${legendID}`);
                const legendItem = legend.append('div').attr('class', 'legend-item');
                const svgLegend = legendItem.append('svg')
                    .attr('class', 'legend-line')
                    .attr('width', 40)
                    .attr('height', 10);

                svgLegend.append('line')
                    .attr('x1', 0)
                    .attr('x2', 40)
                    .attr('y1', 5)
                    .attr('y2', 5)
                    .attr('stroke', color)
                    .attr('stroke-width', 6)
                    .attr('stroke-dasharray', getDashStyle(sex));
                    switch (sex) {
                        case 'both':
                            return legendItem.append('span').text(`${country}`); 
                        default:
                            return legendItem.append('span').text(`${country} (${sex})`);
                    }
        });
    });


}




// needs to loop through each outcome and the crosspodning idenfiers
const container = '';
const otcm = '';
const yLabel = '';



// Dynamically loop through each outcome and plot
const outcomes = [
    { chartID: 'line-chart-1', legendID: 'legend-1', sliderID: 'yearRangeSlider-1', containerClass: '.line-chart-container-1'},
    { chartID: 'line-chart-2', legendID: 'legend-2', sliderID: 'yearRangeSlider-2', containerClass: '.line-chart-container-2'},
    { chartID: 'line-chart-3', legendID: 'legend-3', sliderID: 'yearRangeSlider-3', containerClass: '.line-chart-container-3'},
    { chartID: 'line-chart-4', legendID: 'legend-4', sliderID: 'yearRangeSlider-4', containerClass: '.line-chart-container-4'}

];

outcomes.forEach(({chartID, legendID, sliderID, containerClass }) => {

    // Listen for when the tree is constructed and chart needs updating
    document.addEventListener('treeConstructed', function() {
        
        updateLineChart(chartID, legendID, sliderID, yLabel);  // Call update when tree is done constructing
    });
    
    
    // Update chart when country or sex selection changes
    document.addEventListener('change', function() {
        const { minYear, maxYear } = findAvailableYearRange(currentData[chartID], selectedCountries, selectedSex);
        initializeSlider(minYear, maxYear, sliderID, chartID);  // Update slider range based on new selection
        updateLineChart(chartID, legendID, sliderID, yLabel);
    });
    });

outcomes.forEach(({ chartID, legendID, sliderID, containerClass }) => {
    const container = document.querySelector(containerClass);
    const dta = container.getAttribute('data-file');
    const otcm = container.getAttribute('data-outcome');
    const yLabel = container.getAttribute('yaxislabel');  // Retrieve the y-axis label from the div

    loadAndPlotData(dta, otcm, chartID, legendID, sliderID, yLabel);
});
