import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { currentUser } from '../middleware/auth';

export async function registerSchool(req: Request, res: Response) {
  res.status(201).json(await authService.registerSchool(req.body));
}

export async function login(req: Request, res: Response) {
  res.json(await authService.login(req.body.email, req.body.password));
}

export async function refresh(req: Request, res: Response) {
  res.json(await authService.refresh(req.body.refreshToken));
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.body.refreshToken);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ user: await authService.me(currentUser(req).id) });
}
