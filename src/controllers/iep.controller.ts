import { Request, Response } from 'express';
import { PassThrough } from 'stream';
import * as iepService from '../services/iep.service';
import { currentUser } from '../middleware/auth';

export async function generate(req: Request, res: Response) {
  res.status(201).json({ iep: await iepService.generateIep(currentUser(req), req.params.id, req.body) });
}
export async function listForStudent(req: Request, res: Response) {
  res.json(await iepService.listIeps(currentUser(req), req.params.id, req.query as never));
}
export async function get(req: Request, res: Response) {
  const { iep } = await iepService.getAccessibleIep(currentUser(req), req.params.id);
  res.json({ iep });
}
export async function update(req: Request, res: Response) {
  res.json({ iep: await iepService.updateIep(currentUser(req), req.params.id, req.body) });
}
export async function approve(req: Request, res: Response) {
  res.json({ iep: await iepService.approveIep(currentUser(req), req.params.id) });
}
export async function pdf(req: Request, res: Response) {
  // Access is checked before any bytes are written, so errors still return JSON.
  const buffer = new PassThrough();
  const { filename } = await iepService.iepPdf(currentUser(req), req.params.id, buffer);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  buffer.pipe(res);
}
export async function updateGoal(req: Request, res: Response) {
  res.json({ goal: await iepService.updateGoal(currentUser(req), req.params.id, req.body) });
}
export async function addProgress(req: Request, res: Response) {
  res.status(201).json({ progress: await iepService.addProgress(currentUser(req), req.params.id, req.body) });
}
export async function listProgress(req: Request, res: Response) {
  res.json(await iepService.listProgress(currentUser(req), req.params.id, req.query as never));
}
export async function listAll(req: Request, res: Response) {
  res.json(await iepService.listAllIeps(currentUser(req), req.query as never));
}
export async function recentProgress(req: Request, res: Response) {
  res.json(await iepService.recentProgress(currentUser(req), Number(req.query.limit)));
}
