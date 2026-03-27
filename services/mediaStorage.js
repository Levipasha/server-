const https = require('https');

function cloudinaryUploadStream(cloudinary, options, buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

function randomKey(prefix, originalName = 'upload') {
  const safe = String(originalName).replace(/[^a-z0-9._-]/gi, '-').toLowerCase();
  return `${prefix}/${Date.now()}-${Math.random().toString(16).slice(2)}-${safe}`;
}

async function uploadImage({ provider, buffer, mimetype, filename, folder, cloudinary, bunny }) {
  if (provider === 'bunny') {
    const {
      storageZone,
      accessKey,
      cdnBaseUrl,
      storageHost = 'storage.bunnycdn.com',
      pathPrefix = 'art-marketplace'
    } = bunny || {};

    if (!storageZone || !accessKey || !cdnBaseUrl) {
      throw new Error('Bunny storage is not configured (missing BUNNY_* env vars)');
    }

    const key = randomKey(`${pathPrefix}/${folder || 'general'}`, filename);
    const putPath = `/${encodeURIComponent(storageZone)}/${key}`;

    await new Promise((resolve, reject) => {
      const req = https.request(
        {
          method: 'PUT',
          hostname: storageHost,
          path: putPath,
          headers: {
            AccessKey: accessKey,
            'Content-Type': mimetype || 'application/octet-stream',
            'Content-Length': buffer.length
          }
        },
        (res) => {
          const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
          if (!ok) return reject(new Error(`Bunny upload failed (${res.statusCode})`));
          resolve();
        }
      );
      req.on('error', reject);
      req.write(buffer);
      req.end();
    });

    return {
      url: `${cdnBaseUrl.replace(/\/$/, '')}/${key}`,
      publicId: key
    };
  }

  // default: cloudinary
  const result = await cloudinaryUploadStream(
    cloudinary,
    {
      resource_type: 'image',
      folder: folder ? `art-marketplace/${folder}` : 'art-marketplace/general'
    },
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

