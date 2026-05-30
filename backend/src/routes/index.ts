import type { Application } from 'express';
import authRouter from './auth';
import portfoliosRouter from './portfolios';
import tradesRouter from './trades';
import reportsRouter from './reports';
import adminRouter from './admin';
import forexRouter from './forex';
import groupsRouter from './groups';

export function setupRoutes(app: Application): void {
  app.use('/api/auth', authRouter);
  app.use('/api/portfolios', portfoliosRouter);
  app.use('/api/portfolios', tradesRouter);
  app.use('/api/portfolios', reportsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/forex', forexRouter);
  app.use('/api/groups', groupsRouter);
}
