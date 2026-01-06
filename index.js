require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");

const userRoutes = require("./routes/users");

const app = express();
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.DB)
    .then(() => console.log("MongoDB Connected Successfully!"))
    .catch((err) => console.log(`MongoDB Connection Failed: ${err}`));

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use("/api/user", userRoutes);


app.listen( PORT, () => console.log(`Server is running on port ${PORT}...`) );