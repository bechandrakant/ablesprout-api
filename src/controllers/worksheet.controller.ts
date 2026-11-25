import { Request, Response } from 'express';
import { PassThrough } from 'stream';
import * as worksheetService from '../services/worksheet.service';
import { currentUser } from '../middleware/auth';

export async function generate(req: Request, res: Response) {
  res.status(201).json({ worksheet: await worksheetService.generateWorksheet(currentUser(req), req.params.id, req.body) });
}
export async function adapt(req: Request, res: Response) {
  res.status(201).json({ worksheet: await worksheetService.adaptWorksheet(currentUser(req), req.body) });
}
export async function listForStudent(req: Request, res: Response) {
  res.json(await worksheetService.listWorksheets(currentUser(req), req.params.id, req.query as never));
}
export async function get(req: Request, res: Response) {
  res.json({ worksheet: await worksheetService.getWorksheet(currentUser(req), req.params.id) });
}
export async function update(req: Request, res: Response) {
  res.json({ worksheet: await worksheetService.updateWorksheet(currentUser(req), req.params.id, req.body) });
}
export async function pdf(req: Request, res: Response) {
  const buffer = new PassThrough();
  await worksheetService.worksheetPdf(currentUser(req), req.params.id, buffer);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="worksheet-${req.params.id}.pdf"`);
  buffer.pipe(res);
}
