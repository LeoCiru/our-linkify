require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const http = require("http");

const userRoutes = require("./routes/users");
const postRoutes = require("./routes/posts");
const chatRoutes = require("./routes/chats");

const logger = require("./config/logger")

const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

mongoose.connect(process.env.DB)
    .then(() => console.log("MongoDB Connected Successfully!"))
    .catch((err) => {
        logger.error("MongoDB connection failed")
        logger.on("finish", () => {
            process.exit(1);
        });
        logger.end();
    });

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use("/api/user/", userRoutes);
app.use("/api/posts/", postRoutes);
app.use("/api/chats/", chatRoutes);

app.use((error, req, res, next) => {
    console.log(error);
    logger.error(error.message, {
        stack: error.stack,
        method: req.method,
        path: req.originalUrl,
    });

    return res.status(500).json({ success: false, message: "Internal Server Error!" });
});

io.on("connection", (socket) => {
    console.log("A user has connected!");

    socket.on("sendMessage", (data) => {
        console.log(data);
        io.emit("getMessage", data);
    });
});

server.listen( PORT, () => console.log(`Server is running on port ${PORT}...`) );