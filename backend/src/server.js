import express from "express";
import dotenv from "dotenv";
import oauthRoutes from "./routes/oauth.js";
import auditRoutes from "./routes/audit.js";

dotenv.config();

const app = express();
app.use(express.json()); // Enable JSON body parsing for POST /audit
app.use(oauthRoutes);
app.use(auditRoutes);

app.get("/", (_, res) => res.send("Audit Agent backend running"));

const PORT = process.env.PORT || 3000;

// Debugging: Log exit reason
process.on('exit', (code) => {
    console.log(`Process exiting with code: ${code}`);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

const server = app.listen(PORT, () =>
    console.log(`Backend running on port ${PORT}`)
);

server.on('error', (e) => {
    console.error('Server Error:', e);
});
