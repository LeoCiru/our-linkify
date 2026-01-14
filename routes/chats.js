const authMiddleware = require("../middlewares/authMiddleware");
const Chat = require("../models/chats");
const Message = require("../models/messages");

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
});

router.get("/:chatId/messages", authMiddleware, async (req, res) => {
    const { chatId } = req.params;

    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const messages = await Message.find({ chatId })
                                    .populate("sender", "_id username")
                                    .sort({ createdAt: -1 })
                                    .skip((page - 1) * limit)
                                    .limit(10)
                                    .lean();

    const hasPreviousMessages = messages.length === limit ? true : false;

    res.json({
        success: true,
        hasPreviousMessages,
        page,
        limit
    });
});

module.exports = router;