import { Request, Response } from 'express';
import * as userService from '../services/user.service';
import { currentUser } from '../middleware/auth';

export async function create(req: Request, res: Response) {
  res.status(201).json(await userService.createUser(currentUser(req), req.body));
}
export async function list(req: Request, res: Response) {
  res.json(await userService.listUsers(currentUser(req), req.query as never));
}
export async function update(req: Request, res: Response) {
  res.json({ user: await userService.updateUser(currentUser(req), req.params.id, req.body) });
}
