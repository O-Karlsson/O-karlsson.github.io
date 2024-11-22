document.addEventListener('DOMContentLoaded', () => {
    const menuButton = document.getElementById('menu-button');
    const tocButton = document.getElementById('toc-button');
    const backButton = document.getElementById('back-button');
    const menuModal = document.getElementById('menu-modal');
    const tocModal = document.getElementById('toc-modal');
    const closeMenu = document.getElementById('close-menu');
    const closeToc = document.getElementById('close-toc');
    const tocList = document.getElementById('toc-list');

    menuButton.addEventListener('click', () => {
        menuModal.style.display = 'block';
    });

    tocButton.addEventListener('click', () => {
        tocModal.style.display = 'block';
        populateTOC();
    });

    backButton.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    closeMenu.addEventListener('click', () => {
        menuModal.style.display = 'none';
    });

    closeToc.addEventListener('click', () => {
        tocModal.style.display = 'none';
    });

    // Close modals when clicking outside their content
    window.addEventListener('click', (event) => {
        if (menuModal.style.display === 'block' && !menuModal.querySelector('.modal-content').contains(event.target) && event.target !== menuButton) {
            menuModal.style.display = 'none';
        }
        if (tocModal.style.display === 'block' && !tocModal.querySelector('.modal-content').contains(event.target) && event.target !== tocButton) {
            tocModal.style.display = 'none';
        }
    });

        // Close TOC Modal After Clicking a Link
        tocList.addEventListener('click', (event) => {
            if (event.target.tagName === 'A') {
                tocModal.style.display = 'none'; // Close the TOC modal
            }
        });

    document.getElementById('copy-link').addEventListener('click', (event) => {
        event.preventDefault(); // Prevent the default hyperlink behavior
        const textToCopy = event.target.getAttribute('data-copy-text'); // Get the text to copy
        navigator.clipboard.writeText(textToCopy).then(() => {
            const message = document.getElementById('copy-message');
            message.style.display = 'inline'; // Show a "Copied!" message
            setTimeout(() => {
                message.style.display = 'none'; // Hide the message after 2 seconds
            }, 2000);
        }).catch((err) => {
            console.error('Failed to copy text: ', err);
        });
    });
    

    function populateTOC() {
        tocList.innerHTML = ''; // Clear existing TOC
        const headings = document.querySelectorAll('h1, h2, h3, h4');
        headings.forEach((heading) => {
            const listItem = document.createElement('li');
            const link = document.createElement('a');
            link.href = `#${heading.id}`;
            link.textContent = heading.textContent;

            // Add classes based on heading level
            if (heading.tagName === 'H2') {
                listItem.classList.add('toc-h2');
            } else if (heading.tagName === 'H3') {
                listItem.classList.add('toc-h3');
            } else if (heading.tagName === 'H4') {
                listItem.classList.add('toc-h4');
            }

            listItem.appendChild(link);
            tocList.appendChild(listItem);
        });
    }
});






document.addEventListener("DOMContentLoaded", () => {
    const iframes = document.querySelectorAll('.table-iframe');
    iframes.forEach(iframe => {
        iframe.onload = () => {
            const iframeDocument = iframe.contentWindow.document;
            iframe.style.height = iframeDocument.body.scrollHeight + 10 +'px';
            iframe.style.width = iframeDocument.body.scrollWidth + 10 + 'px';
            iframe.style.margin = '0 auto';
        };
    });
});





/*
// Select elements
const commentButton = document.getElementById('commentButton');
const commentModal = document.getElementById('commentModal');
const closeModal = document.getElementById('closeModal');

// Open the modal when the comment button is clicked
commentButton.addEventListener('click', () => {
    commentModal.style.display = 'block';
});

// Close the modal when the close button is clicked
closeModal.addEventListener('click', () => {
    commentModal.style.display = 'none';
});

// Close the modal when clicking outside the modal content
window.addEventListener('click', (event) => {
    if (event.target === commentModal) {
        commentModal.style.display = 'none';
    }
});
*/