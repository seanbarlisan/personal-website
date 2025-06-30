// Function to switch the large image
function switchImage(imageSrc: string): void {
    const largeImage = document.getElementById('large-image') as HTMLImageElement;
    if (largeImage) {
        largeImage.src = imageSrc;
    }
}

// Add event listeners to alternative images
function setupImageSwitching(): void {
    const alternativeImages = document.querySelectorAll('.alternative-image');
    alternativeImages.forEach((image) => {
        image.addEventListener('click', () => {
            const imageSrc = (image as HTMLImageElement).src;
            switchImage(imageSrc);
        });
    });
}

// Initialize the functionality
document.addEventListener('DOMContentLoaded', setupImageSwitching);