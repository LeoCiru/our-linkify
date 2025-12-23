const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            status: false,
            message: "Authorization token needed!"
        });
    };
    
    try {
        const token = authHeader.split(" ")[1];
        const decodedToken = jwt.verify(token, process.env.JWT_KEY);
    
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: "Invalid token!"
        });
    };

};

module.exports = authMiddleware;