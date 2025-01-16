/*************************************************************************************
**************************************************************************************
* Make figure
**************************************************************************************
*************************************************************************************/

function renderChart(fullData, containerId2, country, sex, year, yVar, metric, detail) { 
      
/*************************************************************************************
* Filter data according to selection
**************************************************************************************/

        // Filter data by primary selections (country, year, and sex)
        const primaryfilteredData = fullData.filter(d =>
            d.sex === sex &&
            d.country === country &&
            d.year === year &&
            d.detail !== detail 
        );

        // get life expectancy and total gap for info on top of figure
        const broadCauseData = primaryfilteredData.filter(d => d.causename === "Total");
        const totalDifference = d3.sum(broadCauseData, d => +d[yVar]);
        const e0Data = primaryfilteredData.filter(d => d.causename === "THE E0");
        const e0 = e0Data.length > 0 && e0Data[0][yVar] !== undefined
            ? Math.round(e0Data[0][yVar] * 10) / 10
            : null;        
        
        // Filter out "Total" (which show total impact of the broader sets) and "THE E0" observations from the main dataset              
        const filteredData = primaryfilteredData.filter(d => d.causename !== "Total" && d.causename !== "THE E0" && d[yVar] !== null);
    
        
/*************************************************************************************
* Create the container
**************************************************************************************/
         
const chartContainer = d3.select(`#${containerId2}-the-graphs`)
    .insert('div', ':first-child')
    .attr('id', `${containerId2}-${country}-${sex}-${year}`.replace(/\s+/g, '')); // Remove spaces in the ID

/*************************************************************************************
* Message in case there's no data to plot
**************************************************************************************/

    if (filteredData.length === 0) {
        let msgText, msgTextId;

        if (metric === 'gap' && e0 !== null) { 
            const NAe0 = fullData.filter(d => // get e0 for the North Atlantic
                    d.causename === "THE E0" &&
                    d.sex === sex &&
                    d.country === 'North Atlantic' &&
                    d.year === 2019
                )[0][yVar];

            if (e0 - NAe0 >= -1) { // only cases with a gap more than one year are plotted
                msgText = `No results for ${country} (${sex}) in ${year} because its life expectancy was less than one year lower than in the benchmark (the North Atlantic (${sex}) in 2019; see Note above).`;
                msgTextId = `${containerId2}-${country}-${sex}-${year}-tooHigh`.replace(/\s+/g, '');
            } else {
                msgText = `No data for ${country}`;
                msgTextId = `${containerId2}-${country}-noData`.replace(/\s+/g, '');
            }
        } else if (metric === 'change' || (metric === 'gap' && e0 === null)) {
            msgText = `No data for ${country}`;
            msgTextId = `${containerId2}-${country}-noData`.replace(/\s+/g, '');
        }

        // Check if the message box already exists
        const existingMessage = chartContainer.select(`#${msgTextId}`);
        if (!existingMessage.empty()) {
            return; // Exit early since the message already exists
        }

        // Add a message container
        chartContainer
            .append('div')
            .attr('id', msgTextId)
            .attr('class', 'no-data-message-box')
            .append('p')
            .attr('class', 'no-data-message-text')
            .text(msgText);

        return; // Exit the function early since there's no data to display
    }
    

/*************************************************************************************
* Size of the container
**************************************************************************************/

        const svgWrapper = chartContainer.append('div')
            .attr('id', `${containerId2}-graph`)
            .style('position', 'relative')
            .style('display', 'inline-block')
            .style('max-width', '700px')
            .style('width', '100%');


        const variableHeight = (detail === 1 ? 480 : 700) // depending on number of causes defined in 'detail'
        const topMargin = 80; 
        const bottomMargin = 20;
        const svgWidth = 700;
        const svgHeight = variableHeight + topMargin + bottomMargin;

        const svg = svgWrapper.append('svg')
            .attr('width', '100%')
            .style('height', 'auto')
            .attr('viewBox', `0 0 ${svgWidth} ${svgHeight+ 50}`)
            .attr('preserveAspectRatio', 'xMinYMin meet');

        // Calculate the maximum label width for dynamic margin adjustment
        const longestLabel = Math.max(...filteredData.map(d => d.causename.length));

        // Approximate character width in pixels (adjust according to font-size)
        const estimatedLabelWidth = longestLabel * 8.2; 
        const leftMargin = Math.max(estimatedLabelWidth, 150);

        // this positions groups <g> within the svg canvas. transform moves the group by x, y
        const g = svg.append('g')
            .attr('transform', `translate(${leftMargin}, ${topMargin})`); 

            
/*************************************************************************************
* Structure the data for bar charts
**************************************************************************************/

        // these are the broad categories. The data from these won't be plotted (these are filtered out above) but the labels are used
        const mainCategories = {
            "NCD7 priority conditions": [],
            "I8 priority conditions": [],
            "All other causes (top 5 out of 117)": []
        };

        // add the elements to the end of the appropriate array
        filteredData.forEach(d => {
            d[yVar] = +d[yVar];
            if (d.type === "NCD7 priority conditions") {
                mainCategories["NCD7 priority conditions"].push(d); 
            } else if (d.type === "I8 priority conditions") {
                mainCategories["I8 priority conditions"].push(d);
            } else {
                mainCategories["All other causes (top 5 out of 117)"].push(d);
            }
        });

        /* Object.keys() gets all the keys and then loops through them and sorts
        outcome within each of the categories (so the bars go from greatest to 
        smallest impact within each of the three broader sets of causes) */ 
        Object.keys(mainCategories).forEach(key => {
            mainCategories[key].sort((a, b) => b[yVar] - a[yVar]);
        });

        /* Creating a data structure for plotting */
        let allData = [];
        Object.keys(mainCategories).forEach(key => {
            allData.push({causename: key, isCategoryLabel: true }); // isCategoryLabel identifies the row as main category
            allData = allData.concat(mainCategories[key]); // the data to be plotted (combining arrays)
        });


/*************************************************************************************
* Create axes, grid lines, tick labels
**************************************************************************************/

        // The min and max outcome for the x-scale range
        const minValue = d3.min(allData.filter(d => !d.isCategoryLabel), d => +d[yVar]);
        const maxValue = d3.max(allData.filter(d => !d.isCategoryLabel), d => +d[yVar]);

        const xScale = d3.scaleLinear()
            .domain([minValue < 0 ? minValue : 0, maxValue]) 
            .range([0, svgWidth - leftMargin - 50]);

        const yScale = d3.scaleBand()
            .domain(allData.map(d => d.causename))
            .range([0, variableHeight])
            .paddingInner(0.1)
            .paddingOuter(0.1);

        // Set different colored bars according to the broader sets of causes        
        const colorScale = d3.scaleOrdinal()
            .domain(Object.keys(mainCategories))
            .range(['#76bee8', '#e8a876', '#b0b0b0']);

        // Create grid lines    
        const ticks = xScale.ticks();
        
        // Create halfway grid-lines
        const halfwayTicks = ticks.map((d, i, arr) => {
            if (i < arr.length - 1) {
                return (d + arr[i + 1]) / 2;
            }
        }).filter(d => d !== undefined);

        // Add additional halfway tick if missing at bottom or top
        const [minyVar, maxyVar] = d3.extent(filteredData, item => item[yVar]);
        if (halfwayTicks[0]>ticks[0] && minyVar<=ticks[0]-(halfwayTicks[0]-ticks[0])) { 
            halfwayTicks.unshift(ticks[0]-(halfwayTicks[0]-ticks[0]));}

        if (halfwayTicks.at(-1)<ticks.at(-1) && maxyVar>=ticks.at(-1)+(ticks.at(-1)-halfwayTicks.at(-1))) { 
            halfwayTicks.push(ticks.at(-1)+(ticks.at(-1)-halfwayTicks.at(-1)));}
                
        g.selectAll('.halfway-grid')
            .data([...ticks, ...halfwayTicks])
            .enter()
            .append('line')
            .attr('x1', d => xScale(d))
            .attr('x2', d => xScale(d))
            .attr('y1', 0)
            .attr('y2', variableHeight) // Adjusted for new height
            .style('stroke', '#ccc')
            .style('stroke-width', '1px')
            .style('stroke-dasharray', 'none'); // Solid line style

        // X-axis tick labels
        g.append('g')
        .style('font-size', `${Math.max(12, svgWidth * 0.021)}px`) 
        .attr('transform', `translate(0, ${variableHeight})`)
        .call(d3.axisBottom(xScale)
            .ticks(10) // Adjust the number of ticks as needed
            .tickFormat(d => {
                if (d === 0) {
                    return '0'; // Always show '0' for the zero tick
                } else if (Math.abs(d) < 0.001) {
                    return ''; // Hide tick labels for values smaller than abs(0.001)
                } else {
                    return roundToTwoSignificantFigures(d); // this function is in the main js file
                }
            })
        );

        // x-axis title    
        g.append('text')
            .attr('x', svgWidth / 2 - leftMargin / 2)
            .attr('y', svgHeight-bottomMargin-25)
            .attr('text-anchor', 'middle')
            .style('font-size', `${Math.max(12, svgWidth * 0.023)}px`) 
            .text(`Life expectancy ${metric} accounted for, years`);
        

/*************************************************************************************
* Create the bars
**************************************************************************************/
        
        // Plot the data for the causes
        g.selectAll('.bar')
            .data(allData.filter(d => !d.isCategoryLabel))
            .enter()
            .append('rect')
            .attr('y', d => yScale(d.causename))
            .attr('height', yScale.bandwidth())
            .attr('x', d => d[yVar] >= 0 ? xScale(0) : xScale(d[yVar]))
            .attr('width', d => Math.abs(xScale(d[yVar]) - xScale(0)))
            .style('fill', d => colorScale(d.type))
            .on('mouseover', function (event, d) { // hover/touch info
                d3.select(this).style('fill', 'black');
                tooltip.style('display', 'inline')
                    .html(`${roundToTwoSignificantFigures(d[yVar])} years or<br>${roundToTwoSignificantFigures(d[yVar]/totalDifference * 100)}% of total`);  // roundToTwoSignificantFigures() defined in script_main.js
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
        .each(function (d) {
            const group = d3.select(this); 
            // Add background rect
            group.append('rect')
                .attr('x', 5)
                .attr('y', yScale(d.causename) + yScale.bandwidth() / 1.4 - 15)
                .attr('width', 200) // Set width to cover the text area
                .attr('height', 20) // Set height to match text size
                .style('fill', 'white'); // Color behind text
    
            // Add text on top of the rect
            group.append('text')
                .attr('y', yScale(d.causename) + yScale.bandwidth() / 1.2)
                .attr('x', 10)
                .text(d => d.causename)
                .style('font-weight', 'bold')
                .style('font-size', `${Math.max(12, svgWidth * 0.021)}px`) 
                .attr('text-anchor', 'start'); // Align text to the left
        });


        // Add y-axis tick label for each column   
        g.append('g').style('font-size', `${Math.max(12, svgWidth * 0.021)}px`) 
        .call(d3.axisLeft(yScale).tickSize(0).tickFormat(d => {
            return allData.find(v => v.causename === d && v.isCategoryLabel) ? '' : d;
        }));


/*************************************************************************************
* Label Figure (ie, country, year, baseline info, on top)
**************************************************************************************/

        // year/period
        const alternativeYearLabels = {2000: "2000–19", 2010: "2000–10", 2019: "2010–19", 2021: "2019–21"};
        
        // Determine the year label to use in the title
        const yearLabel = metric === "change" && alternativeYearLabels[year]
            ? alternativeYearLabels[year] // Use the alternative label if available for the change metric
            : year; // Use the original year otherwise

        let sexLabel=''; // no sex label in parentheses for both
        if (sex!=='both') {sexLabel = ` (${sex})`;}

        // country and sex labels      
        g.append('text')
            .attr('x', svgWidth / 2 - leftMargin / 2)
            .attr('y', -57)
            .attr('text-anchor', 'middle')
            .style('font-size', `${Math.max(12, svgWidth * 0.023)}px`) 
            .style('font-weight', 'bold')
            .text(`${country}${sexLabel}, ${yearLabel}`);
        
        let at; // 'at' is for the life expectancy info at top: for 'gap' it's le in the target; for 'change' it's le at baseline (eg, in 2000)
        if (metric === 'gap') {
            at =':';
        } else if (metric === 'change') {
            at=' in ' + yearLabel.substring(0, 4) + ':';
        }

        // e0 info on top
        g.append('text')
            .attr('x', svgWidth / 2 - leftMargin / 2)
            .attr('y', -36)
            .attr('text-anchor', 'middle')
            .style('font-size', `${Math.max(12, svgWidth * 0.023)}px`) 
            .text(`Life expectancy${at} ${e0} years`);

        // total gap or change on top
        g.append('text')
            .attr('x', svgWidth / 2 - leftMargin / 2)
            .attr('y', -12)
            .attr('text-anchor', 'middle')
            .style('font-size', `${Math.max(12, svgWidth * 0.023)}px`)                           
            .text(`Total ${metric}: ${roundToTwoSignificantFigures(totalDifference)} years`);  // roundToTwoSignificantFigures() defined in script_main.js
            
/*************************************************************************************
* Making the hover info
**************************************************************************************/

        const tooltip = d3.select(`#${containerId2}`)
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
* Download figure
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
                    link.download = `${country}_${sex}_${year}_${yVar}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                });
            });
    }


/*************************************************************************************
**************************************************************************************
* Dynamically loop through each outcome and plot
**************************************************************************************
*************************************************************************************/


function renderDecompFigures(containerId2) {

     // Get the container element by ID and the associated parameters from the html
    const container = document.getElementById(containerId2);
    const datasetFile = container.getAttribute('dataset');
    let yVar = container.getAttribute('outcome');
    const metric = container.getAttribute('x-metric');

   
/*************************************************************************************
**************************************************************************************
* Add year/period selections
**************************************************************************************
*************************************************************************************/

    // insert the year selection checkboxes and get the values
    let selectedYears = [2000]; // Default selected years for 'change' metric (changed below in case the metric is 'gap')        
    let yearLabels = {2000: "2000–19", 2010: "2000–10", 2019: "2010–19", 2021: "2019–21"};

    /* Comparison to the North Atlantic is the 'gap'. This adds a checkbox which
    switches between the outcomes: one where negative values were removed and one where
    they are not. Also the 'year' variable means different things across 'metrics' */
    if (metric === 'gap') {
        
        // Select the chart container and append the checkbox at the top within it
        const checkboxContainer = d3.select(`#${containerId2}`)
            .insert('div', ':first-child') // Insert at the top of the container
            .style('display', 'flex')
            .style('justify-content', 'flex-start')
            .style('align-items', 'center')
            .style('margin-bottom', '10px');
    
        // Add checkbox for removing negative values
        checkboxContainer.append('input')
            .attr('type', 'checkbox')
            .property('checked', true)
            .attr('id', `${containerId2}-checkbox`)
            .on('change', function() {document.dispatchEvent(new Event(`changeOutcome-${containerId2}`));}); // dispatch event (processed below)

        checkboxContainer.append('label')
            .attr('for', `${containerId2}-checkbox`) // 'for' associates label with checkbox (d3)
            .text('Remove negative values (ie, impact of causes for which mortality was greater in the North Atlantic)')
            .style('font-size', '16px')
            .style('margin-left', '5px');
                    
        selectedYears = [2019]; // Default selected years for 'gap' metric
        yearLabels = {2000: "2000", 2010: "2010", 2019: "2019", 2021: "2021"};
    } 
                
    // Append a checkbox for showing more detailed causes
    const checkboxContainerDetail = d3.select(`#${containerId2}`)
        .insert('div', ':first-child')
        .style('display', 'flex')
        .style('justify-content', 'flex-start')
        .style('align-items', 'center')
        .style('margin-bottom', '10px');

    checkboxContainerDetail.append('input')
        .attr('type', 'checkbox')
        .property('checked', false)
        .attr('id', `${containerId2}-checkbox-detail`)
        .on('change', function() {document.dispatchEvent(new Event(`changeDetail-${containerId2}`));}); // processed below

    checkboxContainerDetail.append('label')
        .attr('for', `${containerId2}-checkbox-detail`) // 'for' associates label with checkbox (d3)
        .text('Show more detailed causes')
        .style('font-size', '16px')
        .style('margin-left', '5px');  
        
    // Checkboxes for year selection
    const yearOptions = [2000, 2010, 2019, 2021];
    d3.select(`#${containerId2}`)
        .append('div')
        .attr('id', `${containerId2}-year-checkboxes`)
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
            d3.select(this) // 'this' refers to current execution context
                .append('input')
                .attr('type', 'checkbox')
                .attr('value', d)
                .property('checked', selectedYears.includes(d))
                .on('change', function () {
                    selectedYears.length = 0;
                    d3.selectAll(`#${containerId2}-year-checkboxes input:checked`).each(function () {
                        selectedYears.push(+this.value);
                    });
                    document.dispatchEvent(new Event(`yearwasSelected-${containerId2}`)); // processed below
                });

            // Append the custom label text based on the selected yearLabels
            d3.select(this)
                .append('span')
                .text(yearLabels[d]) // Use the custom label from the appropriate yearLabels object
                .style('padding-right', '10px');
        });


/*************************************************************************************
**************************************************************************************
* Load the dataset and render figures
**************************************************************************************
*************************************************************************************/

d3.select(`#${containerId2}`)
    .append('div')
    .attr('id', `${containerId2}-the-graphs`); // this is where the graphs will go I put it here so I can put new figures on top (but below the selections defined above)

    /* Start with the default selections. The selectedSex and selectedCountries
    are defined in the selection js file: script_selections.js. selectedYears is defined above  */

    (async function () {

        // load full data if not already loaded
        await loadFullData(datasetFile);    // function in main js file
        selectedCountries.forEach(country => {
            selectedSex.forEach(sex => {
                selectedYears.forEach(year => {
                    renderChart(fullData[datasetFile], containerId2, country, sex, year, yVar, metric, detail=detail);
                })})})})();       


/*************************************************************************************
**************************************************************************************
* Event listeners for changes in selections
**************************************************************************************
*************************************************************************************/

/* Event listeners are created via functions so they are easier to remove if the heading is collapsed */


// Holds current selections graphed for comparing to selectedX for updating
let currentCountries=[...selectedCountries];
let currentSex=[...selectedSex];
let currentYears=[...selectedYears];
let detail = 1;

// consider creating a function for all three: country, year, and sex selection-event listeners
/**************************************************************************************
* A country was selected or deselected
**************************************************************************************/

    // countrywasSelected comes from the selection js file

    function handleCountrySelection() {
        const removals = currentCountries.filter((c) => !selectedCountries.includes(c));
        const additions = selectedCountries.filter((c) => !currentCountries.includes(c));

        removals.forEach(country => {
            selectedSex.forEach(sex => {
                selectedYears.forEach(year => {
                    d3.selectAll((`#${containerId2}-${country}-${sex}-${year}`).replace(/\s+/g,'')).selectAll('*').remove()
                })})});

        additions.forEach(country => {
            selectedSex.forEach(sex => {
                selectedYears.forEach(year => {
                    renderChart(fullData[datasetFile], containerId2, country, sex, year, yVar, metric, detail=detail);
                })})});

        currentCountries = [...selectedCountries];}


/**************************************************************************************
* A sex was selected or deselected
**************************************************************************************/

    // sexwasSelected comes from the selection js file
    function handleSexSelection() {
        const removals = currentSex.filter((c) => !selectedSex.includes(c));
        const additions = selectedSex.filter((c) => !currentSex.includes(c));

        removals.forEach(sex => {
            selectedCountries.forEach(country => {
                selectedYears.forEach(year => {
                    d3.selectAll((`#${containerId2}-${country}-${sex}-${year}`).replace(/\s+/g,'')).selectAll('*').remove()
            })})});

        additions.forEach(sex => {
            selectedCountries.forEach(country => {
                selectedYears.forEach(year => {
                renderChart(fullData[datasetFile], containerId2, country, sex, year, yVar, metric, detail=detail);
            })})});

        currentSex = [...selectedSex];}


/**************************************************************************************
* A year was selected or deselected
**************************************************************************************/

    // yearwasSelected comes from function above
    function handleYearSelection() {
        const removals = currentYears.filter((c) => !selectedYears.includes(c));
        const additions = selectedYears.filter((c) => !currentYears.includes(c));

        removals.forEach(year => {
            selectedCountries.forEach(country => {
                selectedSex.forEach(sex => {
                    
                    d3.selectAll((`#${containerId2}-${country}-${sex}-${year}`).replace(/\s+/g,'')).selectAll('*').remove()
                })})});
    
        additions.forEach(year => {
            selectedCountries.forEach(country => {
                selectedSex.forEach(sex => {
                    renderChart(fullData[datasetFile], containerId2, country, sex, year, yVar, metric, detail=detail);
                })})});
                        
        currentYears = [...selectedYears];}


/**************************************************************************************
* In case a selection leads to empty dataset (posts instructions to select)
**************************************************************************************/

    function selectionMessage() {                  
                        
        d3.select(`#${containerId2}-selectDataMsg`).remove(); // remove an existing one (may be different so don't just create a new on when there isn't one there)
    
        if (selectedCountries.length === 0 || selectedSex.length === 0 || selectedYears.length === 0) {
            let whatToSelect = '';
            if (selectedCountries.length === 0) {whatToSelect += 'location';}
            if (selectedSex.length === 0) {whatToSelect += (whatToSelect.length > 0 ? ', ' : '') + 'sex';}
            if (selectedYears.length === 0) {whatToSelect += (whatToSelect.length > 0 ? ', ' : '') + 'year';}

            if (whatToSelect.includes(',')) {
                const lastCommaIndex = whatToSelect.lastIndexOf(',');
                whatToSelect = whatToSelect.substring(0, lastCommaIndex) + ' and' + whatToSelect.substring(lastCommaIndex + 1);}

        const message = `Select ${whatToSelect}`;

                d3.select(`#${containerId2}-the-graphs`)
                    .append('div')
                    .attr('id', `${containerId2}-selectDataMsg`)
                    .attr('class', 'no-data-message-box')
                    .append('p')
                    .text(message)
                    .attr('class', 'no-data-message-text');
            
        } else { d3.select(`#${containerId2}-selectDataMsg`).remove(); }
    }       
    
    
/**************************************************************************************
* The checkbox for detailed causes was changed
**************************************************************************************/

    //  dispatched above
    function changeDetail() {
        const checkbox = document.getElementById(`${containerId2}-checkbox-detail`);
        detail = checkbox && checkbox.checked ? 0 : 1;
        selectedCountries.forEach(country => {
            selectedSex.forEach(sex => {
                selectedYears.forEach(year => {
                    d3.select((`#${containerId2}-${country}-${sex}-${year}`).replace(/\s+/g,'')).selectAll('*').remove()
                    renderChart(fullData[datasetFile], containerId2, country, sex, year, yVar, metric, detail=detail);})})});}


/**************************************************************************************
* The checkbox for showing negative values was changed (gap only)
**************************************************************************************/

    // dispatched above
    function changeOutcome() {
        const checkbox = document.getElementById(`${containerId2}-checkbox`);
        yVar = checkbox && checkbox.checked ? 'P_no0' : 'P';
        selectedCountries.forEach(country => {
            selectedSex.forEach(sex => {
                selectedYears.forEach(year => {
                    d3.select((`#${containerId2}-${country}-${sex}-${year}`).replace(/\s+/g,'')).selectAll('*').remove()
                    renderChart(fullData[datasetFile], containerId2, country, sex, year, yVar, metric, detail=detail);
            })})});
    }

    document.addEventListener(`changeOutcome-${containerId2}`, changeOutcome);


/**************************************************************************************
* Run event-listener functions
**************************************************************************************/

document.addEventListener(`countrywasSelected-${containerId2}`, handleCountrySelection);
document.addEventListener(`sexwasSelected-${containerId2}`, handleSexSelection);
document.addEventListener(`yearwasSelected-${containerId2}`, handleYearSelection);
document.addEventListener(`countrywasSelected-${containerId2}`, selectionMessage);
document.addEventListener(`sexwasSelected-${containerId2}`, selectionMessage);
document.addEventListener(`yearwasSelected-${containerId2}`, selectionMessage);
document.addEventListener(`${containerId2}-expanded`, selectionMessage); // comes from main js
document.addEventListener(`changeDetail-${containerId2}`, changeDetail);
document.addEventListener(`changeOutcome-${containerId2}`, changeOutcome);


/**************************************************************************************
* Remove event listeners when the container is collapsed
**************************************************************************************/

// event comes from the main js
document.addEventListener(`${containerId2}-collapsed` , function () {                  
    document.removeEventListener(`countrywasSelected-${containerId2}`, handleCountrySelection);
    document.removeEventListener(`sexwasSelected-${containerId2}`, handleSexSelection);
    document.removeEventListener(`yearwasSelected-${containerId2}`, handleYearSelection);
    document.removeEventListener(`countrywasSelected-${containerId2}`, selectionMessage);
    document.removeEventListener(`sexwasSelected-${containerId2}`, selectionMessage);
    document.removeEventListener(`yearwasSelected-${containerId2}`, selectionMessage);
    document.removeEventListener(`changeDetail-${containerId2}`, changeDetail);
    document.removeEventListener(`changeOutcome-${containerId2}`, changeOutcome);
    
});
}


