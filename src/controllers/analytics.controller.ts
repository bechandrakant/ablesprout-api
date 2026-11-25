import { Request, Response } from 'express';
import * as analyticsService from '../services/analytics.service';
import { currentUser } from '../middleware/auth';

export async function school(req: Request, res: Response) {
  res.json(await analyticsService.schoolAnalytics(currentUser(req)));
}
export async function student(req: Request, res: Response) {
  res.json(await analyticsService.studentAnalytics(currentUser(req), req.params.id));
}
