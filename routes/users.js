const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("../models/users");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/", async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: "Missing required form fields!" });
    };

    const user = await User.findOne({
        $or: [{ username: username }, { email: email }]
    });

    console.log(user);

    if (user) {
        return res.status(400).json({
            success: false,
            message: user.username === username ? "Username is already taken!" : "Email is already taken!",
        });
    };

    const hashedPass = await bcrypt.hash(password, 10);

    const newUser = await User({
        username,
        email,
        password: hashedPass,
    });

    await newUser.save();

    console.log(newUser);

    const token = generateToken({
        _id: newUser._id,
        username: newUser.username
    });

    res.status(201).json({ success: true, message: "User registered successfully!", token });
});

router.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "Username and password are required!"
        });
    };

    const user = await User.findOne({ username });

    if (!user) {
        return res.status(401).json({
            success: false,
            message: "Invalid credentials!"
        });
    };

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
        return res.status(401).json({
            success: false,
            message: "Invalid credentials!"
        });
    };

    const token = generateToken({
        _id: user.id,
        username: user.username
    });

    res.json(token);
});

router.get("/", authMiddleware, async (req, res) => {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
        return res.status(404).json({
            status: false,
            message: "User not found",
        });
    };

    res.json(user);
});

const generateToken = (data) => {
    return jwt.sign(data, process.env.JWT_KEY);
}

module.exports = router;