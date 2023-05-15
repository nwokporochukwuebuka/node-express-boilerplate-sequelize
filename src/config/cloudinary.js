const cloudinary = require('cloudinary').v2;

const multer = require('multer');
const path = require('path');
const config = require('./config');

// multer config
const upload = multer({
  storage: multer.diskStorage({}),
  limits: {
    fileSize: 1000000, // 1MB
  },
  fileFilter: (req, file, cb) => {
    let ext = path.extname(file.originalname);
    if (ext != '.jpg' && ext !== '.jpeg' && ext !== '.png') {
      cb(new Error('File type od not supported'), false);
      return;
    }
    cb(null, true);
  },
});


cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.secretKey,
});

// eslint-disable-next-line no-unused-vars
exports.uploads = (file, folder) => {
  return new Promise((resolve) => {
    cloudinary.uploader.upload(file, (result) => {
      resolve({
        // url: result?.secure_url,
        // public_id: result?.public_id,
      });
    });
  });
};

exports.delete = async (file) => {
  // eslint-disable-next-line no-return-await
  return await cloudinary.uploader.destroy(file);
};
