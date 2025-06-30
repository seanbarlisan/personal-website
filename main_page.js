// Function to switch the large image
function switchImage(imageSrc) {
    var largeImage = document.getElementById('large-image');
    if (largeImage) {
        largeImage.src = imageSrc;
    }
}
// Add event listeners to alternative images
function setupImageSwitching() {
    var alternativeImages = document.querySelectorAll('.alternative-image');
    alternativeImages.forEach(function (image) {
        image.addEventListener('click', function () {
            var imageSrc = image.src;
            switchImage(imageSrc);
        });
    });
}


