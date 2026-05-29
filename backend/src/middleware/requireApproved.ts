import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';

export function requireApproved(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (user.status === 'pending') {
    res.status(403).json({ error: 'Account pending admin approval', code: 'PENDING_APPROVAL' });
    return;
  }
  if (user.status === 'rejected') {
    res.status(403).json({ error: 'Account access denied', code: 'ACCOUNT_REJECTED' });
    return;
  }
  next();
}
