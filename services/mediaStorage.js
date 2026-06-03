const https = require('https');
const cloudinary = require('cloudinary').v2;

// Configure cloudinary directly from environment
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

async function cloudinaryUpload(options, filePath, buffer) {
  const source = filePath || `data:${options.mimetype || 'image/png'};base64,${buffer.toString('base64')}`;
  
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      source,
      { 
        ...options, 
        resource_type: 'auto'
      },
      (err, result) => {
        if (err) {
          console.error('Cloudinary upload error:', err);
          return reject(err);
        }
        resolve(result);
      }
    );
  });
}

async function uploadImage({ buffer, mimetype, filename, folder, filePath }) {
  console.log(`Uploading image to Cloudinary: folder=${folder}, filename=${filename}`);
  
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    throw new Error('Cloudinary is not configured in .env');
  }

  const result = await cloudinaryUpload(
    {
      resource_type: 'image',
      mimetype: mimetype,
      folder: folder ? `art-marketplace/${folder}` : 'art-marketplace/general'
    },
    filePath,
    buffer
  );

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    size: result.bytes
  };
}

module.exports = {
  uploadImage,
};

