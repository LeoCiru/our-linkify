const multer = require("multer");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/posts')
  },
  filename: function (req, file, cb) {
    const timestamps = Date.now();
    const originalName = file.originalname.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, "");
    cb(null, `${timestamps}-${originalName}`);
  }
});

function fileFilter (req, file, cb) {

  // The function should call `cb` with a boolean
  // to indicate if the file should be accepted
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/mov"];

  if (allowedTypes.includes(file.mimetype)) {
    // To accept the file pass `true`, like so:
    cb(null, true)
  } else {
    // You can always pass an error if something goes wrong:
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, MP4 or MOV are allowed.'), false)
  };
};

const uploadPost = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 },
});

module.exports = uploadPost;