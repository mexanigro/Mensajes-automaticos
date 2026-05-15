import type { Request, Response } from "express";

export async function handleStatusCallback(req: Request, res: Response): Promise<void> {
  const { MessageSid, MessageStatus, To } = req.body;
  console.log(`[status] ${MessageSid}: ${MessageStatus} -> ${To}`);
  res.status(200).send("OK");
}
