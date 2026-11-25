import { Request, Response } from 'express';
import * as messageService from '../services/message.service';
import { currentUser } from '../middleware/auth';

export async function list(req: Request, res: Response) {
  res.json(await messageService.listMessages(currentUser(req), req.params.id, req.query as never));
}
export async function create(req: Request, res: Response) {
  res.status(201).json({ message: await messageService.createMessage(currentUser(req), req.params.id, req.body) });
}
export async function markRead(req: Request, res: Response) {
  res.json({ message: await messageService.markRead(currentUser(req), req.params.id) });
}
