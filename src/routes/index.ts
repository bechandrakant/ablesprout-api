import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import studentRoutes from './student.routes';
import { goalRouter, iepRouter, progressRouter } from './iep.routes';
import { analyticsRouter, messageRouter, worksheetRouter } from './misc.routes';

const api = Router();
api.use('/auth', authRoutes);
api.use('/users', userRoutes);
api.use('/students', studentRoutes);
api.use('/ieps', iepRouter);
api.use('/goals', goalRouter);
api.use('/progress', progressRouter);
api.use('/worksheets', worksheetRouter);
api.use('/messages', messageRouter);
api.use('/analytics', analyticsRouter);
export default api;
