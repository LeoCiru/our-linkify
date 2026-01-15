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

router.post("/createChat", authMiddleware, async (req, res) => {
    const userId = req.user._id;
    const receiverId = req.body.receiverId;

    if (!receiverId) {
        return res.status(400).json({
            success: false,
            message: "Receiver required!"
        });
    };

    let chat = await Chat.findOne({ participants: { $all: [userId, receiverId], $size: 2 } });

    if (!chat) {
        chat = new Chat({
            participants: [userId, receiverId],
        });
        await chat.save();
    };

    res.status(201).json({
        success: true,
        chat
    });
});

router.post("/sendMessages", authMiddleware, async (req, res) => {
    const userId = req.user._id;
    const { content, chatId } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat || !chat.participants.includes(userId)) {
        return res.status(403).json({
            success: false,
            message: "Access denied!"
        });
    };

    if (!content) {
        return res.status(400).json({
            success: false,
            message: "Content (text message) is required!"
        });
    };

    const newMessage = new Message({
        chatId: chat._id,
        sender: userId,
        content
    });

    await newMessage.save();

    chat.lastMessage = newMessage._id;
    await chat.save();

    const populateMessage = await Message.findById(newMessage._id).populate("sender", "_id username");

    res.status(201).json({
        success: true,
        newMessage: populateMessage
    });
});

module.exports = router;