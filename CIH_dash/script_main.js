/*************************************************************************************
**************************************************************************************
* Function to load full data (if not already loaded)
**************************************************************************************
*************************************************************************************/

let fullData = {};
async function loadFullData(csvFilePath) {
    if (!fullData[csvFilePath] || fullData[csvFilePath].length === 0) {
        const data = await d3.csv(csvFilePath, (d) => {
            const processedRow = {};
            for (const key in d) {
                if (key === "country" || key === "sex" || key == "type" || key == "causename") {
                    processedRow[key] = d[key]; // Keep as string (add if needed)
                } else { // convert others to numbers
                   const trimmedValue = d[key].trim();
                    processedRow[key] = (trimmedValue === "" || isNaN(Number(trimmedValue))) ? null : +trimmedValue;
                }
            }
            return processedRow;
        });
        fullData[csvFilePath] = data; // Cache the entire dataset
    }
}


/*************************************************************************************
**************************************************************************************
* Rounds numbers to two significant values (eg, 1231 to 1200; 1.232 to 1.2)
**************************************************************************************
*************************************************************************************/

function roundToTwoSignificantFigures(num) {
    if (num === 0) return 0; // Handle zero separately
    const digits = Math.floor(Math.log10(Math.abs(num))) + 1; // Get the number of digits
    const factor = Math.pow(10, 2 - digits);
    return Math.round(num * factor) / factor;
}


/*************************************************************************************
**************************************************************************************
* Back to menu button
**************************************************************************************
*************************************************************************************/

// Back to Menu button functionality
document.getElementById('backToMenu').addEventListener('click', () => {
    
    // Collapse all content sections
    document.querySelectorAll('.content').forEach(content => {
        content.style.maxHeight = '0px'; // Collapse content
        content.style.padding = '0'; // Remove padding when collapsed

        // Clear all figures within the collapsed content
        const figureContainers = content.querySelectorAll("div[id][data-rendered='true']");
        figureContainers.forEach(container => {
            container.innerHTML = ""; // Clear the figure container
            container.setAttribute("data-rendered", "false"); // Reset rendered state
            const containerId = container ? container.id : null;
            document.dispatchEvent(new Event(`${containerId}-collapsed`)); // used to remove all the event listeners associated with the figure
        });        
     });
    // Hide the "Back to Menu" button
    document.getElementById('backToMenu').style.display = 'none';
});


/*************************************************************************************
**************************************************************************************
* Expand headings
**************************************************************************************
*************************************************************************************/

function toggleSection(headings) {

    headings.forEach(heading => {
        heading.addEventListener('click', () => {

            const content = heading.nextElementSibling;
            const maxHeight = content.getAttribute('data-height') || content.scrollHeight; // Use data-height if provided, otherwise full content height

            // Find the container inside the content
            const container = content.querySelector("div[id]");
            const csvFilePath = container.getAttribute("dataset") || container.getAttribute("data-file");
            const containerId = container ? container.id : null;

            // Toggle between collapsed and expanded states
            if (content.style.maxHeight && content.style.maxHeight !== '0px') {
                content.style.maxHeight = '0px'; // Collapse
                const container = document.getElementById(containerId);
                if (container) { // unsure why this is under an 'if'
                    container.innerHTML = ""; // Clear the figure container
                    container.setAttribute("data-rendered", "false"); // Reset rendered state
                    // uncomment the one below to also remove the dataset from memory. However, the same dataset is often used for different figures
                    // delete fullData[csvFilePath]; // Explicitly delete the data
                    document.dispatchEvent(new Event(`${containerId}-collapsed`));} // used to remove event listeners
            } else {
                content.style.maxHeight =  maxHeight + 'px'; // Expand to actual height
                if (containerId.startsWith("decomp")) {renderDecompFigures(containerId)}; // Render decomposition figures
                if (containerId.startsWith("line")) {drawLineFigures(containerId)}; // Render line figures
                container.setAttribute("data-rendered", "true"); // Mark as rendered
                document.dispatchEvent(new Event(`${containerId}-expanded`)); // used to check if there is no selection (no data to plot)                
            }
            // Toggle the 'active' class on the heading
            heading.classList.toggle('active');  // Add/remove the 'active' class to indicate state

            // Show the "Back to Menu" button when any content is expanded
            document.getElementById('backToMenu').style.display = 'block';
        });
    });
}

// Initialize toggle for main headings (h2 elements)
toggleSection(document.querySelectorAll('h2.expandable'));


/*************************************************************************************
**************************************************************************************
* various not used functions
**************************************************************************************
*************************************************************************************/

function getResponsiveFontSize() {
    const width = window.innerWidth;
    if (width < 400) return '14px';
    if (width < 600) return '16px';
    if (width < 800) return '20px';
    return '22px'; // Default size for larger screens
}



