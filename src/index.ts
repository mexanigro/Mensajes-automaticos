import { env } from "./config/env.js";
import { app } from "./server.js";

const PORT = env.port;

app.listen(PORT, () => {
  console.log(`[whatsapp-agent] Servidor corriendo en puerto ${PORT}`);
  console.log(`[whatsapp-agent] Webhook: POST /webhook`);
  console.log(`[whatsapp-agent] Health: GET /`);
});
