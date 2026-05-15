import express from "express";
import { handleTwilioWebhook } from "./webhooks/twilio.js";
import { handleStatusCallback } from "./webhooks/status.js";

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "whatsapp-agent" });
});

app.post("/webhook", handleTwilioWebhook);
app.post("/webhook/status", handleStatusCallback);

export { app };
