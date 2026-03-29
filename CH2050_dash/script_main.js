/*************************************************************************************
**************************************************************************************
* Function to load full data (if not already loaded)
**************************************************************************************
*************************************************************************************/

let fullData = {};
let fullDataIndex = {};

function buildDataIndex(csvFilePath, sourceRows = null) {
    const rows = sourceRows || fullData[csvFilePath] || [];
    const byCountrySex = new Map();
    const byOutcomeCountrySex = new Map();
    const byOutcomeCountrySexYear = new Map();
    const getRowOrderX = (row) => {
        if (Number.isFinite(row.year)) {
            return row.year;
        }
        if (Number.isFinite(row.age)) {
            return row.age;
        }
        return 0;
    };

    rows.forEach((row) => {
        const key = `${row.country}||${row.sex}`;
        if (!byCountrySex.has(key)) {
            byCountrySex.set(key, []);
        }
        byCountrySex.get(key).push(row);

        if (row.outcome && Number.isFinite(row.value)) {
            if (!byOutcomeCountrySex.has(row.outcome)) {
                byOutcomeCountrySex.set(row.outcome, new Map());
            }
            const byCountry = byOutcomeCountrySex.get(row.outcome);
            if (!byCountry.has(row.country)) {
                byCountry.set(row.country, new Map());
            }
            const bySex = byCountry.get(row.country);
            if (!bySex.has(row.sex)) {
                bySex.set(row.sex, []);
            }
            bySex.get(row.sex).push(row);

            if (!byOutcomeCountrySexYear.has(row.outcome)) {
                byOutcomeCountrySexYear.set(row.outcome, new Map());
            }
            const byCountryYear = byOutcomeCountrySexYear.get(row.outcome);
            if (!byCountryYear.has(row.country)) {
                byCountryYear.set(row.country, new Map());
            }
            const bySexYear = byCountryYear.get(row.country);
            if (!bySexYear.has(row.sex)) {
                bySexYear.set(row.sex, new Map());
            }
            bySexYear.get(row.sex).set(row.year, row);
        }
    });

    // Keep each country/sex series sorted once, so consumers avoid repeated sorts.
    byCountrySex.forEach((series) => {
        series.sort((a, b) => getRowOrderX(a) - getRowOrderX(b));
    });
    byOutcomeCountrySex.forEach((byCountry) => {
        byCountry.forEach((bySex) => {
            bySex.forEach((series) => {
                series.sort((a, b) => getRowOrderX(a) - getRowOrderX(b));
            });
        });
    });

    fullDataIndex[csvFilePath] = { byCountrySex, byOutcomeCountrySex, byOutcomeCountrySexYear };
}

async function loadFullData(csvFilePath) {
    if (!fullData[csvFilePath] || fullData[csvFilePath].length === 0) {
        const fileName = csvFilePath.split('/').pop() || '';
        const inferredOutcome = fileName.endsWith('.csv') ? fileName.slice(0, -4) : fileName;
        const data = await d3.csv(csvFilePath, (d) => {
            const processedRow = {};
            const sexMap = { '1': 'male', '2': 'female', '3': 'both' };
            for (const key in d) {
                const trimmedValue = (d[key] ?? "").trim();

                if (
                    key === 'country' ||
                    key === 'loc' ||
                    key === 'lid' ||
                    key === 'type' ||
                    key === 'causename' ||
                    key === 'heading1' ||
                    key === 'heading2' ||
                    key === 'outcome' ||
                    key === 'note' ||
                    key === 'source' ||
                    key === 'weights' ||
                    key === 'weight_source' ||
                    key === 'derived' ||
                    key.startsWith('note_')
                ) {
                    processedRow[key] = trimmedValue;
                } else if (key === 'sex') {
                    const normalized = trimmedValue.toLowerCase();
                    processedRow[key] = sexMap[trimmedValue] || normalized || trimmedValue;
                } else {
                    processedRow[key] = (trimmedValue === '' || isNaN(Number(trimmedValue))) ? null : +trimmedValue;
                }
            }
            if (!processedRow.country && processedRow.loc) {
                processedRow.country = processedRow.loc;
            }
            if (!processedRow.country && processedRow.lid !== undefined && processedRow.lid !== '') {
                processedRow.country = String(processedRow.lid);
            }
            if (!processedRow.outcome && processedRow.value !== null && inferredOutcome && inferredOutcome !== 'yearlydata2' && inferredOutcome !== 'yearlydata') {
                processedRow.outcome = inferredOutcome;
            }
            return processedRow;
        });

        const usesLongFormat = data.length > 0 && Object.prototype.hasOwnProperty.call(data[0], 'outcome') && Object.prototype.hasOwnProperty.call(data[0], 'value');

        if (usesLongFormat) {
            buildDataIndex(csvFilePath, data);

            const groupedRows = new Map();
            data.forEach((row) => {
                const key = [row.country, row.loc, row.heading1, row.heading2, row.year, row.sex].join('||');

                if (!groupedRows.has(key)) {
                    groupedRows.set(key, {
                        country: row.country,
                        loc: row.loc,
                        heading1: row.heading1,
                        heading2: row.heading2,
                        year: row.year,
                        sex: row.sex
                    });
                }

                const wideRow = groupedRows.get(key);
                if (row.outcome) {
                    wideRow[row.outcome] = row.value;
                    wideRow[`note_${row.outcome}`] = row.note || '';
                }
            });

            fullData[csvFilePath] = Array.from(groupedRows.values());
        } else {
            fullData[csvFilePath] = data;
            buildDataIndex(csvFilePath);
        }
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

async function renderReferences(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const filePath = container.getAttribute("data-file");
    if (!filePath) {
        container.textContent = "No references file configured.";
        return;
    }

    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Failed to load ${filePath}`);
        }
        const text = await response.text();
        container.innerHTML = renderSimpleMarkdown(text);
        const contentSection = container.closest(".content");
        if (contentSection) {
            requestAnimationFrame(() => {
                contentSection.style.maxHeight = `${contentSection.scrollHeight}px`;
            });
        }
    } catch (error) {
        container.textContent = `Unable to load references from ${filePath}.`;
    }
}

function renderSimpleMarkdown(markdownText) {
    const escapeHtml = (value) => value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const formatInline = (value) => {
        let html = escapeHtml(value);
        html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
        html = html.replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        return html;
    };

    const lines = markdownText.split(/\r?\n/);
    const output = ['<div class="references-markdown">'];
    let inList = false;

    const closeList = () => {
        if (inList) {
            output.push("</ul>");
            inList = false;
        }
    };

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
            closeList();
            return;
        }

        if (line === "#" || line === "##") {
            closeList();
            return;
        }

        if (line.startsWith("## ")) {
            closeList();
            output.push(`<h3>${formatInline(line.slice(3))}</h3>`);
            return;
        }

        if (/^\*\*.+\*\*$/.test(line)) {
            closeList();
            output.push(`<h4>${formatInline(line.slice(2, -2))}</h4>`);
            return;
        }

        if (line.startsWith("- ")) {
            if (!inList) {
                output.push("<ul>");
                inList = true;
            }
            output.push(`<li>${formatInline(line.slice(2))}</li>`);
            return;
        }

        closeList();
        output.push(`<p>${formatInline(line)}</p>`);
    });

    closeList();
    output.push("</div>");
    return output.join("");
}

function toggleSection(headings) {
    function setHeadingToggleState(heading, isExpanded) {
        const baseLabel = heading.getAttribute('data-base-label') || heading.textContent.replace(/^\[[+-]\]\s*/, '').trim();
        heading.setAttribute('data-base-label', baseLabel);
        heading.textContent = `${isExpanded ? '[-]' : '[+]'} ${baseLabel}`;
    }

    headings.forEach(heading => {
        setHeadingToggleState(heading, false);
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
                setHeadingToggleState(heading, false);
            } else {
                content.style.maxHeight =  maxHeight + 'px'; // Expand to actual height
                if (containerId.startsWith("decomp")) {renderDecompFigures(containerId)}; // Render decomposition figures
                if (containerId.startsWith("line")) {drawLineFigures(containerId)}; // Render line figures
                if (containerId.startsWith("multi-outcome")) {drawMultiOutcomeFigures(containerId)}; // Render multi-outcome figures
                if (containerId.startsWith("multi-height-outcome")) {drawMultiHeightFigures(containerId)}; // Render multi-height-outcome figures
                if (containerId.startsWith("multi-height-age-outcome")) {drawMultiHeightAgeFigures(containerId)}; // Render multi-height-age-outcome figures
                if (containerId.startsWith("classic-star")) {drawTraditionalStarFigures(containerId)}; // Render traditional spider/radar figures
                if (containerId.startsWith("star-line")) {drawStarLineFigures(containerId)}; // Render line-based feasibility figures
                if (containerId.startsWith("star-") && !containerId.startsWith("star-line")) {drawStarFigures(containerId)}; // Render spider/radar figures
                if (containerId.startsWith("wimort")) {drawWIMortFigures(containerId)}; // Render under-5 mortality by wealth figures
                if (containerId.startsWith("references")) {renderReferences(containerId)}; // Render references file
                container.setAttribute("data-rendered", "true"); // Mark as rendered
                document.dispatchEvent(new Event(`${containerId}-expanded`)); // used to check if there is no selection (no data to plot)                
                setHeadingToggleState(heading, true);
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



