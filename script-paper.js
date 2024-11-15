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