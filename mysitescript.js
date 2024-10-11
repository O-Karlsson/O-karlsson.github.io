// Function to fetch the Markdown file and insert its content 
function loadMarkdownContent(url, targetElementId) {
    fetch(url)
        .then(response => response.text())  // Get the Markdown file content as text
        .then(markdown => {
            const targetElement = document.getElementById(targetElementId);
            // Convert markdown to HTML using marked.js
            targetElement.innerHTML = marked.parse(markdown); // Use 'marked.parse()'
        })
        .catch(error => {
            console.error("Error fetching the Markdown file:", error);
        });
}

// Call the function to load content from your markdown file into the "Project X" section
loadMarkdownContent('CIH.md', 'project-x-content');
loadMarkdownContent('CV.md', 'cv-content');


// Function to toggle main and subheadings
function toggleSection(headings) {
    headings.forEach(heading => {
        heading.addEventListener('click', () => {
            const content = heading.nextElementSibling;

            // Toggle between collapsed and expanded states using max-height
            if (content.style.maxHeight && content.style.maxHeight !== '0px') {
                content.style.maxHeight = '0px'; // Collapse
            } else {
                const maxHeight = content.getAttribute('data-height') || '8000px'; // Use fixed max height or default to 500px
                content.style.maxHeight = maxHeight; // Expand to max height
            }

            // Mark this section as active/inactive
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
    });

    // Hide the "Back to Menu" button
    document.getElementById('backToMenu').style.display = 'none';
});
