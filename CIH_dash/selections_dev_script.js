// Initialize global arrays to store selected countries and selected sex
let selectedCountries = ['World','United States','China'];
let selectedSex = ['both'];  // Default to an empty array

// Load the CSV data using D3 and create the tree structure for country selection
d3.csv('countries.csv').then(function(data) {
    // Convert CSV into hierarchical structure
    const regionsData = d3.group(data, d => d.region);

    // Convert D3 group into a usable hierarchical structure
    const treeData = Array.from(regionsData, ([key, value]) => ({
        name: key,
        children: value.map(d => ({ name: d.country, minyear: d.minyear, supr: d.supr   // Include minyear field if available
        }))
    }));

    // Create the tree
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
            .text(d => d.name === 'CIH regions' ? `▼ ${d.name}` : `► ${d.name}`) // Expand "-" region by default
            .on("click", function(event, d) {
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
                const isChecked = d.name === 'World'|| d.name ==='United States' || d.name ==='China';
                const minyear = d.minyear ? ` (${d.minyear})<sup>1</sup>` : '';  // Add minyear if it exists
                const supr = d.supr === '1' ? '<sup>2</sup>' : '';  // Add superscript if supr is 1
                return `<input type="checkbox" value="${d.name}" ${isChecked ? 'checked' : ''}> ${d.name}${minyear}${supr}`;

                // return `<input type="checkbox" value="${d.name}"> ${d.name}`; // if you don't want it checked
            })
            .on("change", function(event, d) {
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

                // Call function to update the chart

            });
        // If it's an internal node, add child ul and recurse
        li.filter(d => d.children)
            .append("ul")
            .style("display", d => d.name === 'CIH regions' ? "block" : "none") // Collapse all regions except "-"
            .each(function(d) {
                createTree(d3.select(this), d.children);

                // If this is the "-" region, insert "Countries" heading after children are rendered
                if (d.name === 'Other aggregates') {
                    d3.select(this.parentNode) // Go up to the parent of this region
                        .append("div") // Add heading directly after the children
                        .attr("class", "countries-heading")
                        .text("Countries");
                }
            });

        document.dispatchEvent(new Event('treeConstructed'));
    };
    // Create the initial tree
    createTree(ul, treeData);
});

// Event listener for sex (gender) checkboxes
document.querySelectorAll('input[name="sex"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
        // Get all checked checkboxes for sex
        selectedSex = Array.from(document.querySelectorAll('input[name="sex"]:checked'))
                           .map(checkbox => checkbox.value);

    });
});



// Clear all selections
// Clear all selections
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

    // Clear country checkboxes
    selectedCountries = []; // Clear selectedCountries array
    document.querySelectorAll('#treeContainer input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });

    // Reset the sliders for each outcome.
    const xVarMap = {}; // To store x-variable associated with each sliderID
    outcomes.forEach(({sliderID, containerClass}) => {
        const yearSlider = document.getElementById(sliderID);
        const CxVar = d3.select(containerClass).attr('x-variable');
        xVarMap[sliderID] = CxVar; // Map sliderID to its x-variable
        if (yearSlider.noUiSlider !== 0) {
            if (CxVar === 'age') {
                initializeSlider(1, 100, sliderID);  // Ensures min < max
            } else if (CxVar === 'year') {
                initializeSlider(1970, 2050, sliderID);  // Ensures min < max
            }
        }
    });
});



