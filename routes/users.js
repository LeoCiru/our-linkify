const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("../models/users");

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

const generateToken = (data) => {
    return jwt.sign(data, process.env.JWT_KEY);
}

module.exports = router;