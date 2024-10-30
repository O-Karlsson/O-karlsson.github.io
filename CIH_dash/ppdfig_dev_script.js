let currentData = {};  // Initialize currentData as an object to store data for each chart
let selectedYearRange= {};
let filteredData= {};

function getResponsiveFontSize() {
    const width = window.innerWidth;
    if (width < 400) return '14px';
    if (width < 600) return '16px';
    if (width < 800) return '20px';
    return '22px'; // Default size for larger screens
}

function roundToTwoSignificantFigures(num) {
    if (num === 0) return 0; // Handle zero separately
    const digits = Math.floor(Math.log10(Math.abs(num))) + 1; // Get the number of digits
    const factor = Math.pow(10, 2 - digits); // Adjust factor for rounding
    return Math.round(num * factor) / factor; // Round to two significant figures
}

// Function to load CSV and plot data
function loadAndPlotData(dataFile, dataOutcome, xVar, chartID, legendID, sliderID, yLabel, xLabel) {
    d3.csv(dataFile, function(d) {

        const outcomeValue = d[dataOutcome] === "" || d[dataOutcome] === null ? null : +d[dataOutcome];
        const xValue = d[xVar] === "" || d[xVar] === null ? null : +d[xVar];

        // Dynamically rename the column to "dataOutcome"
        return {
            ...d,
            xVar: xValue,  // Make sure year is a number
            dataOutcome: outcomeValue  // Rename the column based on dataOutcome and convert to a number
        };
    }).then(data => {
        filteredData[chartID] = data.filter(d => !isNaN(d.dataOutcome) && d.dataOutcome !== null );
        currentData[chartID] = filteredData[chartID];
        const { minxVar, maxxVar } = findAvailableYearRange(currentData[chartID], selectedCountries, selectedSex);
        initializeSlider(minxVar, maxxVar, sliderID, chartID, legendID, yLabel, xLabel, xVar);
        updateLineChart(chartID, legendID, sliderID, yLabel, xLabel, xVar);  // Plot the data
    });
}


// Function to identify the minimum and maximum available year for selected countries and sex
function findAvailableYearRange(data, selectedCountries, selectedSex) {
    const countrySex = data.filter(d => 
        selectedCountries.includes(d.country) &&
        selectedSex.includes(d.sex.toLowerCase())
    );

    // Find the minimum and maximum years available for the selected filters
    const minxVar = d3.min(countrySex, d => +d.xVar);
    const maxxVar = d3.max(countrySex, d => +d.xVar);

    // Return the minimum and maximum year
    return {minxVar, maxxVar};
}


// Function to filter data by country and sex
function filterDataForChart(data, selectedCountries, selectedSex, sliderID) {

    if (!data || !selectedCountries || selectedCountries.length === 0 || !selectedSex || selectedSex.length === 0 || !Array.isArray(data) || data.length === 0) {
    return [];
    }
    
    return data.filter(d => 
        selectedCountries.includes(d.country) &&
        selectedSex.includes(d.sex.toLowerCase()) &&
        +d.xVar >= selectedYearRange[sliderID][0] && +d.xVar <= selectedYearRange[sliderID][1]
    );
}

// Initialize the noUiSlider for selecting year range
function initializeSlider(miny, maxy, sliderID, chartID, legendID, yLabel, xLabel, xVar) {

    yearSlider = document.getElementById(sliderID);
    if (!yearSlider.noUiSlider)  {
        // Create slider if it doesn't exist
        if (xVar=='age') {
            strt = 70;
            end = 95;    
            }
            
            else if (xVar=='year') {
                strt = 1970;
                end = 2050;    
                }
        
        noUiSlider.create(yearSlider, {
            start: [strt, end],
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
            updateLineChart(chartID, legendID, sliderID, yLabel, xLabel, xVar);
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


function downloadAsPNG(chartID, legendID) {
    const svgElement = document.getElementById(chartID);
    const legendElement = document.getElementById(legendID);

    // Set temporary font size for PNG download
    document.querySelectorAll(`#${legendID} .legend-text`).forEach(el => {
        el.style.fontSize = '18px';  // Set desired font size for download
    });

    legendElement.style.marginLeft = '70px';  // Adjust the value as needed

    const padding = 20;  // Add padding around the chart and legend
    const svgWidth = 800;  // Set fixed width for SVG
    const svgHeight = 600; // Set fixed height for SVG

    const legendHeight = legendElement ? legendElement.offsetHeight + padding : 0;
    const canvasWidth = svgWidth + padding * 2;  // Include padding in the canvas width
    const canvasHeight = svgHeight + legendHeight + padding * 2;  // Include padding and legend height in the canvas height

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgData], { type: 'image/svg+xml' }));

    img.onload = function () {
        context.drawImage(img, padding, padding, svgWidth, svgHeight);

        if (legendElement) {
            html2canvas(legendElement, { backgroundColor: '#ffffff' }).then(function (legendCanvas) {
                context.drawImage(legendCanvas, padding, svgHeight + padding);

                // Create a link element to download the image
                const link = document.createElement('a');
                link.href = canvas.toDataURL('image/png');
                link.download = `${chartID}.png`;
                link.click();

                // Reset the font size after download
                document.querySelectorAll(`#${legendID} .legend-text`).forEach(el => {
                    el.style.fontSize = getResponsiveFontSize();  // Reset to original font size
                    legendElement.style.marginLeft = '';  // Adjust the value as needed
                });
            });
        }
        URL.revokeObjectURL(url);
    };
    img.src = url;
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
function updateLineChart(chartID, legendID, sliderID, yLabel, xLabel, xVar) {

    // Filter data based on selected countries and sexes
    const filteredData = filterDataForChart(currentData[chartID], selectedCountries, selectedSex, sliderID);
    


    // Clear previous chart
    d3.select(`#${chartID}`).selectAll('*').remove();
    d3.select(`#${legendID}`).selectAll('*').remove();

    // Set up SVG dimensions and margins
    const margin = { top: 40, right: 25, bottom: 80, left: 43 }
    const width = Math.min(window.innerWidth * 0.98, 800);  // Max width of 800px or 90% of the window width
    const height = width * 0.7;  // Adjust height based on the width (aspect ratio)
    
        // If no data is found after filtering, clear the chart
        if (!Array.isArray(filteredData) || filteredData.length === 0) {
            d3.select(`#${chartID}`).selectAll('*').remove();  // Clear the chart
            d3.select(`#${legendID}`).selectAll('*').remove();
    
            d3.select(`#${chartID}`).append('text')
                .attr('x', width/2)  // Adjust x-position
                .attr('y', height/2)  // Adjust y-position
                .text('Make a selection')
                .attr('class', 'belowname');  // Optional class for styling
    
            return;
        }


    const svg = d3.select(`#${chartID}`)
        .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .attr('preserveAspectRatio', 'xMinYMin meet')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Set up scales
    const xScale = d3.scaleLinear()
        .domain(d3.extent(filteredData, d => +d.xVar))  // X-axis based on year
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain([
            d3.min(filteredData, d => d.dataOutcome) * 0.95, // Add a small margin below the min value
            d3.max(filteredData, d => d.dataOutcome) * 1.05  // Add a small margin above the max value
        ])
        .range([height, 0]);

    // Function to create ticks and halfway points
    function createHalfwayTicks(scale, isXscale) {
        let tcks; 
    
        if (xVar === 'age' && isXscale === true) {
            minValue = d3.min(filteredData, d => d.xVar);
            maxValue = d3.max(filteredData, d => d.xVar);
            const range = maxValue - minValue;
            const interval = Math.ceil(range / 10);  // Calculate interval for approx. targetTicks
            const xstart = Math.ceil(minValue / interval) * interval;
            const xend = Math.floor(maxValue / interval) * interval;
            tcks = d3.range(xstart, xend + interval, interval);
            // Define tick values from 10 to 100 in steps of 10
        } else if (xVar === 'year' || isXscale === false) {
            tcks = 6;              // Use a default tick count of 7 for other cases
        }
    
        const ticks = Array.isArray(tcks) ? tcks : scale.ticks(tcks);  // Use predefined ticks if provided, else generate
        const halfTicks = [];
    
        for (let i = 0; i < ticks.length - 1; i++) {
            const midPoint = (ticks[i] + ticks[i + 1]) / 2;
            halfTicks.push(midPoint);  // Calculate halfway point between adjacent ticks
        }
    
        return { ticks, halfTicks };
    }
    
    // Set up x and y ticks based on the axis variable
    const { ticks: xTicks, halfTicks: xHalfTicks } = createHalfwayTicks(xScale, true);  // For age data
    const { ticks: yTicks, halfTicks: yHalfTicks } = createHalfwayTicks(yScale, false); // For year data on y-axis

    

// Add X grid lines (on ticks and halfway points)
svg.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
        .tickValues([...xTicks, ...xHalfTicks])  // Combine ticks and halfway points
        .tickSize(-height)
        .tickFormat(''))  // Hide tick labels for grid lines
    .selectAll('line')
    .style('stroke', '#ddd')

            // Create axes
svg.append('g').attr('class', 'axis-ticks') 
.attr('transform', `translate(0,${height})`)
.call(d3.axisBottom(xScale).tickValues(xTicks).tickFormat(d3.format("d"))) // Directly apply xTicks
.selectAll('text') // Select all tick labels
.attr('dy', '1.3em').style('font-size', getResponsiveFontSize()).style('font-family', 'Arial, sans-serif'); 

        

// Add Y grid lines (on ticks and halfway points)
svg.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(yScale)
        .tickValues([...yTicks, ...yHalfTicks])  // Combine ticks and halfway points
        .tickSize(-width)
        .tickFormat(''))  // Hide tick labels for grid lines
    .selectAll('line')
    .style('stroke', '#ddd')
    
    svg.append('g').attr('class', 'axis-ticks') // Adjust font size
        .call(d3.axisLeft(yScale).tickValues(yTicks)).style('font-size', getResponsiveFontSize()).style('font-family', 'Arial, sans-serif')
        

        
        svg.append('text')
        .attr('class', 'axis-label')  // Class to style the label
        .attr('y', height+75)  // Adjust position from left
        .attr('x', width/2.1)  // Center the label along the y-axis
        .style('text-anchor', 'start').style('font-size', getResponsiveFontSize()).style('font-weight', 'bold').style('font-family', 'Arial, sans-serif')
        .text(xLabel);  // Dynamically set the y-axis label based on dataOutcome


        svg.select('.domain')  // Select only the axis line (not the tick marks)
        .style('stroke', 'black')  // Set the color of the axis line
        .style('stroke-width', '2px');  // Set the thickness;  // Set the thickness;  // X-axis (years)
  // Y-axis (dataOutcome)
    svg.append('text')
        .attr('class', 'axis-label')  // Class to style the label
        .attr('y', -20)  // Adjust position from left
        .attr('x', -margin.left+25)  // Center the label along the y-axis
        .style('text-anchor', 'start').style('font-size', getResponsiveFontSize()).style('font-weight', 'bold').style('font-family', 'Arial, sans-serif')
        .text(yLabel);  // Dynamically set the y-axis label based on dataOutcome

    // Define line generator
    const line = d3.line()
        .x(d => xScale(+d.xVar))
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
                        .style('font-size', getResponsiveFontSize()).style('font-family', 'Arial, sans-serif')
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
const xVar = Math.round(xScale.invert(mouseX));  // Get corresponding year

// Move the vertical line to the mouse X position
verticalLine
    .attr('x1', mouseX)
    .attr('x2', mouseX)
    .attr('opacity', 1);  // Make the line visible

// Get the values for the current year for all countries
const valuesAtYear = filteredData
    .filter(d => d.xVar === xVar)
    .map(d => ({
        country: d.country,
        sex: getLegLab(d.sex),
        value: roundToTwoSignificantFigures(d.dataOutcome)
    }));

// If there are values for the hovered year, show the tooltip with values
if (valuesAtYear.length > 0) {
    tooltipHtml = `<strong>Year: ${xVar}</strong><br>`;
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
            data.sort((a, b) => +a.xVar - +b.xVar);
    
                // Add a vertical line at the year 2023

            svg.append('path')
                .datum(data)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 4)
                .attr('d', line)
                .attr('stroke-dasharray', getDashStyle(sex));
    
                const legend = d3.select(`#${legendID}`);
                const legendItem = legend.append('div');
                const svgLegend = legendItem.append('svg')
                    .attr('class', 'legend-line')
                    .attr('width', 40)
                    .attr('height', 10).style('margin-right', '3px');

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
                            return legendItem.append('span').attr('class', 'legend-text').style('font-size', getResponsiveFontSize()).style('font-family', 'Arial, sans-serif').style('margin-right', '25px').text(`${country}`); 
                        default:
                            return legendItem.append('span').attr('class', 'legend-text').style('font-size', getResponsiveFontSize()).style('font-family', 'Arial, sans-serif').style('margin-right', '25px').text(`${country} (${sex})`);
                    }

        });
    });


}




// needs to loop through each outcome and the crosspodning idenfiers
const container = '';
const otcm = '';
const yLabel = '';
const xLabel = '';
const xVar='';
const xvr = '';


// Dynamically loop through each outcome and plot
const outcomes = [
    { chartID: 'line-chart-1', legendID: 'legend-1', sliderID: 'yearRangeSlider-1', containerClass: '.line-chart-container-1'},
    { chartID: 'line-chart-2', legendID: 'legend-2', sliderID: 'yearRangeSlider-2', containerClass: '.line-chart-container-2'},
    { chartID: 'line-chart-3', legendID: 'legend-3', sliderID: 'yearRangeSlider-3', containerClass: '.line-chart-container-3'},
    { chartID: 'line-chart-4', legendID: 'legend-4', sliderID: 'yearRangeSlider-4', containerClass: '.line-chart-container-4'}, 
    { chartID: 'line-chart-5', legendID: 'legend-5', sliderID: 'yearRangeSlider-5', containerClass: '.line-chart-container-5'},
    { chartID: 'line-chart-6', legendID: 'legend-6', sliderID: 'yearRangeSlider-6', containerClass: '.line-chart-container-6'},
    { chartID: 'line-chart-7', legendID: 'legend-7', sliderID: 'yearRangeSlider-7', containerClass: '.line-chart-container-7'}

];

outcomes.forEach(({chartID, legendID, sliderID, containerClass }) => {


    // Update chart when country or sex selection changes
    document.addEventListener('change' || 'treeConstructed', function() {
        const { minxVar, maxxVar } = findAvailableYearRange(currentData[chartID], selectedCountries, selectedSex);
        updateLineChart(chartID, legendID, sliderID, yLabel, xLabel, xVar);
        initializeSlider(minxVar, maxxVar, sliderID, chartID, legendID, yLabel, xLabel, xVar);  // Update slider range based on new selection
    });
    });

outcomes.forEach(({ chartID, legendID, sliderID, containerClass }) => {
    const container = document.querySelector(containerClass);
    const dta = container.getAttribute('data-file');
    const otcm = container.getAttribute('data-outcome');
    const yLabel = container.getAttribute('yaxislabel');  // Retrieve the y-axis label from the div
    const xLabel = container.getAttribute('xaxislabel');  // Retrieve the y-axis label from the div
    const xvr = container.getAttribute('x-variable');  // Retrieve the y-axis label from the div

    loadAndPlotData(dta, otcm, xvr, chartID, legendID, sliderID, yLabel,xLabel);
});
