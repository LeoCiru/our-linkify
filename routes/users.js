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

    const { accessToken, refreshToken } = generateTokens({
        _id: newUser._id,
        username: newUser.username
    });

    const newHashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    newUser.refreshToken = newHashedRefreshToken;
    await newUser.save();

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false, // TODO: change to true when it is in production
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.status(201).json({ success: true, message: "User registered successfully!", accessToken });
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

    const { accessToken, refreshToken } = generateTokens({
        _id: user.id,
        username: user.username
    });
    
    const newHashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    user.refreshToken = newHashedRefreshToken;
    await user.save();

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false, // TODO: change to true when it is in production
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json(accessToken);
});

router.post("/refresh", async (req, res) => {
    const userRefreshToken = req.cookies.refreshToken;

    if (!userRefreshToken) {
        return res.status(401).json({
            success: false,
            message: "No refresh token provided!"
        });
    };

    let decodedUser;

    try {
        decodedUser = jwt.verify(userRefreshToken, process.env.REFRESH_JWT_KEY);
    } catch (error) {
        return res.status(403).json({
            success: false,
            message: "Invalid refresh token!"
        });
    };

    const user = await User.findById(decodedUser._id);

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found!"
        });
    };

    const isValid = await bcrypt.compare(userRefreshToken, user.refreshToken);

    if (!isValid) {
        return res.status(403).json({
            success: false,
            message: "Refresh token is not valid!"
        });
    };

    const { accessToken, refreshToken } = generateTokens({
        _id: user.id,
        username: user.username
    });
    
    const newHashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    user.refreshToken = newHashedRefreshToken;
    await user.save();

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false, // TODO: change to true when it is in production
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json(accessToken);
});


router.post("/logout", async (req, res) => {
    const userRefreshToken = req.cookies.refreshToken;

    if (!userRefreshToken) {
        return res.status(401).json({
            success: false,
            message: "No refresh token provided!"
        });
    };

    let decodedUser;

    try {
        decodedUser = jwt.verify(userRefreshToken, process.env.REFRESH_JWT_KEY);
    } catch (error) {
        return res.status(403).json({
            success: false,
            message: "Invalid refresh token!"
        });
    };

    const user = await User.findById(decodedUser._id);

    if (!user) {
        return res.status(404).json({
            status: false,
            message: "User not found!"
        });
    };

    user.refreshToken = null;
    await user.save();

    res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: false, // TODO: change to true when it is in production
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({
        success: true,
        message: "Logged out successfully!"
    });
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

const generateTokens = (data) => {
    const accessToken = jwt.sign(data, process.env.JWT_KEY); // TODO: Add expiry time in production
    const refreshToken = jwt.sign({ _id: data._id }, process.env.REFRESH_JWT_KEY, { expiresIn: "30d" });

    return { accessToken, refreshToken }
}

module.exports = router;