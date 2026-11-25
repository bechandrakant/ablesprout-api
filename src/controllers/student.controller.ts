import { Request, Response } from 'express';
import * as studentService from '../services/student.service';
import * as assessmentService from '../services/assessment.service';
import { currentUser } from '../middleware/auth';

export async function list(req: Request, res: Response) {
  res.json(await studentService.listStudents(currentUser(req), req.query as never));
}
export async function create(req: Request, res: Response) {
  res.status(201).json({ student: await studentService.createStudent(currentUser(req), req.body) });
}
export async function get(req: Request, res: Response) {
  res.json(await studentService.getStudent(currentUser(req), req.params.id));
}
export async function update(req: Request, res: Response) {
  res.json({ student: await studentService.updateStudent(currentUser(req), req.params.id, req.body) });
}
export async function remove(req: Request, res: Response) {
  await studentService.deleteStudent(currentUser(req), req.params.id);
  res.status(204).end();
}
export async function addEducators(req: Request, res: Response) {
  res.json({ student: await studentService.addEducators(currentUser(req), req.params.id, req.body.educatorIds) });
}
export async function addParents(req: Request, res: Response) {
  res.json({ student: await studentService.addParents(currentUser(req), req.params.id, req.body.parentIds) });
}
export async function listAssessments(req: Request, res: Response) {
  res.json(await assessmentService.listAssessments(currentUser(req), req.params.id, req.query as never));
}
export async function createAssessment(req: Request, res: Response) {
  res
    .status(201)
    .json({ assessment: await assessmentService.createAssessment(currentUser(req), req.params.id, req.body) });
}
