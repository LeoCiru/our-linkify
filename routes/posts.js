const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const uploadPost = require("../config/multer-upload");
const path = require("path");
const fs = require("fs/promises");
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

router.delete("/:postId", authMiddleware, async (req, res) => {
    const postId = req.params.postId;
    const userId = req.user._id;

    const post = await Post.findById(postId);

    if (!post) {
        return res.status(404).json({
            success: false,
            message: "Post not found!"
        });
    };

    if (post.user.toString() !== userId) {
        return res.status(403).json({
            success: false,
            message: "Unauthorized to delete this post"
        });
    };

    post.media.forEach(async (file) => {
        const filePath = path.join(__dirname, "../uploads/posts", file.name)
        
        try {
            await fs.unlink(filePath);
        } catch (error) {
            console.error(`Error in deleting file: ${filePath}`, error);
        };
    });

    await post.deleteOne();

    res.json({
        success: true,
        message: "Post deleted successfully!"
    });
});

router.patch("/:postId", authMiddleware, async (req, res) => {
    const postId = req.params.postId;
    const userId = req.user._id;

    const post = await Post.findById(postId);

    if (!post) {
        return res.status(404).json({
            success: false,
            message: "Post not found!"
        });
    };

    const alreadyLiked = post.likes.includes(userId);

    const updatedPost = await Post.findByIdAndUpdate(postId, alreadyLiked ? { $pull: { likes: userId } } : { $addToSet: { likes: userId } }, { new: true });

    res.json({
        success: true,
        message: alreadyLiked ? "Post unliked!" : "Post liked!",
        likes: updatedPost.likes.length,
    });
});

router.post("/:postId/comments", authMiddleware, async (req, res) => {
    const postId = req.params.postId;
    const userId = req.user._id;
    const text = req.body.text;

    if (!text) {
        return res.status(400).json({
            success: false,
            message: "Comment text is required!"
        });
    };

    const newComment = {
        user: userId,
        text: text
    };

    const post = await Post.findByIdAndUpdate(postId, { $push: { comments: newComment } }, { new: true });

    res.status(201).json({
        success: true,
        message: "Comment added successfully!",
        comment: post.comments[post.comments.length - 1]
    });
});

router.post("/:postId/comments/:commentId/replies", authMiddleware, async (req, res) => {
    const postId = req.params.postId;
    const commentId = req.params.commentId;
    const userId = req.user._id;
    const text = req.body.text;

    if (!text) {
        return res.status(400).json({
            success: false,
            message: "Comment text is required!"
        });
    };

    const newReply = {
        user: userId,
        text: text
    };

    const post = await Post.findOneAndUpdate({_id: postId, "comments._id": commentId}, { $push: { "comments.$.replies": newReply } }, { new: true });

    const comment = post.comments.id(commentId) // .id() is a method of Mongoose

    res.status(201).json({
        success: true,
        message: "Reply added successfully!",
        reply: comment.replies[comment.replies.length - 1]
    });
});

router.delete("/:postId/comments/:commentId", authMiddleware, async (req, res) => {
    const postId = req.params.postId;
    const commentId = req.params.commentId;
    const userId = req.user._id;
    
    const post = await Post.findOneAndUpdate(
        {
            _id: postId,
            $or: [
                { user: userId }, 
                { "comments._id": commentId, "comments.user": userId }
            ],
        },
        { $pull: { comments: { _id: commentId } } },
        { new: true }
    );

    if (!post) {
        return res.status(403).json({
            success: false,
            message: "Unauthorized or post/comment not found!"
        });
    };

    res.json({
        success: true,
        message: "Comment deleted successfully!",
        comments: post.comments,
    });
});

module.exports = router;