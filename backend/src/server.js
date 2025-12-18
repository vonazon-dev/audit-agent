import express from "express";
import dotenv from "dotenv";
import oauthRoutes from "./routes/oauth.js";

dotenv.config();

const app = express();
app.use(oauthRoutes);

app.get("/", (_, res) => res.send("Audit Agent backend running"));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () =>
    console.log(`Backend running on port ${PORT}`)
);
