// Function to set initial max-height for expanded sections
function initializeSections() {
    document.querySelectorAll('.expandable').forEach(heading => {
        const content = heading.nextElementSibling;
        // Temporarily disable transitions
        if (heading.classList.contains('active')) {
            content.style.maxHeight = 200000 + 'px'; // Set to actual height
            
            
        } else {
            content.style.maxHeight = '0px'; // Ensure it starts collapsed
        }
        
        // Re-enable transitions
        content.style.transition = 'max-height 0.1s ease-in-out, padding 0.1s ease-in-out';
    });
}

// Wait for the tree to be constructed, then initialize sections
document.addEventListener('treeConstructed', () => {
    initializeSections(); // Run the initialization after the tree is built
    
});

// Call this function to initialize sections on page load
initializeSections();



// Function to toggle main and subheadings
function toggleSection(headings) {
    headings.forEach(heading => {
        heading.addEventListener('click', () => {
            const content = heading.nextElementSibling;
            const maxHeight = content.getAttribute('data-height') || content.scrollHeight; // Use data-height if provided, otherwise full content height

            // Toggle between collapsed and expanded states
            if (content.style.maxHeight && content.style.maxHeight !== '0px') {
                content.style.maxHeight = '0px'; // Collapse
                content.style.padding = '0'; // Optionally remove padding when collapsed
            } else {
                content.style.maxHeight =  maxHeight + 'px'; // Expand to actual height
                content.style.padding = '10px'; // Add padding when expanded

                

                
            }

            // Toggle the 'active' class on the heading
            heading.classList.toggle('active');

            // Show the "Back to Menu" button when any content is expanded
            document.getElementById('backToMenu').style.display = 'block';
        });
    });
}

// Initialize toggle for main headings (h2 elements)
toggleSection(document.querySelectorAll('h2.expandable'));

// Initialize toggle for subheadings (h3 elements)
toggleSection(document.querySelectorAll('h3.subheading'));


// Back to Menu button functionality
document.getElementById('backToMenu').addEventListener('click', () => {
    // Collapse all content sections
    document.querySelectorAll('.content').forEach(content => {
        content.style.maxHeight = '0px'; // Collapse content
        content.style.padding = '0'; // Optionally remove padding when collapsed
    });
    // Hide the "Back to Menu" button
    document.getElementById('backToMenu').style.display = 'none';
});
