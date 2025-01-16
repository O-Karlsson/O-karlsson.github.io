/*************************************************************************************
**************************************************************************************
* Constructing selection tree for countries
**************************************************************************************
*************************************************************************************/

// Initialize global arrays to store selected countries and selected sex
let selectedCountries = ['World','United States','China'];
let selectedSex = ['both'];  

// Load the CSV data and create the tree structure for country selection
d3.csv('CIH_dash/data/countries_selection.csv').then(function(data) {

    // Convert CSV into hierarchical structure
    const regionsData = d3.group(data, d => d.region);

    // Convert D3 group into a usable hierarchical structure
    const treeData = Array.from(regionsData, ([key, value]) => ({
        name: key,
        children: value.map(d => ({ name: d.country, minyear: d.minyear, supr: d.supr}))
    }));

    // Create the tree container using id from index.html
    const treeContainer = d3.select("#treeContainer");
    const ul = treeContainer.append("ul");

    // Function to create collapsible tree
    const createTree = (ul, data) => {
        const li = ul.selectAll("li")
            .data(data)
            .enter()
            .append("li")
            .attr("class", d => d.children ? "node node--internal" : "node node--leaf");

        // Add region (internal node)
        li.filter(d => d.children)
            .append("span")
            .attr("class", "toggle")
            .text(d => d.name === 'CIH regions' ? `▼ ${d.name}` : `► ${d.name}`) // Expanded by default
            .on("click", function(event, d) { // 'event' needs to be there! (first argument is the event and second is the data)
                // Toggle display of child nodes
                const subList = d3.select(this.parentNode).select("ul");
                const expanded = subList.style("display") === "none";
                subList.style("display", expanded ? "block" : "none");
                d3.select(this).text(expanded ? `▼ ${d.name}` : `► ${d.name}`);
            });

        // Add country (leaf node)
        li.filter(d => !d.children)
            .append("label")
            .attr("class", "node-checkbox")
            .html(d => {
                const isChecked = d.name === 'World'|| d.name ==='United States' || d.name ==='China'; // defaults
                return `<input type="checkbox" value="${d.name}" ${isChecked ? 'checked' : ''}> ${d.name}`;})
            .on("change", function(event) {
                // Get the checkbox element
                const checkbox = event.target;
                const value = checkbox.value;

                if (checkbox.checked) {
                    // Add the country to the selectedCountries array
                    selectedCountries.push(value);
                } else {
                    // Remove the country from the selectedCountries array
                    selectedCountries = selectedCountries.filter(item => item !== value);
                }
                document.dispatchEvent(new Event('countrywasSelected')); // processed below
            });

        // If it's an internal node add child ul and recurse
        li.filter(d => d.children)
            .append("ul")
            .style("display", d => d.name === 'CIH regions' ? "block" : "none") // Collapse all regions except CIH regions
            .each(function(d) {
                createTree(d3.select(this), d.children);
                // If this is the "Other aggregates" region, insert "Countries" heading after children are rendered
                if (d.name === 'Other aggregates') { // whatever is the last one before the countries
                    d3.select(this.parentNode) // Go up to the parent of this region
                        .append("div") // Add heading directly after the children
                        .attr("class", "countries-heading")
                        .text("Countries or entities");
                }
            });
        document.dispatchEvent(new Event('treeConstructed')); // I don't think this gets used
    };
    // Create the initial tree
    createTree(ul, treeData);
});


/*************************************************************************************
**************************************************************************************
* Event listeners for sex selections and clear selections button
**************************************************************************************
*************************************************************************************/

// Event listener for sex checkboxes. The boxes are created in index.html
document.querySelectorAll('input[name="sex"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
        // Get all checked checkboxes for sex
        selectedSex = Array.from(document.querySelectorAll('input[name="sex"]:checked'))
                           .map(checkbox => checkbox.value);
        document.dispatchEvent(new Event('sexwasSelected')); // processed below                         
    });
});

// Clear selections button (created in index.html)
document.getElementById('clearSelection').addEventListener('click', function() {
    // Clear and reset sex checkboxes, setting 'both' to checked
    document.querySelectorAll('input[name="sex"]').forEach(checkbox => {
        if (checkbox.value === 'both') {
            checkbox.checked = true; // Visually check the 'both' checkbox
        } else if (checkbox.value !== 'both') {
            checkbox.checked = false; // Uncheck all other checkboxes
        }
    });
    selectedSex = ['both']; // Reset selectedSex to 'both'
    document.dispatchEvent(new Event('sexwasSelected')); // processed below

    // Clear all country checkboxes
    document.querySelectorAll('#treeContainer input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    selectedCountries = []; // Clear selectedCountries array
    document.dispatchEvent(new Event('countrywasSelected')); // processed below
});

// dispatch events that can be container specific. Makes it easier to remove listeners when headings are collapsed
document.addEventListener('countrywasSelected', () => {
    // Find all expanded containers
    const expandedContainers = document.querySelectorAll('[data-rendered="true"]');
    // Dispatch a custom event for each expanded container
    expandedContainers.forEach(container => {
        const containerId = container.id; // Assuming each container has a unique ID
        const customEvent = new CustomEvent(`countrywasSelected-${containerId}`);
        document.dispatchEvent(customEvent);
    });
});

document.addEventListener('sexwasSelected', () => {
    // Find all expanded containers
    const expandedContainers = document.querySelectorAll('[data-rendered="true"]');
    // Dispatch a custom event for each expanded container
    expandedContainers.forEach(container => {
        const containerId = container.id; // Assuming each container has a unique ID
        const customEvent = new CustomEvent(`sexwasSelected-${containerId}`);
        document.dispatchEvent(customEvent);
    });
});