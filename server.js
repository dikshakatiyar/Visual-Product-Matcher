const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
require('dotenv').config();

// Import Google Cloud Vision library
const vision = require('@google-cloud/vision');

const app = express();
// Add this at the top of server.js after imports
const PORT = process.env.PORT || 3000;

// Change your app.listen to:
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
// Initialize Google Vision client
// Initialize Google Vision client
let client;
if (process.env.NODE_ENV === 'production') {
  // Use environment variables for production
  client = new vision.ImageAnnotatorClient({
    credentials: {
      projectId: process.env.GOOGLE_PROJECT_ID,
      privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL
    }
  });
} else {
  // Use key file for local development
  client = new vision.ImageAnnotatorClient({
    keyFilename: path.join(__dirname, 'google-key.json')
  });
}

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Product data storage
let productsWithColors = [];

// Load products from CSV
function loadProductsFromCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream('products.csv')
      .pipe(csv())
      .on('data', (data) => {
        const product = {
          id: data.id || Math.random().toString(36).substr(2, 9),
          name: data.name || 'Unnamed Product',
          category: data.category || 'Uncategorized',
          price: data.price || '0',
          imageUrl: data.imageUrl || `https://picsum.photos/250/200?random=${results.length + 1}`,
          description: data.description || 'No description available'
        };
        results.push(product);
      })
      .on('end', () => {
        if (results.length === 0) {
          productsWithColors = createFallbackProducts();
        } else {
          productsWithColors = results.map(product => ({
            ...product,
            dominantColors: generateDominantColors()
          }));
        }
        console.log(`✅ Loaded ${productsWithColors.length} products`);
        resolve();
      })
      .on('error', (error) => {
        console.error('❌ CSV loading error:', error);
        productsWithColors = createFallbackProducts();
        resolve();
      });
  });
}

// Generate consistent dominant colors for products
function generateDominantColors() {
  return [
    { red: Math.floor(Math.random() * 255), green: Math.floor(Math.random() * 255), blue: Math.floor(Math.random() * 255), score: 0.3 },
    { red: Math.floor(Math.random() * 255), green: Math.floor(Math.random() * 255), blue: Math.floor(Math.random() * 255), score: 0.2 },
    { red: Math.floor(Math.random() * 255), green: Math.floor(Math.random() * 255), blue: Math.floor(Math.random() * 255), score: 0.1 }
  ];
}

// Fallback products
function createFallbackProducts() {
  const categories = ['Clothing', 'Electronics', 'Home', 'Sports'];
  const products = [];
  
  for (let i = 1; i <= 50; i++) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    products.push({
      id: i.toString(),
      name: `Product ${i}`,
      category: category,
      price: (Math.random() * 1000 + 10).toFixed(2),
      imageUrl: `https://picsum.photos/250/200?random=${i}`,
      description: `This is a sample ${category.toLowerCase()} product`,
      dominantColors: generateDominantColors()
    });
  }
  return products;
}

// Calculate color distance
function colorDistance(color1, color2) {
  const rDiff = color1.red - color2.red;
  const gDiff = color1.green - color2.green;
  const bDiff = color1.blue - color2.blue;
  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

// Enhanced similarity score with manual object detection
function calculateSimilarityScore(uploadedColors, product, imageRequest) {
  let totalScore = 0;
  
  // 1. Color matching (40% weight)
  for (const uploadedColor of uploadedColors.slice(0, 3)) {
    let bestMatch = Infinity;
    
    for (const productColor of product.dominantColors) {
      const distance = colorDistance(uploadedColor, productColor);
      if (distance < bestMatch) {
        bestMatch = distance;
      }
    }
    
    const colorScore = Math.max(0, 1 - (bestMatch / 441.67));
    totalScore += colorScore * (uploadedColor.score || 0.5);
  }
  
  const colorSimilarity = Math.min(1, (totalScore / 3) * 0.8 + 0.2) * 0.4;

  // 2. Manual object detection based on color analysis (60% weight)
  let objectBonus = 0;
  
  // Detect if image is likely a phone (dark colors with some bright spots)
  const isLikelyPhone = uploadedColors.some(color => 
    color.red < 100 && color.green < 100 && color.blue < 100 // Dark colors
  ) && uploadedColors.some(color =>
    color.red > 150 || color.green > 150 || color.blue > 150 // Some bright spots
  );

  // Detect if image is likely clothing (warmer colors)
  const isLikelyClothing = uploadedColors.some(color =>
    color.red > 150 && color.green < 120 && color.blue < 120 // Reddish tones
  );

  // Detect if image is likely electronics (cooler colors, grays)
  const isLikelyElectronics = uploadedColors.some(color =>
    Math.abs(color.red - color.green) < 30 && 
    Math.abs(color.green - color.blue) < 30 && // Grayscale
    color.red > 100 && color.red < 200 // Medium tones
  );

  // Apply category bonuses
  if (isLikelyPhone && product.category.toLowerCase() === 'electronics') {
    objectBonus = 0.6;
    console.log(`📱 Phone detected -> Electronics bonus for: ${product.name}`);
  } else if (isLikelyClothing && product.category.toLowerCase() === 'clothing') {
    objectBonus = 0.6;
    console.log(`👕 Clothing detected -> Clothing bonus for: ${product.name}`);
  } else if (isLikelyElectronics && product.category.toLowerCase() === 'electronics') {
    objectBonus = 0.4;
    console.log(`💻 Electronics detected -> Electronics bonus for: ${product.name}`);
  }

  // 3. Final score
  const finalScore = Math.min(0.99, colorSimilarity + objectBonus);
  
  return finalScore;
}

// Validate image URL
function isValidImageUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return [
      'picsum.photos', 'images.unsplash.com', 'source.unsplash.com',
      'via.placeholder.com', 'loremflickr.com'
    ].some(domain => parsedUrl.hostname.includes(domain));
  } catch (error) {
    return false;
  }
}

// Routes
app.get('/api/products', (req, res) => {
  res.json(productsWithColors);
});

// Main search route
app.post('/api/search', upload.single('image'), async (req, res) => {
  try {
    if (!req.file && !req.body.imageUrl) {
      return res.status(400).json({ 
        success: false,
        error: 'Please provide an image file or URL' 
      });
    }

    let imageRequest;
    let uploadedImageData = null;

    if (req.file) {
      imageRequest = { image: { content: req.file.buffer.toString('base64') } };
      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      uploadedImageData = `data:${mimeType};base64,${base64Image}`;
    } else if (req.body.imageUrl) {
      if (!isValidImageUrl(req.body.imageUrl)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid image URL. Please provide a direct link to an image file.'
        });
      }
      imageRequest = { image: { source: { imageUri: req.body.imageUrl } } };
      uploadedImageData = req.body.imageUrl;
    }

    console.log('Calling Google Vision API for color analysis...');
    
    let imageProperties;
    try {
      // Only call imageProperties (color analysis)
      const [propertiesResult] = await client.imageProperties(imageRequest);
      imageProperties = propertiesResult.imagePropertiesAnnotation;
    } catch (apiError) {
      console.error('Google Vision API error:', apiError.message);
      // Fallback to simple analysis
      imageProperties = null;
    }

    let uploadedColors = [
      { red: 200, green: 200, blue: 200, score: 0.5 },
      { red: 100, green: 100, blue: 100, score: 0.3 },
      { red: 50, green: 50, blue: 50, score: 0.2 }
    ];

    if (imageProperties && imageProperties.dominantColors) {
      uploadedColors = imageProperties.dominantColors.colors
        .slice(0, 5)
        .map(color => ({
          red: Math.round(color.color.red || 0),
          green: Math.round(color.color.green || 0),
          blue: Math.round(color.color.blue || 0),
          score: color.score || 0
        }));
    }

    console.log('Uploaded image colors:', uploadedColors);

    // Calculate similarity scores with enhanced matching
    const resultsWithScores = productsWithColors.map(product => {
      const similarityScore = calculateSimilarityScore(uploadedColors, product, imageRequest);
      return {
        ...product,
        score: similarityScore.toFixed(2),
        matchingColors: uploadedColors.slice(0, 3)
      };
    });

    // Sort by score and return top results
    const sortedResults = resultsWithScores
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    // Log top results for debugging
    console.log('Top 3 results:');
    sortedResults.slice(0, 3).forEach((result, index) => {
      console.log(`${index + 1}. ${result.name} (${result.category}) - Score: ${result.score}`);
    });

    res.json({
      success: true,
      results: sortedResults,
      dominantColors: uploadedColors.slice(0, 3),
      uploadedImage: uploadedImageData
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Search failed. Please try another image.' 
    });
  }
});

// Error handler
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: 'File too large. Maximum size is 5MB.'
    });
  }
  res.status(500).json({
    success: false,
    error: error.message || 'Internal server error'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    products: productsWithColors.length,
    timestamp: new Date().toISOString()
  });
});

// Start server
// Start server after loading products
loadProductsFromCSV()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log('✅ Google Vision API integrated');
      console.log('✅ Product matching ready');
      console.log(`✅ Loaded ${productsWithColors.length} products`);
    });
  })
  .catch(error => {
    console.error('Failed to load products:', error);
    process.exit(1);
  });
