document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const uploadBox = document.getElementById('upload-box');
    const fileInput = document.getElementById('file-input');
    const urlInput = document.getElementById('url-input');
    const urlSubmit = document.getElementById('url-submit');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const resultsSection = document.getElementById('results-section');
    const resultsContainer = document.getElementById('results-container');
    const resultsCount = document.getElementById('results-count');
    const colorPalette = document.getElementById('color-palette');
    const filterSelect = document.getElementById('filter-select');
    const uploadedImage = document.getElementById('uploaded-image');
    const uploadedImageContainer = document.getElementById('uploaded-image-container');
    let currentResults = [];
    init();

    function init() {
        setupEventListeners();
        console.log('Visual Product Matcher initialized');
    }

    function setupEventListeners() {
        // Drag and drop functionality
        uploadBox.addEventListener('click', () => fileInput.click());
        
        uploadBox.addEventListener('dragover', handleDragOver);
        uploadBox.addEventListener('dragleave', handleDragLeave);
        uploadBox.addEventListener('drop', handleDrop);

        // File input change
        fileInput.addEventListener('change', handleImageSubmit);
        
        // URL submission
        urlSubmit.addEventListener('click', handleUrlSubmit);
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUrlSubmit();
        });

        // Filter selection
        filterSelect.addEventListener('change', filterResults);
    }

    function handleDragOver(e) {
        e.preventDefault();
        uploadBox.style.borderColor = '#667eea';
        uploadBox.style.background = '#edf2f7';
    }

    function handleDragLeave() {
        uploadBox.style.borderColor = '#a0aec0';
        uploadBox.style.background = '#f7fafc';
    }

    function handleDrop(e) {
        e.preventDefault();
        uploadBox.style.borderColor = '#a0aec0';
        uploadBox.style.background = '#f7fafc';
        
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                fileInput.files = e.dataTransfer.files;
                handleImageSubmit();
            } else {
                showError('Please drop an image file only');
            }
        }
    }

    async function handleImageSubmit() {
        if (fileInput.files.length === 0) return;
        const file = fileInput.files[0];
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
            showError('Please select an image file (JPEG, PNG, etc.)');
            return;
        }
        
        await searchWithImage(file);
    }

    async function handleUrlSubmit() {
        const url = urlInput.value.trim();
        if (!url) {
            showError('Please enter a valid image URL');
            return;
        }
        
        // Basic URL validation
        if (!isValidUrl(url)) {
            showError('Please enter a valid URL starting with http:// or https://');
            return;
        }
        
        await searchWithImageUrl(url);
    }

    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    async function searchWithImage(file) {
        resetUI();
        loadingEl.classList.remove('hidden');
        
        // Preview the uploaded image
        previewUploadedImage(file);

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            handleSearchResponse(data);
        } catch (err) {
            console.error('Search error:', err);
            showError('Failed to search. Please try again. ' + err.message);
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    async function searchWithImageUrl(url) {
        resetUI();
        loadingEl.classList.remove('hidden');
        
        // Preview the URL image
        previewUploadedImage(url);

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ imageUrl: url })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            handleSearchResponse(data);
        } catch (err) {
            console.error('Search error:', err);
            showError('Failed to search. Please check the URL and try again. ' + err.message);
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    function previewUploadedImage(source) {
        if (typeof source === 'string') {
            // URL source
            uploadedImage.src = source;
        } else {
            // File source
            const reader = new FileReader();
            reader.onload = function(e) {
                uploadedImage.src = e.target.result;
            };
            reader.readAsDataURL(source);
        }
        
        uploadedImageContainer.classList.remove('hidden');
        uploadedImage.onload = function() {
            this.classList.add('loaded');
        };
        uploadedImage.onerror = function() {
            this.classList.remove('loaded');
            console.warn('Could not preview uploaded image');
        };
    }

    function handleSearchResponse(data) {
        if (data.success) {
            currentResults = data.results;
            displayResults(currentResults);
            displayColorPalette(data.dominantColors);
            resultsCount.textContent = `Found ${currentResults.length} similar products`;
            resultsSection.classList.remove('hidden');
            
            // Scroll to results
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            showError(data.error || 'Search failed. Please try again.');
        }
    }

    function displayResults(products) {
        resultsContainer.innerHTML = '';
        
        if (products.length === 0) {
            resultsContainer.innerHTML = `
                <div class="no-results">
                    <p>No similar products found. Try a different image.</p>
                </div>
            `;
            return;
        }
        
        products.forEach(product => {
            const productEl = document.createElement('div');
            productEl.className = 'product-card';
            productEl.innerHTML = `
                <div class="product-image-container">
                    <img src="${product.imageUrl}" alt="${product.name}" 
                         onerror="this.src='https://via.placeholder.com/250x200/667eea/white?text=Image+Not+Found'" 
                         onload="this.style.opacity=1">
                    <div class="similarity-badge">${product.score}</div>
                </div>
                <div class="product-info">
                    <h3>${truncateText(product.name, 40)}</h3>
                    <p class="category">${product.category}</p>
                    ${product.price && product.price !== '0' ? `<p class="price">₹${formatPrice(product.price)}</p>` : ''}
                    <p class="description">${truncateText(product.description || 'No description available', 60)}</p>
                </div>
            `;
            resultsContainer.appendChild(productEl);
        });
    }

    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    function formatPrice(price) {
        // Convert to number and format with commas
        const num = parseFloat(price);
        if (isNaN(num)) return price;
        return num.toLocaleString('en-IN');
    }

    function displayColorPalette(colors) {
        colorPalette.innerHTML = '';
        
        if (!colors || colors.length === 0) {
            colorPalette.innerHTML = '<p>No colors detected</p>';
            return;
        }
        
        colors.forEach((color, index) => {
            const colorSwatch = document.createElement('div');
            colorSwatch.className = 'color-swatch';
            colorSwatch.style.backgroundColor = `rgb(${color.red}, ${color.green}, ${color.blue})`;
            colorSwatch.title = `Color ${index + 1}: RGB(${color.red}, ${color.green}, ${color.blue}) - Score: ${(color.score || 0).toFixed(2)}`;
            colorPalette.appendChild(colorSwatch);
        });
    }

    function filterResults() {
        const filterValue = filterSelect.value;
        let sortedResults = [...currentResults];

        switch (filterValue) {
            case 'score':
                sortedResults.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
                break;
            case 'name':
                sortedResults.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'price':
                sortedResults.sort((a, b) => {
                    const priceA = parseFloat(a.price) || 0;
                    const priceB = parseFloat(b.price) || 0;
                    return priceB - priceA; // Highest price first
                });
                break;
            default:
                // Default sort by score
                sortedResults.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
        }

        displayResults(sortedResults);
    }

    function resetUI() {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
        resultsSection.classList.add('hidden');
        resultsContainer.innerHTML = '';
        colorPalette.innerHTML = '';
        resultsCount.textContent = 'Found 0 products';
        
        // Keep uploaded image visible but clear results
        uploadedImageContainer.classList.remove('hidden');
    }

    function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        loadingEl.classList.add('hidden');
        
        // Scroll to error message
        errorEl.scrollIntoView({ behavior: 'smooth' });
    }

    // Utility function to test the API connection
    window.testConnection = async function() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            console.log('API Health:', data);
            alert(`API is working! Products loaded: ${data.products}`);
        } catch (error) {
            console.error('Connection test failed:', error);
            alert('Connection test failed. Please check if the server is running.');
        }
    };

    // Add CSS for new elements
    const additionalStyles = `
        .product-image-container {
            position: relative;
        }
        
        .similarity-badge {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(102, 126, 234, 0.9);
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-weight: bold;
            font-size: 0.8rem;
        }
        
        .no-results {
            text-align: center;
            padding: 40px;
            color: #718096;
        }
        
        .category {
            color: #48bb78;
            font-weight: 500;
            margin-bottom: 8px;
        }
        
        .description {
            color: #718096;
            font-size: 0.9rem;
            line-height: 1.4;
            margin-top: 8px;
        }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = additionalStyles;
    document.head.appendChild(styleSheet);
});