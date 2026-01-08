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

router.post("/request-password-reset", async (req, res) => {
    const { email } = req.body;

    let user = await User.findOne({ email: email });

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found!"
        });
    };

    const resetToken = jwt.sign({ _id: user._id }, process.env.JWT_KEY, { expiresIn: "1h" });

    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    // Send email with this token

    res.json({
        success: true,
        message: "Password reset link sent to email",
        resetToken: resetToken // TODO: after sending email, we do not need to pass reset token in the response
    });
});

router.post("/reset-password", async (req, res) => {
    const { resetToken, newPassword } = req.body;

    const decodedUser = jwt.verify(resetToken, process.env.JWT_KEY);

    const user = await User.findById(decodedUser._id);

    if (!user || user.resetToken !== resetToken || user.resetTokenExpires <= Date.now()) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpires = null;
    await user.save();

    res.json({
        success: true,
        message: "Password updated successfully!"
    });
});

router.post("/:userId/follow", authMiddleware, async (req, res) => {
    const userId = req.params.userId;
    const currentUserId = req.user._id;

    if (currentUserId === userId) {
        return res.status(400).json({
            success: false,
            message: "You cannot follow yourself!"
        });
    };

    const userToFollow = await User.findById(userId);

    if (!userToFollow) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };


    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };

    if (userToFollow.isPrivate) {
        if (userToFollow.followRequests.includes(currentUserId)) {
            return res.status(400).json({
                success: false,
                message: "Follow request already sent!"
            });
        } else {
            userToFollow.followRequests.push(currentUserId);
            await userToFollow.save();
    
            return res.json({
                success: true,
                message: "Follow request sent!"
            });
        };

    } else {
        if (userToFollow.followers.includes(currentUserId)) {
            return res.status(400).json({
                success: false,
                message: "Already following the user!"
            });
        } else {
            userToFollow.followers.push(currentUserId);
            currentUser.following.push(userId);
    
            await userToFollow.save();
            await currentUser.save();
    
            return res.json({
                success: true,
                message: "User followed successfully!"
            });
        }
    };
});

router.post("/reject-request/:requesterId", authMiddleware, async (req, res) => {
    const requesterId = req.params.requesterId;
    const currentUserId = req.user._id;

    if (currentUserId === requesterId) {
        return res.status(400).json({
            success: false,
            message: "You cannot unfollow yourself!"
        });
    };

    const requesterUser = await User.findById(requesterId);

    if (!requesterUser) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };

    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };

    if (!currentUser.followRequests.includes(requesterId)) {
        return res.status(400).json({
            success: false,
            message: "No follow request found!"
        });
    };

    const updatedRequests = currentUser.followRequests.filter(id => id.toString() !== requesterId);

    currentUser.followRequests = updatedRequests;
    await currentUser.save();

    res.json({
        sucess: true,
        message: "Follow request rejected successfully!"
    });
});


router.post("/accept-request/:requesterId", authMiddleware, async (req, res) => {
    const requesterId = req.params.requesterId;
    const currentUserId = req.user._id;

    if (currentUserId === requesterId) {
        return res.status(400).json({
            success: false,
            message: "You cannot follow yourself!"
        });
    };

    const requesterUser = await User.findById(requesterId);

    if (!requesterUser) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };

    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };

    if (!currentUser.followRequests.includes(requesterId)) {
        return res.status(400).json({
            success: false,
            message: "No follow request found!"
        });
    };

    
    if (currentUser.followers.includes(requesterId)) {
        return res.status(400).json({
            success: false,
            message: "Follow request already accepted!"
        });
    };
    
    const updatedRequests = currentUser.followRequests.filter(id => id.toString() !== requesterId);

    currentUser.followRequests = updatedRequests;
    currentUser.followers.push(requesterId);
    requesterUser.following.push(currentUserId);
    await currentUser.save();
    await requesterUser.save();

    res.json({
        sucess: true,
        message: "Follow request accepted successfully!"
    });
});

router.get("/:userId/followers", authMiddleware, async (req, res) => {
    const userId = req.params.userId;
    const currentUserId = req.user._id;

    if (currentUserId === userId) {
        return res.status(400).json({
            success: false,
            message: "You cannot follow yourself!"
        });
    };

    const user = await User.findById(userId).populate("followers", "_id username");

    if (!user) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };

    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };

    if (currentUser.following.includes(userId) || !user.isPrivate) {
        res.json(user.followers);
    } else {
        return res.status(400).json({
            success: false,
            message: "You cannot get followers list - Account is private."
        });
    };
});

router.get("/:userId/following", authMiddleware, async (req, res) => {
    const userId = req.params.userId;
    const currentUserId = req.user._id;

    if (currentUserId === userId) {
        return res.status(400).json({
            success: false,
            message: "You cannot follow yourself!" // TODO: fix this message
        });
    };

    const user = await User.findById(userId).populate("following", "_id username");

    if (!user) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };

    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };

    if (currentUser.following.includes(userId) || !user.isPrivate) {
        res.json(user.following);
    } else {
        return res.status(400).json({
            success: false,
            message: "You cannot get followers list - Account is private."
        });
    };
});

router.post("/:userId/unfollow", authMiddleware, async (req, res) => {
    const userId = req.params.userId;
    const currentUserId = req.user._id;

    if (currentUserId === userId) {
        return res.status(400).json({
            success: false,
            message: "You cannot unfollow yourself!"
        });
    };

    const userToUnfollow = await User.findById(userId);

    if (!userToUnfollow) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };


    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
        return res.status(400).json({
            success: false,
            message: "User not found!"
        });
    };

    if (!userToUnfollow.followers.includes(currentUserId)) {
        return res.status(400).json({
            success: false,
            message: "User is not available in the followers"
        });
    };

    userToUnfollow.followers = userToUnfollow.followers.filter(id => id.toString() !== currentUserId);
    currentUser.following = currentUser.following.filter(id =>  id.toString() !== userId);
    await userToUnfollow.save();
    await currentUser.save();

    res.json({
        success: true,
        message: "User unfollowed successfully!"
    });
});

const generateTokens = (data) => {
    const accessToken = jwt.sign(data, process.env.JWT_KEY); // TODO: Add expiry time in production
    const refreshToken = jwt.sign({ _id: data._id }, process.env.REFRESH_JWT_KEY, { expiresIn: "30d" });

    return { accessToken, refreshToken }
}

module.exports = router;