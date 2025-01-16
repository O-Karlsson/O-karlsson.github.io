/*************************************************************************************
**************************************************************************************
* Functions that filters data according to changes in selection
**************************************************************************************
*************************************************************************************/

/* filter and selectedFilters need to include the same keys
filters is an object, eg: const filters = {aim: 'sex', other: 'country', other2: xVar, outcome:yVar};
selectedFilters is eg: const selectedFilters = {aim: selectedSex, other: selectedCountries, other2: selectedX}; 
currentFilter is just whatever: currentSex/currentCountry/currentX. This can be made more flexible if needed
If xVar is a range it can be converted like this: 
currentRange= Array.from({ length: currentRangex[1] - currentRangex[0] + 1 }, (_, i) => currentRangex[0] + i);
selectedRange = Array.from({length: selectedRangex[1] - selectedRangex[0] + 1 }, (_, i) => selectedRangex[0] + i); */

function selectionFilter(fullData, currentData, filters, selectedFilters, currentFilter) {

    const removals = currentFilter.filter((c) => !selectedFilters.aim.includes(c));
    const additions = selectedFilters.aim.filter((c) => !currentFilter.includes(c));

    const rowsToAdd = fullData.filter((row) =>
        additions.includes(row[filters.aim]) &&
        selectedFilters.other.includes(row[filters.other]) &&
        selectedFilters.other2.includes(row[filters.other2]) &&
        row[filters.outcome]!==null && !isNaN(row[filters.outcome])
    );

    const rowsToRemove = currentData.filter((row) =>
        removals.includes(row[filters.aim])
    );

    currentData = currentData.filter((row) => !rowsToRemove.includes(row));
    currentData.push(...rowsToAdd);

    // Update currentFilters with selected values for each filter
    currentFilter = [...selectedFilters.aim];

    return [currentData,currentFilter];
}



/*************************************************************************************
**************************************************************************************
* Draws the year selection slider 
**************************************************************************************
*************************************************************************************/

// Gets the earliest and latest x available for each selection, for the bounds of the slider
function calculateMinMax(fullData, xVar, yVar, selectedCountries, selectedSex) {
    const tempData =fullData.filter((row) =>
        selectedCountries.includes(row.country) &&
        selectedSex.includes(row.sex) &&
        row[yVar] !== null && !isNaN(row[yVar]));
    const [minX, maxX] = d3.extent(tempData, (row) => row[xVar]);
    return { minX, maxX };
}

/* As it is, the slider is redrawn when a new figure is re-drawn. If needed, things could maybe improved by
only drawing the slider once and then just updating 'if' it has already been drawn using something like:
else {yearSlider.noUiSlider.updateOptions({range: {'min': xFullRange.minX,'max': xFullRange.maxX}});} */

// Create the slider (run the line figure is created/re-created)
function initializeSlider(fullData, currentData, containerId, xRange, xFullRange, yVar, xVar, xVarTitle, yVarTitle) {

    if (!currentData || currentData.length === 0) { return; } 
    
    const chartContainer = d3.select(`#${containerId}`);

    // Add a div for the slider (below the figure)
    chartContainer.append("div")
        .attr("id", `year-slider-${containerId}`)
        .attr("class", "line-year-slider") 

    const yearSlider = document.getElementById(`year-slider-${containerId}`);
        noUiSlider.create(yearSlider, {
        start: xRange,
        connect: true,
        range: {'min': xFullRange.minX,'max': xFullRange.maxX},
        step: 1,
        tooltips: true,
        format: {to: value => Math.round(value), from: value => Math.round(value)}}); // round, otherwise they have decimals
        
    // Attach the event listener for the slider
    yearSlider.noUiSlider.on('change', function (values) {
        const filters = {aim: xVar , other: 'country', other2: 'sex' , outcome: yVar};
        const currentX = Array.from({length: xRange[1] - xRange[0] + 1 }, (_, i) => xRange[0] + i);
        const  selectedX = Array.from({length: values[1] - values[0] + 1 }, (_, i) =>values[0] + i);
        const selectedFilters = {aim: selectedX, other: selectedCountries, other2: selectedSex}; 
        currentData = selectionFilter(fullData, currentData, filters, selectedFilters, currentX)[0]
        currentData =  currentData.sort((a, b) => a[xVar] - b[xVar]); // needs to be sorted for the figure
        lineFigure(containerId, currentData, xVar, yVar, xVarTitle, yVarTitle);
        initializeSlider(fullData, currentData, containerId, values, xFullRange, yVar, xVar, xVarTitle, yVarTitle)});
}
  
/*************************************************************************************
*************************************************************************************/


/*************************************************************************************
**************************************************************************************
* Download figure
**************************************************************************************
*************************************************************************************/

function downloadAsPNG(containerId) {
    const chartSVG = document.getElementById(`theChart-${containerId}`);
    const legendSVG = document.getElementById(`theLegend-${containerId}`);

    // Create canvas to accommodate both SVG elements
    const chartRect = chartSVG.getBoundingClientRect();
    const legendRect = legendSVG.getBoundingClientRect();

    const padding = 20; // Padding around the content
    const totalWidth = Math.max(chartRect.width, legendRect.width) + padding * 2;
    const totalHeight = chartRect.height + legendRect.height + padding * 3; // Extra padding for spacing between chart and legend

    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, totalWidth, totalHeight);

    // Function to render SVG onto canvas
    const renderSVG = (svg, yPos) => {
        return new Promise(resolve => {
            const xml = new XMLSerializer().serializeToString(svg);
            const img = new Image();
            const blob = new Blob([xml], {type: 'image/svg+xml'});
            const url = URL.createObjectURL(blob);

            img.onload = function() {
                context.drawImage(img, padding, yPos, svg.getBoundingClientRect().width, svg.getBoundingClientRect().height);
                URL.revokeObjectURL(url);
                resolve();
            };
            img.src = url;
        });
    };

    // Render both SVGs onto the canvas
    renderSVG(chartSVG, padding)
        .then(() => renderSVG(legendSVG, chartRect.height + padding * 2))
        .then(() => {
            // Create a link for the download
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

/* As it is, the figure is re-drawn every time a new selection is made. If needed, things 
maybe improved by updating some parts according to new selections */

function lineFigure(containerId, filteredData, xVar, yVar, xVarTitle, yVarTitle) {

    // remove existing graph (also removes slider)
    d3.select(`#${containerId}`).selectAll('*').remove();


/*************************************************************************************
* Message if there is no data
*************************************************************************************/

        d3.select(`#${containerId}-selectDataMsg`).remove();
        if (filteredData.length === 0) {

            let whatToSelect = '';
            if (selectedCountries.length === 0) {whatToSelect += 'location';}
            if (selectedSex.length === 0) {whatToSelect += (whatToSelect.length > 0 ? ' and ' : '') + 'sex';}
            const message = `Select ${whatToSelect}`;

            // Add a message container
            d3.select(`#${containerId}`)
                .append('div')
                .attr('id', `${containerId}-selectDataMsg`) // ID for the message container
                .attr('class', 'no-data-message-box')
                .append('p')
                .attr('class', 'no-data-message-text')
                .text(message);

            return; // Exit the function early since there's no data to display
        }

    
    // Set up SVG dimensions and margins for the graph (before the legend)
    const margin = { top: 40, right: 25, bottom: 80, left: 43 }
    const width = Math.min(window.innerWidth-60, 600); 
    const height = width * 0.7; 
    
    const svg = d3.select(`#${containerId}`)
        .append("svg")
        .attr("id", `theChart-${containerId}`)
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .style('font-family', 'Arial, sans-serif')
        .append("g") // separates the main charting area from the rest of the <svg> content
        .attr("transform", `translate(${margin.left}, ${margin.top})`);


/*************************************************************************************
* Drawing the axes, grid, and shaded area
*************************************************************************************/

    // Create scales with a range of the filtered data
    const xScale = d3.scaleLinear()
        .domain(d3.extent(filteredData, d => d[xVar]))
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain(d3.extent(filteredData, d =>d[yVar]))
        .range([height, 0]);

    // Function to create ticks and halfway points for the grid
    function createHalfwayTicks(scale, ts) { 
        const ticks = scale.ticks(ts);
        const halfTicks = [];
            for (let i = 0; i < ticks.length - 1; i++) {
            const midPoint = (ticks[i] + ticks[i + 1]) / 2;
            halfTicks.push(midPoint);  // Calculate halfway point between adjacent ticks
        }
        return { ticks, halfTicks };
    }

    const {ticks: xTicks, halfTicks: xHalfTicks} = createHalfwayTicks(xScale, 6); 
    const {ticks: yTicks, halfTicks: yHalfTicks} = createHalfwayTicks(yScale, 10); 

    // Draw the axes
    svg.append("g")
        .attr("transform", `translate(0, ${height})`)
        .call(d3.axisBottom(xScale)
        .tickValues([...xTicks]) // if I don't define the mid-lines are sometimes missing (no need on the y axis)
        .tickFormat(d3.format("d"))) // no '000 separators 
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    svg.append("g")
        .attr("transform", `translate(0, 0)`)
        .call(d3.axisLeft(yScale))
        .style('font-size', `${Math.max(12, width * 0.025)}px`);

    // Add additional halfway tick if missing on bottom or top
    const [minxVar, maxxVar] = d3.extent(filteredData, item => item[xVar]);
    if (xHalfTicks[0]>xTicks[0] && minxVar<=xTicks[0]-(xHalfTicks[0]-xTicks[0])) {xHalfTicks.unshift(xTicks[0]-(xHalfTicks[0]-xTicks[0]));}
    if (xHalfTicks.at(-1)<xTicks.at(-1) && maxxVar>=xTicks.at(-1)+(xTicks.at(-1)-xHalfTicks.at(-1))) {xHalfTicks.push(xTicks.at(-1)+(xTicks.at(-1)-xHalfTicks.at(-1)));}

    const [minyVar, maxyVar] = d3.extent(filteredData, item => item[yVar]);
    if (yHalfTicks[0]>yTicks[0] && minyVar<=yTicks[0]-(yHalfTicks[0]-yTicks[0])) {yHalfTicks.unshift(yTicks[0]-(yHalfTicks[0]-yTicks[0]));}
    if (yHalfTicks.at(-1)<yTicks.at(-1) && maxyVar>=yTicks.at(-1)+(yTicks.at(-1)-yHalfTicks.at(-1))) {yHalfTicks.push(yTicks.at(-1)+(yTicks.at(-1)-yHalfTicks.at(-1)));}

    // Add grid lines (at ticks and halfway points)
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale)
            .tickValues([...xTicks, ...xHalfTicks])
            .tickSize(-height) // these are really just very long ticks
            .tickFormat(''))  // Hide tick labels
        .selectAll('line')
        .style('stroke', '#ddd')

    svg.append('g')
        .call(d3.axisLeft(yScale)
        .tickValues([...yTicks, ...yHalfTicks])
        .tickSize(-width) // these are really just very long ticks
        .tickFormat(''))  // Hide tick labels
        .selectAll('line')
        .style('stroke', '#ddd')
        
    // Add axes titles (this might be reversed)
    svg.append('text')
        .attr('y', height*1.15)
        .attr('x', width/2.1)
        .text(yVarTitle)
        .style('font-size', `${Math.max(12, width * 0.025)}px`);


    svg.append('text')
        .attr('y', -20)
        .attr('x', -margin.left+25)
        .text(xVarTitle)
        .style('font-size', `${Math.max(12, width * 0.025)}px`);


    // Put label and gray shade on the projected part of the graph
    const projectionYear = 2023;
    if (maxxVar>=projectionYear) {

        svg.append('text')
            .attr('x', xScale(projectionYear) + 5)
            .attr('y', 20)
            .attr('fill', 'black')
            .text('Projections →')
            .style('font-size', `${Math.max(12, width * 0.025)}px`);

        svg.append('rect')
            .attr('x', xScale(projectionYear))
            .attr('y', 0)
            .attr('width', width-xScale(projectionYear))
            .attr('height', height)
            .attr('fill', 'gray')
            .attr('opacity', 0.15);        
    }



/*************************************************************************************
* Drawing the lines on the chart
*************************************************************************************/

// Group data by country and sex
const groupedData = d3.group(filteredData, d => d.country, d => d.sex);

// Line generator
const line = d3.line().x(d => xScale(d[xVar])).y(d => yScale(d[yVar]));

// Color scale for countries
const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(selectedCountries);

// Flatten grouped data into an array for easier binding
const flattenedData = Array.from(groupedData.entries()).flatMap(([country, sexGroups]) =>
    Array.from(sexGroups.entries()).map(([sex, dataPoints]) => ({
        country,
        sex,
        dataPoints,
        color: colorScale(country),  // color by country
        dashArray: sex === 'male' ? '10,5' : sex === 'female' ? '5,2' : '', // solid/dash line by sex
        sLabel: sex === 'male' ? ' (male)' : sex === 'female' ? ' (female)' : ''  // no sLabel for both
    }))
);

// Batch append paths to SVG
svg.selectAll(".line-path")
    .data(flattenedData)
    .enter()
    .append("path")
    .attr("class", "line-path")
    .attr("d", d => line(d.dataPoints)) // Generate line path
    .attr("fill", "none")
    .attr("stroke", d => d.color) // color by country
    .attr("stroke-width", 2.7)
    .attr("stroke-dasharray", d => d.dashArray); // solid/dash by sex


/*************************************************************************************
* Drawing the legend
*************************************************************************************/

/* Drawing an html legend is simpler but an all-svg legend makes it easier to download. */

// Initial setup for SVG container
const padding = 15; // Padding around items
const itemHeight = 30; // Height of each legend row
const containerWidth = Math.min(window.innerWidth, 600); 
; // Total width of the SVG container

const legendSvg = d3.select(`#${containerId}`)
    .append('svg')
    .attr("id", `theLegend-${containerId}`)
    .attr('width', containerWidth);

// Function to calculate row and column positions
let currentX = 0, currentY = 0;
const positions = flattenedData.map((d, i) => {
    const text = `${d.country}${d.sLabel}`;
    const textLength = text.length * 10 + 60; // Approximate text length (adjust according to font size) + marker width
    if (currentX + textLength > containerWidth) { // Check if it exceeds the row width
        currentX = 0; // Reset to start of next row
        currentY += itemHeight; // Move down to next row
    }
    const pos = { x: currentX, y: currentY }; // Current item position
    currentX += textLength + padding; // Update x to next item's start
    return pos;
});

// Set the height of the SVG based on number of rows filled
legendSvg.attr('height', currentY + itemHeight+20);

// Create legend entries
const legendEntries = legendSvg.selectAll(".legend-entry")
    .data(flattenedData)
    .enter()
    .append("g")
    .attr("class", "legend-entry")
    .attr("transform", (d, i) => `translate(${positions[i].x}, ${positions[i].y})`);

// Add line markers to the legend entries
legendEntries.append("line")
    .attr("x1", 0)
    .attr("x2", 40)
    .attr("y1", itemHeight / 2)
    .attr("y2", itemHeight / 2)
    .attr("stroke", d => d.color)
    .attr("stroke-width", 6)
    .attr("stroke-dasharray", d => d.dashArray);

// Add text to the legend entries
legendEntries.append("text")
    .attr("x", 50)
    .attr("y", itemHeight / 2 + 4)
    .text(d => `${d.country}${d.sLabel}`)
    .attr("font-family", "Arial")
    .style('font-size', `${Math.max(14, width * 0.028)}px`)
    .attr("alignment-baseline", "middle");



/*************************************************************************************
* Making the hover info
**************************************************************************************/

    // Create a vertical line
    const verticalLine = svg.append('line')
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', 'black')
        .attr('stroke-width', 1)
        .attr('opacity', 0); // Initially hidden

    // Create a tooltip box for showing values of all countries at the hovered year
    const tooltipBox = d3.select('body').append('div')
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid black')
        .style('border-radius', '5px')
        .style('padding', '10px')
        .style('display', 'none');

    // Add an overlay rectangle for capturing mouse events
    svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
        .on('mousemove', handleMouseMove)
        .on('mouseleave', handleMouseLeave);

// Handle mouse movement
function handleMouseMove(event) {
    const mouseX = d3.pointer(event, this)[0];  // Get mouse X-coordinate relative to the chart
    const xPoint = Math.round(xScale.invert(mouseX));  // Get corresponding year/age

    // Move the vertical line to the mouse X position
    verticalLine
        .attr('x1', mouseX)
        .attr('x2', mouseX)
        .attr('opacity', 1);  // Make the line visible

    // Get the values for the current year for all countries/sex displayed
    const valuesAtYear = filteredData
        .filter(d => Math.abs(d[xVar] - xPoint)<1)
        .map(d => ({
            country: d.country,
            sex: d.sex,
            value: roundToTwoSignificantFigures(d[yVar]) // roundToTwoSignificantFigures() defined in script_main.js
        }));

    // Create the tooltip content
    let tooltipHtml = `<strong>Year: ${xPoint}</strong><br>`;
    valuesAtYear.forEach(d => {
        if (d.sex !== 'both') {tooltipHtml += `${d.country} (${d.sex}): ${d.value}<br>`;} 
        else { tooltipHtml += `${d.country}: ${d.value}<br>`; }
    });

    // Reposition and update the tooltip
    tooltipBox
        .html(tooltipHtml)
        .style('left', `${event.pageX-80 }px`)
        .style('top', `${event.pageY-140}px`)
        .style('display', 'block');
}

// Handle mouse leave
function handleMouseLeave() {
    verticalLine.attr('opacity', 0);  // Hide the vertical line
    tooltipBox.style('display', 'none');  // Hide the tooltip box
}


/*************************************************************************************
* Download Figure button
*************************************************************************************/

    // Add button
    const chartContainer = d3.select(`#${containerId}`);
    chartContainer.append("button")
        .attr("onclick", `downloadAsPNG('${containerId}')`) // function above
        .text("Download figure");
    }
 

/*************************************************************************************
**************************************************************************************
* Dynamically loop through each outcome and plot
**************************************************************************************
*************************************************************************************/

function drawLineFigures(containerId) {

     // Get the container element by ID and the associated parameters from the html
    const container = document.getElementById(containerId);
    const dataFile = container.getAttribute('data-file');
    const yVar = container.getAttribute('y-var');
    const xVar = container.getAttribute('x-var');
    const xVarTitle = container.getAttribute('y-title');
    const yVarTitle = container.getAttribute('x-title');
    
    // these will be updated. xRange here is the default range on the x-axis. 
    let xRange = JSON.parse(container.getAttribute('x-range')); // Parse the string into an array 

    /* xFullRange will hold the full range of available values on the x-axis. It is updated when 
    new countries are selected. currentData will hold the sub-dataset for each line figure. */
    let currentData, xFullRange;
    
    /* Start with the default selections. The selectedSex and selectedCountries
    are defined in the selection js file: script_selections.js  */

    let currentCountries=[...selectedCountries];
    let currentSex=[...selectedSex];

    (async function () {

        // load full data if not already loaded
        fullData[dataFile]=[];
        await loadFullData(dataFile);    // function in the main js

        // filter data for each line figure (first according to default selections)
        currentData = fullData[dataFile].filter((row) =>
            selectedCountries.includes(row.country) &&
            selectedSex.includes(row.sex) &&
            row[xVar] >= xRange[0] &&
            row[xVar] <= xRange[1] &&
            row[yVar]!==null && !isNaN(row[yVar])
        );
        
        // Get the range for the slider (function above)
        xFullRange = calculateMinMax(fullData[dataFile], xVar, yVar, selectedCountries, selectedSex);
        // draw the figure
        lineFigure(containerId, currentData, xVar, yVar, xVarTitle, yVarTitle);
        // Draw the x-range slider below the figure. The event listener is inside initializeSlider().
        initializeSlider(fullData[dataFile], currentData, containerId, xRange, xFullRange,yVar, xVar, xVarTitle, yVarTitle)
    })();

/*************************************************************************************
* Event listeners for changes in selections
**************************************************************************************/

/* countrywasSelected and sexwasSelected events are defined in the selection js.The updates and event listeners for the slider are inside initializeSlider().
filters and selectedFilters need to include the same keys. 'aim' is the variable according to which the data is being filtered (new selection).

filters is an object, eg: const filters = {aim: 'sex', other: 'country', other2: xVar, outcome:yVar};
selectedFilters is eg: const selectedFilters = {aim: selectedSex, other: selectedCountries, other2: selectedX}; 
currentFilter is just whatever: currentSex/currentCountry/currentX. This can be made more flexible if needed

If xVar is a range it can be converted like this: 
currentRange= Array.from({ length: currentRangex[1] - currentRangex[0] + 1 }, (_, i) => currentRangex[0] + i);
selectedRange = Array.from({length: selectedRangex[1] - selectedRangex[0] + 1 }, (_, i) => selectedRangex[0] + i); */

/* event listeners as functions so they are easier to remove when a heading is collapsed */
   function countrySelected() {
        const filters = {aim: 'country', other: 'sex', other2: xVar, outcome: yVar};
        const  selectedX = Array.from({length: xRange[1] - xRange[0] + 1 }, (_, i) => xRange[0] + i);
        const selectedFilters = {aim: selectedCountries, other: selectedSex, other2: selectedX}; 
        [currentData, currentCountries] = selectionFilter(fullData[dataFile], currentData, filters, selectedFilters, currentCountries)
        xFullRange = calculateMinMax(fullData[dataFile], xVar, yVar, selectedCountries, selectedSex);
        lineFigure(containerId, currentData, xVar, yVar, xVarTitle, yVarTitle);
        initializeSlider(fullData[dataFile], currentData, containerId, xRange, xFullRange, yVar, xVar, xVarTitle, yVarTitle);}

    function sexSelected() {
        const filters = {aim: 'sex', other: 'country', other2: xVar, outcome: yVar};
        const  selectedX = Array.from({length: xRange[1] - xRange[0] + 1 }, (_, i) => xRange[0] + i);
        const selectedFilters = {aim: selectedSex, other: selectedCountries, other2: selectedX}; 
        [currentData, currentSex] = selectionFilter(fullData[dataFile], currentData, filters, selectedFilters, currentSex)
        // As it is, there's no change in range across sex so no need to update the slider
        lineFigure(containerId, currentData, xVar, yVar, xVarTitle, yVarTitle);}

    document.addEventListener(`countrywasSelected-${containerId}`,countrySelected);
    document.addEventListener(`sexwasSelected-${containerId}`, sexSelected);

    // event comes from the main js
    document.addEventListener(`${containerId}-collapsed` , function () {                  
        document.removeEventListener(`countrywasSelected-${containerId}`,countrySelected);
        document.removeEventListener(`sexwasSelected-${containerId}`, sexSelected);});
}
