const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const uploadPost = require("../config/multer-upload");
const Post = require("../models/posts");
const User = require("../models/users");
const router = express.Router();

router.post("/", authMiddleware, uploadPost.array("media", 10), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({
            success: false,
            message: "At least one media file is required!"
        });
    };

    const { caption, tags, location } = req.body;
    const media = req.files.map(file => {
        return {
            name: file.filename,
            mediaType: file.mimetype.startsWith("image") ? "image": "video"
        };
    });

    const newPost = new Post({
        user: req.user._id,
        caption,
        media,
        tags,
        location,
    });

    await newPost.save()
    res.status(201).json({
        success: true,
        message: "Post uploaded successfully!",
        post: newPost,
    });
});

router.get("/myposts", authMiddleware, async (req, res) => {
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const posts = await Post.find({ user: req.user._id })
                                .skip((page - 1) * limit)
                                .limit(limit); // TODO: add .lean()

    const hasNextPage = posts.length === limit ? true : false;

    res.json({
        success: true,
        posts: posts,
        page,
        limit,
        hasNextPage
    });
});

router.get("/following", authMiddleware, async (req, res) => {
    let { page = 1, limit = 10, cursor } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const user = await User.findById(req.user._id).select("following");

    let query = { user: { $in: user.following } }
    
    if (cursor) {
        query.createdAt = { $lt: new Date(cursor) };
    }

    const posts = await Post.find(query)
                            .populate("user", "_id username profileName")
                            .sort({ createdAt: -1 })
                            .skip((page - 1) * limit)
                            .limit(limit)
                            // TODO: add .lean()

    const nextCursor = posts.length > 0 ? posts[posts.length - 1].createdAt : null;
    const hasNextPage = posts.length === limit ? true : false;

    res.json({
        success: true,
        posts,
        nextCursor,
        hasNextPage
    });
});

module.exports = router;