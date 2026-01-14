const authMiddleware = require("../middlewares/authMiddleware");
const Chat = require("../models/chats");

const router = require("express").Router();

router.get("/", authMiddleware, async (req, res) => {
    const userId = req.user._id;

    const chats = await Chat.find({ participants: userId })
                            .populate("participants", "_id username")
                            .populate({
                                path: "lastMessage",
                                select: "sender content createdAt",
                                populate: {
                                    path: "sender",
                                    select: "username"
                                }
                            })
                            .sort({ updatedAt: -1 });

    res.json({
        success: true,
        chats
    });
})

module.exports = router;