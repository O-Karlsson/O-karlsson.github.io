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
loadMarkdownContent('CV.md', 'cv-content');


// Function to toggle main and subheadings
function toggleSection(headings) {
    headings.forEach(heading => {
        heading.addEventListener('click', () => {
            const content = heading.nextElementSibling;

            // Toggle between collapsed and expanded states using max-height
            if (content.style.display === 'block') {
                content.style.display = 'none';
                backToMenuButton.style.display = 'none';
            } else {
                content.style.display = 'block';
                backToMenuButton.style.display = 'block';
            }

            // Show the "Back to Menu" button when any content is expanded
            document.getElementById('backToMenu').style.display = 'block';
        });

        
    });
    
}


toggleSection(document.querySelectorAll('h2'));



// Function to collapse all expanded headers
function collapseAllHeaders() {
    // Loop through all content sections and hide them
    document.querySelectorAll('.content').forEach(content => {
        content.style.display = 'none';
    });

    // Hide the "Back to Menu" button
    backToMenuButton.style.display = 'none';
    backToPortButton.style.display = 'none';

}


        // Select all buttons with the .openFullView class
        const openFullViewButtons = document.querySelectorAll('.openFullView');
        const iframe = document.querySelector('.dash');
        const backToMenuButton = document.getElementById('backToMenu');
        const backToPortButton = document.getElementById('backToPort');

        const body = document.body;

// Function to handle opening the full-window HTML
document.querySelectorAll('.openFullView').forEach(button => {
    button.addEventListener('click', () => {
        const backDestination = button.getAttribute('data-back'); // Get the data-back value
        const src = button.getAttribute('data-src'); // Get the data-src value

        if (src) {
            // Append the backDestination as a query parameter to the src URL
            const url = new URL(src, window.location.origin);
            if (backDestination) {
                url.searchParams.set('back', backDestination); // Add the back query parameter
            }
            window.location.href = url.toString(); // Navigate to the new URL with the query parameter
        }
    });
});

        // Handle "Back to Menu" button click
        backToMenuButton.addEventListener('click', () => {
            // Hide the iframe and the Back to Menu button
            backToMenuButton.style.display = 'none';
            collapseAllHeaders()
        });


                // Handle "Back to Menu" button click
                backToPortButton.addEventListener('click', () => {
                    backToMenuButton.style.display = 'block';

                    // Hide the iframe and the Back to Menu button
                    iframe.style.display = 'none';
                    backToPortButton.style.display = 'none';
                   // Clear the iframe source to stop loading the content
                    iframe.src = '';
                    // Show the rest of the body content
                    body.classList.remove('body-hidden');
                    collapseAllHeaders()


                });


// Auto-expand section if URL has a hash on page load
document.addEventListener('DOMContentLoaded', () => {
    const hash = window.location.hash;
    if (hash) {
        const section = document.querySelector(hash);
        if (section && section.classList.contains('content')) {
            section.style.display = 'block';
            const backToMenuButton = document.getElementById('backToMenu');
            if (backToMenuButton) {
                backToMenuButton.style.display = 'block';
            }
            // Optional: scroll to it again after expanding
            section.scrollIntoView({ behavior: 'smooth' });
        }
    }
});